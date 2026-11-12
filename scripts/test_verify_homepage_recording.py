import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


class RecordingTests(unittest.TestCase):
    def test_valid_recording_is_accepted_and_corruption_is_rejected(self):
        verifier = Path(__file__).with_name('verify-homepage-recording.mjs').resolve()
        digest = lambda data: hashlib.sha256(data).hexdigest()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'lm').mkdir()
            video, poster = b'video bytes', b'poster bytes'
            weights, state = 'a' * 64, 'b' * 64
            (root / 'lm/manifest.json').write_text(json.dumps({'sha256': weights, 'trainedStateSha256': state}))
            (root / 'homepage-model-loop.webm').write_bytes(video)
            (root / 'homepage-model-loop-poster.webp').write_bytes(poster)
            record = {'schemaVersion': 2, 'width': 1920, 'height': 1920, 'fps': 30,
                      'durationSeconds': 8.4, 'weightsSha256': weights, 'trainedStateSha256': state,
                      'bytes': len(video), 'posterBytes': len(poster),
                      'sha256': digest(video), 'posterSha256': digest(poster)}
            (root / 'homepage-model-loop.json').write_text(json.dumps(record))
            def verify():
                return subprocess.run(['node', str(verifier), str(root)], capture_output=True).returncode
            self.assertEqual(verify(), 0)
            (root / 'homepage-model-loop.webm').write_bytes(b'video bytez')
            self.assertNotEqual(verify(), 0)
            (root / 'homepage-model-loop.webm').write_bytes(video)
            (root / 'lm/manifest.json').write_text(json.dumps({'sha256': 'c' * 64, 'trainedStateSha256': state}))
            self.assertNotEqual(verify(), 0)


if __name__ == '__main__':
    unittest.main()
