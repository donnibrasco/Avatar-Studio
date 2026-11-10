"""CPU adapter checks; the inference model is deliberately not simulated as a GPU pass."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

import worker


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"STUDIO_BASE_URL": "https://studio.test/videolab"})
        self.environment.start()
        self.data = {"source_kind": "image", "source_url": "https://studio.test/videolab/api/media/avatars/" + "a" * 64 + ".jpg",
                     "audio_url": "https://studio.test/videolab/api/media/tts/voice.wav", "aspect_ratio": "16:9", "resolution": "480p",
                     "request_id": "test-job", "output_url": "https://studio.test/videolab/api/veo/output/test-job", "output_token": "b" * 64}

    def tearDown(self):
        self.environment.stop()

    def test_contract_rejects_untrusted_and_mismatched_media(self):
        self.assertEqual(worker.validate(self.data), self.data)
        signed = self.data["source_url"] + "?expires=1999999999&token=" + "c" * 64
        self.assertEqual(worker.validate({**self.data, "source_url": signed})["source_url"], signed)
        cases = [
            {"source_url": "https://attacker.test/videolab/api/media/avatars/" + "a" * 64 + ".jpg"},
            {"audio_url": "http://169.254.169.254/metadata"},
            {"source_url": self.data["source_url"] + "?redirect=http://localhost"},
            {"output_url": "https://studio.test/videolab/api/veo/output/another-job"},
            {"source_kind": "video"}, {"request_id": "../escape"}, {"resolution": "720p"}, {"output_token": ""},
            {"source_url": signed + "&token=" + "d" * 64},
            {"output_url": self.data["output_url"] + "?expires=1999999999&token=" + "c" * 64},
        ]
        for change in cases:
            with self.subTest(change=change), self.assertRaises(ValueError):
                worker.validate({**self.data, **change})

    def test_handler_processes_audio_uploads_receipt_and_cleans_after_failure(self):
        # Real FFmpeg input/normalization, fake inference and transport only.
        # This tests the adapter contract and cleanup, never MuseTalk visual quality.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            speech = root / "speech.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=24000",
                            "-t", "0.5", "-c:a", "pcm_s16le", str(speech)], check=True)
            rendered_directories = []
            uploads = []
            state = {"failure": False}

            def download(url, destination, limit):
                destination.write_bytes(speech.read_bytes() if "tts" in url else b"image fixture")

            class Runtime:
                def render(self, source, audio, kind, key, directory, aspect):
                    rendered_directories.append(directory)
                    metadata = worker.probe(audio)
                    self_seconds = float(metadata["format"]["duration"])
                    if not 0.57 <= self_seconds <= 0.59:
                        raise AssertionError("Speech padding was not applied")
                    output = directory / "video.mp4"
                    output.write_bytes(b"render fixture")
                    return output

            def put(url, data, headers, **kwargs):
                uploads.append((url, data.read(), headers, kwargs))
                digest = hashlib.sha256(uploads[-1][1]).hexdigest()
                return types.SimpleNamespace(status_code=200, json=lambda: {"uploaded": True, "sha256": "wrong" if state["failure"] else digest})

            transport = types.SimpleNamespace(put=put)
            with patch.dict("sys.modules", {"requests": transport}), patch.object(worker, "download", download), patch.object(worker, "RUNTIME", Runtime()):
                result = worker.handler({"input": self.data})
                self.assertTrue(result["uploaded"])
                self.assertEqual(result["duration"], 0.5)
                self.assertEqual(uploads[0][2]["Authorization"], "Bearer " + self.data["output_token"])
                self.assertFalse(uploads[0][3]["allow_redirects"])
                state["failure"] = True
                with self.assertRaisesRegex(RuntimeError, "receipt"):
                    worker.handler({"input": self.data})
                state["failure"] = False
                self.assertTrue(worker.handler({"input": self.data})["uploaded"])
            self.assertTrue(all(not directory.exists() for directory in rendered_directories))


if __name__ == "__main__":
    unittest.main()
