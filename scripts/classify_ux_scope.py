#!/usr/bin/env python3
"""Recognize narrowly scoped, text-only PR changes for review audits."""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
import subprocess


TEXT_ONLY_PAGES = frozenset({
    'site/about/index.html', 'site/resume/index.html',
    'site/projects/index.html', 'site/projects/long-haul/index.html',
    'site/projects/experiment-compiler/index.html',
})
SENSITIVE = frozenset({'script', 'style', 'template', 'textarea'})
ARTICLE_AUDITS = frozenset({
    'scripts/article-lm-browser-audit.mjs',
    'scripts/article-model-sticky-audit.mjs',
})


class Structure(HTMLParser):
    """Keep markup and active contents; discard only ordinary prose text."""
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.tokens = []
        self.sensitive = []

    def handle_starttag(self, tag, attrs):
        self.tokens.append(('start', tag, tuple(attrs)))
        if tag in SENSITIVE:
            self.sensitive.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.tokens.append(('empty', tag, tuple(attrs)))

    def handle_endtag(self, tag):
        self.tokens.append(('end', tag))
        if self.sensitive and self.sensitive[-1] == tag:
            self.sensitive.pop()

    def handle_data(self, data):
        if self.sensitive:
            self.tokens.append(('data', data))

    def handle_comment(self, data):
        self.tokens.append(('comment', data))

    def handle_decl(self, decl):
        self.tokens.append(('declaration', decl))

    def handle_pi(self, data):
        self.tokens.append(('processing', data))

    def unknown_decl(self, data):
        self.tokens.append(('unknown-declaration', data))

    def handle_entityref(self, name):
        if self.sensitive:
            self.tokens.append(('entity', name))

    def handle_charref(self, name):
        if self.sensitive:
            self.tokens.append(('character', name))


def structure(source: str):
    parser = Structure()
    parser.feed(source)
    parser.close()
    if parser.sensitive:
        raise ValueError('unclosed active-content element')
    return parser.tokens


def text_only_change(path: str, before: str, after: str) -> bool:
    return path in TEXT_ONLY_PAGES and structure(before) == structure(after)


def git(*args: str) -> bytes:
    return subprocess.check_output(['git', *args], stderr=subprocess.DEVNULL)


def documentation_path(path: str) -> bool:
    return path == 'README.md' or (path.startswith('docs/') and path.endswith('.md'))


def classify_paths(paths: list[str], base: str, head: str) -> str | None:
    if not paths:
        return None
    for predicate, result in ((documentation_path, 'documentation'),
                              (ARTICLE_AUDITS.__contains__, 'article-audit')):
        if all(predicate(path) for path in paths):
            for path in paths:
                git('show', f'{base}:{path}')
                git('show', f'{head}:{path}')
            return result
    if any(path not in TEXT_ONLY_PAGES for path in paths):
        return None
    for path in paths:
        before = git('show', f'{base}:{path}').decode('utf-8')
        after = git('show', f'{head}:{path}').decode('utf-8')
        if not text_only_change(path, before, after):
            return None
    return 'page-text'


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--event', required=True)
    parser.add_argument('base')
    parser.add_argument('head')
    args = parser.parse_args()
    if args.event != 'pull_request':
        return 1
    try:
        paths = git('diff', '--name-only', '-z', '--no-renames', args.base, args.head).decode().split('\0')
        paths = [path for path in paths if path]
        scope = classify_paths(paths, args.base, args.head)
    except (subprocess.CalledProcessError, UnicodeError, ValueError):
        return 1
    if scope is None:
        return 1
    print(scope)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
