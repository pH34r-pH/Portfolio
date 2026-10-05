#!/usr/bin/env python3
"""Regression tests for the Pages-only URL adapter."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from prepare_github_pages import normalized_base_path, prepare, rewrite_urls


class GitHubPagesPreparationTests(unittest.TestCase):
    def test_normalizes_repository_path_and_rejects_extra_segments(self) -> None:
        self.assertEqual(normalized_base_path("/Portfolio/"), "/Portfolio")
        with self.assertRaisesRegex(ValueError, "exactly one path segment"):
            normalized_base_path("/Portfolio/another")
        with self.assertRaisesRegex(ValueError, "absolute URL path"):
            normalized_base_path("Portfolio")

    def test_rewrites_internal_urls_and_preserves_external_urls(self) -> None:
        source = """<a href="/articles/a/">Article</a><img src=/assets/a.png>
<script>fetch('/publication.json');const origin='https://tyharbin.com/about/';const cdn='//cdn.example/a.js';</script>
<style>.x{background:url('/assets/bg.svg')} .y{mask:url(/assets/mask.svg)}</style>
<img srcset="/assets/one.webp 1x, /assets/two.webp 2x">
"""
        actual = rewrite_urls(source, "/Portfolio")
        self.assertIn('href="/Portfolio/articles/a/"', actual)
        self.assertIn('src=/Portfolio/assets/a.png', actual)
        self.assertIn("fetch('/Portfolio/publication.json')", actual)
        self.assertIn("https://tyharbin.com/about/", actual)
        self.assertIn("//cdn.example/a.js", actual)
        self.assertIn("url('/Portfolio/assets/bg.svg')", actual)
        self.assertIn("url(/Portfolio/assets/mask.svg)", actual)
        self.assertIn('srcset="/Portfolio/assets/one.webp 1x, /Portfolio/assets/two.webp 2x"', actual)

    def test_prepares_copy_without_touching_immutable_notebook_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "bundle"
            output = root / "pages-site"
            (source / "articles" / "article").mkdir(parents=True)
            (source / "publication" / "notebooks").mkdir(parents=True)
            (source / "publication.json").write_text("{}", encoding="utf-8")
            (source / "index.html").write_text('<a href="/articles/article/">Read</a>', encoding="utf-8")
            (source / "articles" / "article" / "index.html").write_text(
                '<a href="/article-exports/article.pdf">PDF</a>', encoding="utf-8"
            )
            notebook_bytes = b'{"cells":[{"source":["print(1)\\n"]}]}'
            (source / "publication" / "notebooks" / "example.ipynb").write_bytes(notebook_bytes)
            (source / "assets.bin").write_bytes(b"\x00\x01")

            changed = prepare(source, output, "/Portfolio")

            self.assertEqual(changed, 2)
            self.assertIn('/Portfolio/articles/article/', (output / "index.html").read_text(encoding="utf-8"))
            self.assertIn('/Portfolio/article-exports/article.pdf',
                          (output / "articles" / "article" / "index.html").read_text(encoding="utf-8"))
            self.assertEqual((output / "publication" / "notebooks" / "example.ipynb").read_bytes(), notebook_bytes)
            self.assertEqual((output / "assets.bin").read_bytes(), b"\x00\x01")
            self.assertTrue((output / ".nojekyll").is_file())
            self.assertEqual((source / "index.html").read_text(encoding="utf-8"), '<a href="/articles/article/">Read</a>')

    def test_rejects_symlinked_bundle_content(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "bundle"
            source.mkdir()
            (source / "publication.json").write_text("{}", encoding="utf-8")
            (source / "index.html").write_text("<main></main>", encoding="utf-8")
            target = root / "secret.txt"
            target.write_text("must not be followed", encoding="utf-8")
            (source / "linked.txt").symlink_to(target)
            with self.assertRaisesRegex(ValueError, "cannot contain symlinks"):
                prepare(source, root / "out", "/Portfolio")

    def test_rejects_project_escape(self) -> None:
        with self.assertRaisesRegex(ValueError, "escapes the Pages project path"):
            rewrite_urls("<a href=\"/../../private/\">bad</a>", "/Portfolio")
        with self.assertRaisesRegex(ValueError, "escapes the Pages project path"):
            rewrite_urls("<a href=\"/%2e%2e/private/\">bad</a>", "/Portfolio")

    def test_refuses_custom_domain_binding_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "bundle"
            source.mkdir()
            (source / "publication.json").write_text("{}", encoding="utf-8")
            (source / "CNAME").write_text("tyharbin.com\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "must not contain a CNAME"):
                prepare(source, Path(tmp) / "out", "/Portfolio")


if __name__ == "__main__":
    unittest.main()
