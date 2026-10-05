#!/usr/bin/env python3
"""Prepare an isolated project-path copy of a qualified Portfolio bundle for GitHub Pages."""

from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path
from urllib.parse import unquote, urlsplit


TEXT_SUFFIXES = {".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt", ".webmanifest", ".xml"}
MAX_PUBLISHED_BYTES = 1_000_000_000

# These forms cover quoted HTML/JS/JSON URLs, CSS url(...), and unquoted HTML
# URL attributes. Protocol-relative and absolute external URLs stay untouched.
QUOTED_ROOT_URL = re.compile(r"(?P<quote>[\"'`])/(?P<path>(?!/)[^\"'`\s]*)")
CSS_ROOT_URL = re.compile(r"(?P<prefix>url\(\s*)/(?P<path>(?!/)[^\"\')\s]*)", re.IGNORECASE)
UNQUOTED_ATTRIBUTE_URL = re.compile(
    r"(?P<attribute>\b(?:href|src|action|poster|content|data-[\w:-]+)=)/(?P<path>(?!/)[^\"'`\s>]*)",
    re.IGNORECASE,
)
SRCSET_ATTRIBUTE = re.compile(r"(?P<prefix>\bsrcset\s*=\s*)(?P<quote>[\"'])(?P<value>.*?)(?P=quote)", re.IGNORECASE)
SRCSET_ROOT_URL = re.compile(r"(?P<prefix>(?:^|,\s*))/((?!/)[^\s,]+)")


def normalized_base_path(value: str) -> str:
    if not value.startswith("/"):
        raise ValueError("Base path must be an absolute URL path, such as /Portfolio")
    parsed = urlsplit(value)
    pieces = [piece for piece in parsed.path.split("/") if piece]
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or len(pieces) != 1:
        raise ValueError("GitHub Pages project base path must contain exactly one path segment")
    if pieces[0] in {".", ".."} or not re.fullmatch(r"[A-Za-z0-9._~-]+", pieces[0]):
        raise ValueError("GitHub Pages base path contains an unsupported repository name")
    return "/" + pieces[0]


def prefixed_url(base_path: str, path: str) -> str:
    decoded_parts = unquote(path).split("/")
    if any(part == ".." for part in decoded_parts):
        raise ValueError(f"Root-relative URL escapes the Pages project path: /{path}")
    relative = path.lstrip("/")
    base_segment = base_path.lstrip("/")
    if relative == base_segment or relative.startswith(base_segment + "/"):
        return "/" + relative
    return base_path + "/" + relative


def rewrite_urls(content: str, base_path: str) -> str:
    def replace_quoted(match: re.Match[str]) -> str:
        return match.group("quote") + prefixed_url(base_path, match.group("path"))

    def replace_css(match: re.Match[str]) -> str:
        return match.group("prefix") + prefixed_url(base_path, match.group("path"))

    def replace_srcset(match: re.Match[str]) -> str:
        value = SRCSET_ROOT_URL.sub(
            lambda item: item.group("prefix") + prefixed_url(base_path, item.group(2)),
            match.group("value"),
        )
        return match.group("prefix") + match.group("quote") + value + match.group("quote")

    def replace_attribute(match: re.Match[str]) -> str:
        return match.group("attribute") + prefixed_url(base_path, match.group("path"))

    rewritten = CSS_ROOT_URL.sub(replace_css, content)
    rewritten = SRCSET_ATTRIBUTE.sub(replace_srcset, rewritten)
    rewritten = QUOTED_ROOT_URL.sub(replace_quoted, rewritten)
    return UNQUOTED_ATTRIBUTE_URL.sub(replace_attribute, rewritten)


def tree_bytes(root: Path) -> int:
    total = 0
    for path in root.rglob("*"):
        if path.is_symlink():
            raise ValueError(f"GitHub Pages bundle cannot contain symlinks: {path}")
        if path.is_file():
            total += path.stat().st_size
    return total


def prepare(source: Path, destination: Path, base_path: str) -> int:
    base_path = normalized_base_path(base_path)
    if not source.is_dir() or source.is_symlink():
        raise ValueError("Source bundle must be a real directory")
    source = source.resolve()
    if destination.exists() or destination.is_symlink():
        raise ValueError("Destination must not already exist")
    # Reject symlinks and a domain-binding file before copying; the workflow
    # passes only the qualified public bundle, and this target stays on github.io.
    for path in source.rglob("*"):
        if path.is_symlink():
            raise ValueError(f"Source bundle cannot contain symlinks: {path}")
        if path.name.lower() == "cname":
            raise ValueError(f"GitHub Pages project-path build must not contain a CNAME file: {path}")
    if not (source / "publication.json").is_file():
        raise ValueError("Source must be a complete qualified Portfolio bundle with publication.json")
    shutil.copytree(source, destination, copy_function=shutil.copy2)

    changed = 0
    for path in destination.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            original = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        updated = rewrite_urls(original, base_path)
        if updated != original:
            path.write_text(updated, encoding="utf-8", newline="")
            changed += 1

    (destination / ".nojekyll").write_text("", encoding="utf-8")
    size = tree_bytes(destination)
    if size > MAX_PUBLISHED_BYTES:
        raise ValueError(
            f"Prepared GitHub Pages site is {size} bytes; GitHub documents a 1 GB published-site limit"
        )
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Already-qualified immutable publication bundle")
    parser.add_argument("destination", type=Path, help="New directory for the Pages-only copy")
    parser.add_argument("--base-path", required=True, help="GitHub Pages project path, for example /Portfolio")
    args = parser.parse_args()
    changed = prepare(args.source, args.destination, args.base_path)
    print(f"Prepared {args.destination}: rewrote {changed} text files for {normalized_base_path(args.base_path)}/")
    print(f"Published payload: {tree_bytes(args.destination)} bytes")


if __name__ == "__main__":
    main()
