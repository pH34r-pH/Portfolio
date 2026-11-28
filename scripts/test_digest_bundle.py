"""Preserve the publication producer's digest across host path implementations."""

from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from digest_bundle import digest_tree


class BundleDigestTests(unittest.TestCase):
    def test_case_sensitive_component_order_matches_the_producer(self):
        ordered = [("Z.txt", b"first"), ("a.txt", b"second"), ("dir/entry", b"third"), ("dir.txt", b"fourth")]
        expected = sha256(b"fleet-bundle-v1\0")
        with TemporaryDirectory() as directory:
            root = Path(directory)
            for name, data in reversed(ordered):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            for name, data in ordered:
                encoded = name.encode("utf-8")
                expected.update(len(encoded).to_bytes(4, "big"))
                expected.update(encoded)
                expected.update(len(data).to_bytes(8, "big"))
                expected.update(sha256(data).digest())
            self.assertEqual(digest_tree(root), expected.hexdigest())
            (root / "Z.txt").write_bytes(b"FIRST")
            self.assertNotEqual(digest_tree(root), expected.hexdigest())
