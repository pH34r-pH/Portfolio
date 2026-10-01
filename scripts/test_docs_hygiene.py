"""Behavioral fixtures for the bounded documentation hygiene checker."""

import tempfile
import unittest
from pathlib import Path

from docs_hygiene import check_paths


class DocumentationHygieneTests(unittest.TestCase):
    def test_broken_local_reference_is_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            doc = root / "guide.md"
            doc.write_text("[missing](missing.md)\n", encoding="utf-8")
            errors = check_paths(root, ["guide.md"], {"guide.md"})
            self.assertTrue(any("broken local link" in error for error in errors))

    def test_unapproved_temp_and_build_artifacts_are_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact = root / "dist" / "preview.txt"
            artifact.parent.mkdir()
            artifact.write_text("preview\n", encoding="utf-8")
            errors = check_paths(root, ["dist/preview.txt"])
            self.assertTrue(any("temporary/build artifact" in error for error in errors))

    def test_new_living_document_needs_descriptive_name(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            doc = root / "draft.md"
            doc.write_text("# Draft\n", encoding="utf-8")
            errors = check_paths(root, ["draft.md"], {"draft.md"})
            self.assertTrue(any("descriptive name" in error for error in errors))

    def test_explicit_boundaries_are_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "publication" / "compiler-projection.lock.json"
            path.parent.mkdir()
            path.write_text("{}\n", encoding="utf-8")
            self.assertEqual([], check_paths(root, [path.relative_to(root)]))


if __name__ == "__main__":
    unittest.main()
