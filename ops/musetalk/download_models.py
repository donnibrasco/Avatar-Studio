"""Build-time downloads from the official MuseTalk dependency manifest."""
from pathlib import Path
import hashlib
import json
import urllib.request

from huggingface_hub import hf_hub_download
import gdown

ROOT = Path("/opt/MuseTalk")
MODELS = (
    ("TMElyralab/MuseTalk", "2bcb936e2fddb4d86db4c62fd45b387d0c061571", "musetalkV15/musetalk.json", "models/musetalkV15/musetalk.json"),
    ("TMElyralab/MuseTalk", "2bcb936e2fddb4d86db4c62fd45b387d0c061571", "musetalkV15/unet.pth", "models/musetalkV15/unet.pth"),
    ("stabilityai/sd-vae-ft-mse", "31f26fdeee1355a5c34592e401dd41e45d25a493", "config.json", "models/sd-vae/config.json"),
    ("stabilityai/sd-vae-ft-mse", "31f26fdeee1355a5c34592e401dd41e45d25a493", "diffusion_pytorch_model.bin", "models/sd-vae/diffusion_pytorch_model.bin"),
    ("openai/whisper-tiny", "169d4a4341b33bc18d8881c4b69c2e104e1cc0af", "config.json", "models/whisper/config.json"),
    ("openai/whisper-tiny", "169d4a4341b33bc18d8881c4b69c2e104e1cc0af", "pytorch_model.bin", "models/whisper/pytorch_model.bin"),
    ("openai/whisper-tiny", "169d4a4341b33bc18d8881c4b69c2e104e1cc0af", "preprocessor_config.json", "models/whisper/preprocessor_config.json"),
    ("yzd-v/DWPose", "1a7144101628d69ee7a3768d1ee3a094070dc388", "dw-ll_ucoco_384.pth", "models/dwpose/dw-ll_ucoco_384.pth"),
)


def main():
    import shutil
    manifest = []
    for repo, revision, filename, destination in MODELS:
        downloaded = hf_hub_download(repo, filename, revision=revision)
        target = ROOT / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(downloaded, target)
        manifest.append({"repo": repo, "revision": revision, "file": destination})
    face = ROOT / "models/face-parse-bisent"
    face.mkdir(parents=True, exist_ok=True)
    target = face / "79999_iter.pth"
    if not gdown.download(id="154JgKpzCPW82qINcVieuPH3fZ2e0P812", output=str(target), quiet=False):
        raise RuntimeError("Face parsing model download failed")
    urllib.request.urlretrieve("https://download.pytorch.org/models/resnet18-5c106cde.pth", face / "resnet18-5c106cde.pth")
    detector = ROOT / "musetalk/utils/face_detection/detection/sfd/s3fd.pth"
    urllib.request.urlretrieve("https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth", detector)
    # The upstream non-HF files have no immutable revision. Record their actual
    # hashes in the built image so that an image's weights can be audited.
    for path in (target, face / "resnet18-5c106cde.pth", detector):
        if path.stat().st_size < 1024 * 1024:
            raise RuntimeError(f"Incomplete model download: {path.name}")
        manifest.append({"file": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    (ROOT / "models/build-manifest.json").write_text(json.dumps(manifest, indent=2))
    shutil.rmtree("/opt/hf-cache", ignore_errors=True)


if __name__ == "__main__":
    main()
