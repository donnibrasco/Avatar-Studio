"""Check a saved smoke-test export without calling a paid provider.

These checks establish media integrity and preservation of the supplied speech.
They do not measure perceptual lip-sync quality or establish production readiness.
"""
import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys


def command(*args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, timeout=120).stdout


def pcm(path):
    samples = array("h")
    samples.frombytes(command("ffmpeg", "-v", "error", "-i", str(path),
                             "-map", "0:a:0", "-ar", "24000", "-ac", "1",
                             "-f", "s16le", "pipe:1"))
    if sys.byteorder != "little":
        samples.byteswap()
    return samples


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--aspect", choices=("16:9", "9:16"), required=True)
    args = parser.parse_args()
    directory = Path(args.directory)
    output = directory / "output.mp4"
    metadata = json.loads(command("ffprobe", "-v", "error", "-count_frames",
                                  "-show_streams", "-show_format", "-of", "json", str(output)))
    video = next(s for s in metadata["streams"] if s["codec_type"] == "video")
    audio = next(s for s in metadata["streams"] if s["codec_type"] == "audio")
    expected = (480, 854) if args.aspect == "9:16" else (854, 480)
    source_pcm, exported_pcm = pcm(Path(args.audio)), pcm(output)
    count = min(len(source_pcm), len(exported_pcm))
    assert count > 0, "No decoded speech"
    source_energy = sum(x*x for x in source_pcm[:count])
    output_energy = sum(x*x for x in exported_pcm[:count])
    correlation = sum(x*y for x, y in zip(source_pcm[:count], exported_pcm[:count])) / max(1, math.sqrt(source_energy * output_energy))
    rms = math.sqrt(output_energy/count) / 32768
    frame_lines = command("ffmpeg", "-v", "error", "-i", str(output), "-vf", "fps=5",
                          "-an", "-f", "framemd5", "pipe:1").decode().splitlines()
    frame_hashes = [line.split(",")[-1].strip() for line in frame_lines if line and not line.startswith("#")]
    raw = output.read_bytes()
    duration = float(metadata["format"]["duration"])
    source_duration = len(source_pcm)/24000
    command("ffmpeg", "-v", "error", "-xerror", "-i", str(output), "-f", "null", "-")
    checks = {
        "expected_dimensions": (video["width"], video["height"]) == expected,
        "h264_aac": video["codec_name"] == "h264" and audio["codec_name"] == "aac",
        "fps_25": video["r_frame_rate"] == "25/1",
        "duration_matches_speech": abs(duration-source_duration) <= 0.08,
        "audio_video_durations_match": abs(float(video["duration"])-float(audio["duration"])) <= 0.08,
        "frame_count_matches_duration": abs(int(video["nb_read_frames"])-source_duration*25) <= 1,
        "speech_not_silent": rms > 0.001,
        "supplied_audio_preserved": correlation > 0.95,
        "animated_frames": len(set(frame_hashes)) > 1,
        "mp4_fast_start": 0 < raw.find(b"moov") < raw.find(b"mdat"),
        "full_decode": True,
    }
    result = {
        "checks": checks, "all_passed": all(checks.values()),
        "width": video["width"], "height": video["height"],
        "duration_seconds": duration, "source_audio_seconds": source_duration,
        "decoded_video_frames": int(video["nb_read_frames"]),
        "audio_waveform_similarity": correlation, "audio_rms": rms,
        "audio_peak": max(abs(x) for x in exported_pcm)/32768,
        "sampled_frames": len(frame_hashes), "distinct_sampled_frames": len(set(frame_hashes)),
        "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
        "limitations": ["No perceptual lip-sync score", "No human listening assessment", "No load or endurance test"],
    }
    (directory / "media-verification.json").write_text(json.dumps(result, indent=2)+"\n")
    print(json.dumps(result, indent=2))
    if not result["all_passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
