"""Behavioral fixtures for the bounded documentation hygiene checker."""

import tempfile
import unittest
from pathlib import Path
import subprocess

from docs_hygiene import _git_paths, check_paths


class DocumentationHygieneTests(unittest.TestCase):
    def test_unapproved_temp_and_build_artifacts_are_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact = root / "dist" / "preview.txt"
            artifact.parent.mkdir()
            artifact.write_text("preview\n", encoding="utf-8")
            errors = check_paths(root, ["dist/preview.txt"])
            self.assertTrue(any("temporary/build artifact" in error for error in errors))

    def test_cache_is_not_exempt_under_evidence_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact = root / "site" / "data" / "cache" / "new.json"
            artifact.parent.mkdir(parents=True)
            artifact.write_text("{}\n", encoding="utf-8")
            errors = check_paths(root, ["site/data/cache/new.json"])
            self.assertTrue(any("temporary/build artifact" in error for error in errors))

    def test_new_living_document_needs_descriptive_name(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs").mkdir()
            doc = root / "docs" / "draft.md"
            doc.write_text("# Draft\n", encoding="utf-8")
            errors = check_paths(root, ["docs/draft.md"], {"docs/draft.md"})
            self.assertTrue(any("descriptive name" in error for error in errors))

    def test_architecture_name_is_descriptive_and_issue_number_is_not(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs").mkdir()
            for name in ("architecture.md", "issue-123.md"):
                (root / "docs" / name).write_text("# Document\n", encoding="utf-8")
            self.assertEqual([], check_paths(root, ["docs/architecture.md"], {"docs/architecture.md"}))
            errors = check_paths(root, ["docs/issue-123.md"], {"docs/issue-123.md"})
            self.assertTrue(any("descriptive name" in error for error in errors))

    def test_git_rename_destination_is_checked_as_new(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True, text=True,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()
            git("init", "--quiet")
            git("config", "user.email", "docs@example.invalid")
            git("config", "user.name", "Docs Test")
            (root / "docs").mkdir()
            (root / "docs" / "guide.md").write_text("# Guide\n", encoding="utf-8")
            git("add", "docs/guide.md")
            git("commit", "--quiet", "-m", "initial")
            base = git("rev-parse", "HEAD")
            git("mv", "docs/guide.md", "docs/issue-123.md")
            git("commit", "--quiet", "-m", "rename")
            changed, new_paths = _git_paths(root, base)
            self.assertIn("docs/issue-123.md", changed)
            self.assertIn("docs/issue-123.md", new_paths)
            errors = check_paths(root, changed, new_paths)
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
