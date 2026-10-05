#!/usr/bin/env python3
"""Regression tests for the Pages-only URL adapter."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from prepare_github_pages import (
    normalized_base_path,
    prepare,
    rewrite_html_urls,
    rewrite_javascript_urls,
    rewrite_json_text,
    rewrite_urls,
)


class GitHubPagesPreparationTests(unittest.TestCase):
    def test_normalizes_repository_path_and_rejects_extra_segments(self) -> None:
        self.assertEqual(normalized_base_path("/Portfolio/"), "/Portfolio")
        with self.assertRaisesRegex(ValueError, "exactly one path segment"):
            normalized_base_path("/Portfolio/another")
        with self.assertRaisesRegex(ValueError, "absolute URL path"):
            normalized_base_path("Portfolio")

    def test_rewrites_internal_urls_and_preserves_external_urls(self) -> None:
        source = """<a href="/articles/a/">Article</a><img src=/assets/a.png>
<link rel="canonical" href="https://tyharbin.com/articles/a/">
<style>.x{background:url('/assets/bg.svg')} .y{mask:url(/assets/mask.svg)}</style>
<img srcset="/assets/one.webp 1x, /assets/two.webp 2x">
"""
        actual = rewrite_urls(source, "/Portfolio")
        self.assertIn('href="/Portfolio/articles/a/"', actual)
        self.assertIn('src=/Portfolio/assets/a.png', actual)
        self.assertIn('href="https://tyharbin.com/articles/a/"', actual)
        self.assertIn("url('/Portfolio/assets/bg.svg')", actual)
        self.assertIn("url(/Portfolio/assets/mask.svg)", actual)
        self.assertIn('srcset="/Portfolio/assets/one.webp 1x, /Portfolio/assets/two.webp 2x"', actual)

    def test_html_rewrites_scripts_without_touching_regexes_or_self_closing_markup(self) -> None:
        source = '''<html><script>fetch('/publication.json');const re=/"theme"\\s*:\\s*"([^"]+)"/g;const external='https://tyharbin.com/about/';</script>
<svg><path d="M0 0"/></svg><img src="/assets/logo.svg"></html>'''
        actual = rewrite_html_urls(source, "/Portfolio")
        self.assertIn("fetch('/Portfolio/publication.json')", actual)
        self.assertIn(r're=/"theme"\s*:\s*"([^"]+)"/g', actual)
        self.assertIn("https://tyharbin.com/about/", actual)
        self.assertIn('<path d="M0 0"/>', actual)
        self.assertIn('src="/Portfolio/assets/logo.svg"', actual)

    def test_json_paths_rewrite_without_reformatting_unaffected_documents(self) -> None:
        self.assertEqual(rewrite_json_text('{"assets":["/img/a.svg","https://cdn.example/a"]}', "/Portfolio"),
                         '{"assets":["/Portfolio/img/a.svg","https://cdn.example/a"]}')
        self.assertEqual(rewrite_json_text('{ "enabled": true }', "/Portfolio"), '{ "enabled": true }')

    def test_markup_rewrite_preserves_self_closing_svg_files(self) -> None:
        source = '<svg><path d="M0 0"/><image href="/assets/a.png"/></svg>'
        self.assertEqual(
            rewrite_urls(source, "/Portfolio"),
            '<svg><path d="M0 0"/><image href="/Portfolio/assets/a.png"/></svg>',
        )

    def test_javascript_rewrite_touches_strings_but_preserves_regexes_and_separators(self) -> None:
        source = r'''const entry={url:"/assets/app.js"};
const separator="/";
const request=fetch("/publication.json");
const rootRequest=fetch("/");
const themeRegex=/\\"theme\\"\\s*:\\s*\\"([^\\"]+)\\"/g;
const bootstrapRegex=/^"([^\"]|"")*"/;
const channel=new BroadcastChannel("/sw-api.v1");
const regexSource="/(lab|tree|notebooks)\\/?";
const markup=`<img src="/assets/logo.svg"><svg><circle cx="1"/></svg> ${fetch("/assets/lab.json")}`;
// fetch("/must-stay-a-comment.json")
'''
        actual = rewrite_javascript_urls(source, "/Portfolio")
        self.assertIn('url:"/Portfolio/assets/app.js"', actual)
        self.assertIn('separator="/"', actual)
        self.assertIn('fetch("/Portfolio/publication.json")', actual)
        self.assertIn('fetch("/Portfolio/")', actual)
        self.assertIn(r'themeRegex=/\\"theme\\"\\s*:\\s*\\"([^\\"]+)\\"/g', actual)
        self.assertIn(r'bootstrapRegex=/^"([^\"]|"")*"/', actual)
        self.assertIn('new BroadcastChannel("/sw-api.v1")', actual)
        self.assertIn(r'regexSource="/(lab|tree|notebooks)\\/?"', actual)
        self.assertIn('<img src="/Portfolio/assets/logo.svg">', actual)
        self.assertIn('<svg><circle cx="1"/></svg>', actual)
        self.assertIn('fetch("/Portfolio/assets/lab.json")', actual)
        self.assertIn('// fetch("/must-stay-a-comment.json")', actual)

    def test_jupyter_heartbeat_stays_inside_the_project_lab_service_worker_scope(self) -> None:
        source = 'fetch("/api/service-worker-heartbeat"); if (path === "/api/service-worker-heartbeat") {}'
        actual = rewrite_javascript_urls(source, "/Portfolio", jupyter_base_path="/Portfolio/lab")
        self.assertEqual(
            actual,
            'fetch("/Portfolio/lab/api/service-worker-heartbeat"); '
            'if (path === "/Portfolio/lab/api/service-worker-heartbeat") {}',
        )

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

    def test_normalizes_root_traversal_without_leaving_project_path(self) -> None:
        actual = rewrite_urls(
            '<a href="/..">root</a><a href="/../../private/">literal</a>'
            '<a href="/%2e%2e/private/?view=full#part">encoded</a>'
            '<a href="/Portfolio/../articles/">already prefixed</a>',
            "/Portfolio",
        )
        self.assertEqual(
            actual,
            '<a href="/Portfolio/">root</a><a href="/Portfolio/private/">literal</a>'
            '<a href="/Portfolio/private/?view=full#part">encoded</a>'
            '<a href="/Portfolio/articles/">already prefixed</a>',
        )
        self.assertNotIn("/Portfolio/..", actual)

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
