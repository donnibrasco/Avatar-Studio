"""One GPU, one job at a time. Inference follows pinned MuseTalk 1.5 APIs.

Only the adapter and media processing can be tested without the GPU dependencies.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time
from urllib.parse import urlparse, parse_qsl

FPS = 25
ROOT = Path(os.environ.get("MUSETALK_ROOT", "/opt/MuseTalk"))
LOCK = threading.Lock()
RUNTIME = None


def media_url(value, expected_path):
    base = urlparse(os.environ.get("STUDIO_BASE_URL", ""))
    parsed = urlparse(value if isinstance(value, str) else "")
    if (base.scheme != "https" or not base.netloc or base.path.rstrip("/") != "/videolab"
            or parsed.scheme != "https" or parsed.netloc != base.netloc
            or parsed.username or parsed.password or parsed.fragment
            or not re.fullmatch(expected_path, parsed.path)):
        raise ValueError("Media must use the configured Studio HTTPS origin and cached path")
    if parsed.query:
        pairs = parse_qsl(parsed.query, keep_blank_values=True)
        params = dict(pairs)
        if (not parsed.path.startswith("/videolab/api/media/") or len(pairs) != 2
                or set(params) != {"expires", "token"}
                or not re.fullmatch(r"\d{10}", params["expires"])
                or not re.fullmatch(r"[a-f0-9]{64}", params["token"])):
            raise ValueError("Only signed Studio media URLs are accepted")
    return value


def validate(data):
    if not isinstance(data, dict):
        raise ValueError("Supply an input object")
    kind = data.get("source_kind")
    if kind not in ("image", "video") or data.get("resolution") != "480p" or data.get("aspect_ratio") not in ("16:9", "9:16"):
        raise ValueError("Use an image or video and 480p landscape or portrait output")
    request_id = data.get("request_id", "")
    if not isinstance(request_id, str) or not re.fullmatch(r"[a-zA-Z0-9-]{1,80}", request_id):
        raise ValueError("Invalid request ID")
    token = data.get("output_token", "")
    if not isinstance(token, str) or not re.fullmatch(r"[a-f0-9]{64}", token):
        raise ValueError("Output authorization is required")
    folder, extension = ("avatars", r"(?:png|jpe?g|webp)") if kind == "image" else ("sources", "mp4")
    media_url(data.get("source_url"), rf"/videolab/api/media/{folder}/[a-f0-9]{{64}}\.{extension}")
    media_url(data.get("audio_url"), r"/videolab/api/media/tts/[a-zA-Z0-9_-]+\.(?:wav|mp3)")
    media_url(data.get("output_url"), rf"/videolab/api/veo/output/{re.escape(request_id)}")
    return data


def download(url, destination, limit):
    import requests
    with requests.get(url, stream=True, timeout=(10, 60), allow_redirects=False) as response:
        if response.status_code != 200:
            raise RuntimeError(f"Studio media download failed (HTTP {response.status_code})")
        size = 0
        with destination.open("wb") as output:
            for chunk in response.iter_content(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise ValueError("Studio media exceeds worker size limit")
                output.write(chunk)
        if not size:
            raise ValueError("Studio media is empty")


def probe(file):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(file)],
                            capture_output=True, text=True, check=True, timeout=30)
    return json.loads(result.stdout)


def run(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", *map(str, args)], check=True, timeout=180)


class MuseTalk:
    def __init__(self):
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError("MuseTalk requires a CUDA GPU; CPU fallback is disabled")
        from transformers import WhisperModel
        from musetalk.utils.utils import load_all_model
        from musetalk.utils.audio_processor import AudioProcessor
        from musetalk.utils.face_parsing import FaceParsing
        from musetalk.utils.preprocessing import get_landmark_and_bbox
        self.landmarks = get_landmark_and_bbox
        self.device = torch.device("cuda:0")
        self.vae, self.unet, self.pe = load_all_model(device=self.device)
        self.vae.vae = self.vae.vae.half().to(self.device).eval()
        self.unet.model = self.unet.model.half().to(self.device).eval()
        self.pe = self.pe.half().to(self.device).eval()
        self.dtype = self.unet.model.dtype
        self.timesteps = torch.tensor([0], device=self.device)
        self.audio = AudioProcessor(feature_extractor_path="models/whisper")
        self.whisper = WhisperModel.from_pretrained("models/whisper", local_files_only=True).to(device=self.device, dtype=self.dtype).eval()
        self.whisper.requires_grad_(False)
        self.parser = FaceParsing(left_cheek_width=90, right_cheek_width=90)
        self.cached_key, self.prepared = None, None

    def prepare(self, source, kind, key, directory, aspect):
        import cv2
        from musetalk.utils.blending import get_image_prepare_material
        if key == self.cached_key:
            return self.prepared
        # Evict before allocating the next avatar. Cache lives only on this warm worker.
        self.cached_key, self.prepared = None, None
        width, height = (480, 854) if aspect == "9:16" else (854, 480)
        frames_dir = directory / "frames"
        frames_dir.mkdir()
        metadata = probe(source)
        video = next((s for s in metadata["streams"] if s["codec_type"] == "video"), {})
        pixels = video.get("width", 0) * video.get("height", 0)
        if not 0 < pixels <= 8388608:
            raise ValueError("Use an avatar image or video up to 8 megapixels")
        vf = f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1"
        args = ["-i", source, "-an", "-vf", vf, "-r", FPS, "-threads", 2]
        if kind == "image":
            args += ["-frames:v", 1]
        else:
            duration = float(metadata.get("format", {}).get("duration", 0))
            if not math.isfinite(duration) or not 0.2 <= duration <= 60:
                raise ValueError("Avatar video must be up to 60 seconds and 8 megapixels")
            args += ["-t", 60, "-frames:v", 1500]
        run(*args, frames_dir / "%08d.png")
        paths = sorted(str(p) for p in frames_dir.glob("*.png"))
        if not paths:
            raise ValueError("No avatar frames were decoded")
        coords, frames = self.landmarks(paths, 0)
        if len(coords) != len(frames):
            raise ValueError("Avatar frame and face counts disagree")
        latents, masks, boxes, adjusted = [], [], [], []
        for bbox, frame in zip(coords, frames):
            x1, y1, x2, y2 = map(int, bbox)
            y2 = min(y2 + 10, frame.shape[0])
            if not (0 <= x1 < x2 <= frame.shape[1] and 0 <= y1 < y2 <= frame.shape[0]) or tuple(bbox) == (0, 0, 0, 0):
                raise ValueError("Keep one unobstructed face visible throughout the avatar clip")
            bbox = (x1, y1, x2, y2)
            crop = cv2.resize(frame[y1:y2, x1:x2], (256, 256), interpolation=cv2.INTER_LANCZOS4)
            latents.append(self.vae.get_latents_for_unet(crop).cpu())
            mask, box = get_image_prepare_material(frame, bbox, fp=self.parser, mode="jaw")
            adjusted.append(bbox)
            masks.append(mask)
            boxes.append(box)
        self.prepared = (frames, adjusted, latents, masks, boxes)
        self.cached_key = key
        return self.prepared

    def render(self, source, audio, kind, key, directory, aspect):
        import cv2
        import numpy as np
        import torch
        from musetalk.utils.utils import datagen
        from musetalk.utils.blending import get_image_blending
        with torch.inference_mode():
            frames, coords, latents, masks, boxes = self.prepare(source, kind, key, directory, aspect)
            features, length = self.audio.get_audio_feature(str(audio), weight_dtype=self.dtype)
            chunks = self.audio.get_whisper_chunk(features, self.device, self.dtype, self.whisper, length, fps=FPS)
            if len(chunks) < 1:
                raise ValueError("Speech was too short")
            # The upstream reference repeats source motion forwards then backwards.
            cycle = list(range(len(frames))) + list(reversed(range(len(frames))))
            output_frames = directory / "output"
            output_frames.mkdir()
            idx = 0
            for whisper_batch, latent_batch in datagen(chunks, [latents[i] for i in cycle], batch_size=4, device=self.device):
                audio_features = self.pe(whisper_batch.to(self.device))
                predicted = self.unet.model(latent_batch.to(device=self.device, dtype=self.dtype), self.timesteps,
                                            encoder_hidden_states=audio_features).sample
                for mouth in self.vae.decode_latents(predicted.to(dtype=self.vae.vae.dtype)):
                    i = cycle[idx % len(cycle)]
                    x1, y1, x2, y2 = coords[i]
                    mouth = cv2.resize(mouth.astype(np.uint8), (x2-x1, y2-y1))
                    frame = get_image_blending(frames[i].copy(), mouth, coords[i], masks[i], boxes[i])
                    if not cv2.imwrite(str(output_frames / f"{idx:08d}.png"), frame):
                        raise RuntimeError("Could not write rendered frame")
                    idx += 1
            if idx != len(chunks):
                raise RuntimeError("Incomplete avatar frame sequence")
            output = directory / "video.mp4"
            run("-framerate", FPS, "-i", output_frames / "%08d.png", "-an", "-c:v", "libx264",
                "-preset", "fast", "-crf", 20, "-threads", 2, "-pix_fmt", "yuv420p", "-movflags", "+faststart", output)
            return output


def handler(job):
    global RUNTIME
    data = validate(job.get("input"))
    started = time.monotonic()
    import requests
    with LOCK, tempfile.TemporaryDirectory(prefix="studio-musetalk-") as temporary:
        directory = Path(temporary)
        source = directory / ("source.png" if data["source_kind"] == "image" else "source.mp4")
        audio_input, audio = directory / "speech.input", directory / "speech.wav"
        download(data["source_url"], source, 30 * 1024 * 1024)
        download(data["audio_url"], audio_input, 20 * 1024 * 1024)
        metadata = probe(audio_input)
        seconds = float(metadata.get("format", {}).get("duration", 0))
        if not any(s["codec_type"] == "audio" for s in metadata["streams"]) or not math.isfinite(seconds) or not 0.2 <= seconds <= 60:
            raise ValueError("Use speech between 0.2 and 60 seconds")
        # Silence padding gives floor(frame count) enough frames for the exact voice export.
        run("-i", audio_input, "-map", "0:a:0", "-af", "apad=pad_dur=0.08", "-ar", 16000, "-ac", 1, "-c:a", "pcm_s16le", audio)
        if RUNTIME is None:
            os.chdir(ROOT)
            RUNTIME = MuseTalk()
        key = hashlib.sha256(source.read_bytes() + data["aspect_ratio"].encode()).hexdigest()
        output = RUNTIME.render(source, audio, data["source_kind"], key, directory, data["aspect_ratio"])
        if output.stat().st_size > 50 * 1024 * 1024:
            raise RuntimeError("Rendered video exceeds 50 MB")
        digest = hashlib.sha256(output.read_bytes()).hexdigest()
        with output.open("rb") as video:
            response = requests.put(data["output_url"], data=video, headers={"Authorization": "Bearer " + data["output_token"],
                                    "Content-Type": "video/mp4"}, timeout=(10, 120), allow_redirects=False)
        if response.status_code != 200:
            raise RuntimeError(f"Studio output upload failed (HTTP {response.status_code})")
        receipt = response.json()
        if receipt.get("uploaded") is not True or receipt.get("sha256") != digest:
            raise RuntimeError("Studio output receipt did not match")
        telemetry = {"handler_seconds": round(time.monotonic() - started, 3)}
        try:
            import torch
            telemetry["peak_gpu_memory_mib"] = round(torch.cuda.max_memory_allocated() / 1048576, 1)
        except ImportError:
            pass
        return {"uploaded": True, "sha256": digest, "duration": seconds, "fps": FPS, **telemetry}


if __name__ == "__main__":
    import runpod
    # Acquire the models before declaring the queue worker ready.
    os.chdir(ROOT)
    RUNTIME = MuseTalk()
    print("[musetalk-worker] CUDA models loaded; ready for jobs", flush=True)
    runpod.serverless.start({"handler": handler})
