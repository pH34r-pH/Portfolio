#!/usr/bin/env python3
"""Prepare an isolated project-path copy of a qualified Portfolio bundle for GitHub Pages."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit


TEXT_SUFFIXES = {".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt", ".webmanifest", ".xml"}
MAX_PUBLISHED_BYTES = 1_000_000_000

CSS_IMPORT_ROOT_URL = re.compile(r"(?P<prefix>@import\s+)(?P<quote>[\"'])/(?P<path>(?!/)[^\"']*)", re.IGNORECASE)
CSS_QUOTED_ROOT_URL = re.compile(r"(?P<prefix>url\(\s*)(?P<quote>[\"'])/(?P<path>(?!/)[^\"')\s]*)(?P=quote)", re.IGNORECASE)
CSS_ROOT_URL = re.compile(r"(?P<prefix>url\(\s*)/(?P<path>(?!/)[^\"\')\s]*)", re.IGNORECASE)
UNQUOTED_ATTRIBUTE_URL = re.compile(
    r"(?P<attribute>\b(?:href|src|action|poster|content|data-[\w:-]+)=)/(?P<path>(?!/)[^\"'`\s>]*)",
    re.IGNORECASE,
)
SRCSET_ATTRIBUTE = re.compile(r"(?P<prefix>\bsrcset\s*=\s*)(?P<quote>[\"'])(?P<value>.*?)(?P=quote)", re.IGNORECASE)
SRCSET_ROOT_URL = re.compile(r"(?P<prefix>(?:^|,\s*))/((?!/)[^\s,]+)")
QUOTED_ATTRIBUTE_URL = re.compile(
    r"(?P<attribute>\b(?:href|src|action|poster|content|data-[\w:-]+)\s*=\s*)(?P<quote>[\"'])/(?P<path>(?!/)[^\"'`\s>]*)",
    re.IGNORECASE,
)


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
    # Resolve dot segments as a browser does for a root-relative URL before
    # applying the project prefix. Traversal above the origin root clamps to
    # that root, then the project prefix keeps the resulting URL within Pages.
    raw_path = path if path.startswith("/") else "/" + path
    parsed = urlsplit(raw_path)
    segments: list[str] = []
    for segment in parsed.path.split("/")[1:]:
        decoded = unquote(segment)
        if decoded == ".":
            continue
        if decoded == "..":
            if segments:
                segments.pop()
            continue
        segments.append(segment)
    normalized_path = "/" + "/".join(segments)
    suffix = raw_path[len(parsed.path):]
    relative = normalized_path.lstrip("/")
    base_segment = base_path.lstrip("/")
    if relative == base_segment or relative.startswith(base_segment + "/"):
        return normalized_path + suffix
    return base_path + "/" + relative + suffix


def rewrite_urls(content: str, base_path: str) -> str:
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
    rewritten = CSS_QUOTED_ROOT_URL.sub(
        lambda match: match.group("prefix") + match.group("quote")
        + prefixed_url(base_path, match.group("path")) + match.group("quote"), rewritten
    )
    rewritten = CSS_IMPORT_ROOT_URL.sub(
        lambda match: match.group("prefix") + match.group("quote") + prefixed_url(base_path, match.group("path")),
        rewritten,
    )
    rewritten = SRCSET_ATTRIBUTE.sub(replace_srcset, rewritten)
    rewritten = QUOTED_ATTRIBUTE_URL.sub(
        lambda match: match.group("attribute") + match.group("quote") + prefixed_url(base_path, match.group("path")),
        rewritten,
    )
    return UNQUOTED_ATTRIBUTE_URL.sub(replace_attribute, rewritten)


SCRIPT_ELEMENT = re.compile(
    r"(?P<open><script\b(?P<attributes>[^>]*)>)(?P<body>.*?)(?P<close></script\s*>)",
    re.IGNORECASE | re.DOTALL,
)
SCRIPT_TYPE = re.compile(r"\btype\s*=\s*([\"'])(?P<type>[^\"']+)\1", re.IGNORECASE)
STYLE_ELEMENT = re.compile(r"(?P<open><style\b[^>]*>)(?P<body>.*?)(?P<close></style\s*>)", re.IGNORECASE | re.DOTALL)


def rewrite_json_text(content: str, base_path: str) -> str:
    def visit(value: object) -> object:
        if isinstance(value, str):
            if value.startswith("/") and not value.startswith("//"):
                return prefixed_url(base_path, value)
            return rewrite_urls(value, base_path)
        if isinstance(value, list):
            return [visit(item) for item in value]
        if isinstance(value, dict):
            return {key: visit(item) for key, item in value.items()}
        return value

    try:
        value = json.loads(content)
    except json.JSONDecodeError:
        return rewrite_urls(content, base_path)
    updated = visit(value)
    if updated == value:
        return content
    return json.dumps(updated, ensure_ascii=False, separators=(",", ":"))


def rewrite_html_urls(content: str, base_path: str, *, jupyter_base_path: str | None = None) -> str:
    raw_blocks: list[str] = []

    def preserve(block: str) -> str:
        token = f"PORTFOLIOPAGESRAWTEXT{len(raw_blocks)}END"
        raw_blocks.append(block)
        return token

    def replace_script(match: re.Match[str]) -> str:
        script_type = SCRIPT_TYPE.search(match.group("attributes"))
        if script_type and script_type.group("type").lower() in {
            "application/json", "application/ld+json", "importmap",
        }:
            body = rewrite_json_text(match.group("body"), base_path)
        else:
            body = rewrite_javascript_urls(
                match.group("body"), base_path, jupyter_base_path=jupyter_base_path
            )
        return preserve(match.group("open") + body + match.group("close"))

    def replace_style(match: re.Match[str]) -> str:
        return preserve(match.group("open") + rewrite_urls(match.group("body"), base_path) + match.group("close"))

    # Process raw-text elements separately so JS regexes and strings containing
    # SVG markup are not interpreted as HTML URLs.
    rewritten = SCRIPT_ELEMENT.sub(replace_script, content)
    rewritten = STYLE_ELEMENT.sub(replace_style, rewritten)
    rewritten = rewrite_urls(rewritten, base_path)
    for index, block in enumerate(raw_blocks):
        rewritten = rewritten.replace(f"PORTFOLIOPAGESRAWTEXT{index}END", block)
    return rewritten


JAVASCRIPT_REWRITER = Path(__file__).with_name("rewrite_javascript_urls.mjs")


def _javascript_rewriter_args(base_path: str, jupyter_base_path: str | None = None) -> list[str]:
    args = ["node", str(JAVASCRIPT_REWRITER), "--base-path", base_path]
    if jupyter_base_path:
        args.extend(["--jupyter-base-path", jupyter_base_path])
    return args


def rewrite_javascript_urls(
    source: str,
    base_path: str,
    *,
    jupyter_base_path: str | None = None,
) -> str:
    """Use Acorn tokens so JS regexes and comments are never treated as URLs."""
    result = subprocess.run(
        [*_javascript_rewriter_args(base_path, jupyter_base_path), "--stdin"],
        input=source,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout


def rewrite_javascript_files(
    paths: list[Path],
    base_path: str,
    *,
    jupyter_base_path: str | None = None,
) -> int:
    if not paths:
        return 0
    result = subprocess.run(
        [*_javascript_rewriter_args(base_path, jupyter_base_path), "--files", *(str(path) for path in paths)],
        text=True,
        capture_output=True,
        check=True,
    )
    return int(result.stdout.strip())


def tree_bytes(root: Path) -> int:
    total = 0
    for path in root.rglob("*"):
        if path.is_symlink():
            raise ValueError(f"GitHub Pages bundle cannot contain symlinks: {path}")
        if path.is_file():
            total += path.stat().st_size
    return total


def validate_source_bundle(source: Path, destination: Path) -> Path:
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
    return source


def rewrite_text_files(destination: Path, base_path: str) -> int:
    changed = 0
    javascript: dict[str | None, list[Path]] = {}
    for path in destination.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        suffix = path.suffix.lower()
        relative_path = path.relative_to(destination)
        jupyter_base_path = base_path + "/lab" if relative_path.parts[0] == "lab" else None
        if suffix in {".js", ".mjs"}:
            javascript.setdefault(jupyter_base_path, []).append(path)
            continue
        try:
            original = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if suffix == ".html":
            updated = rewrite_html_urls(original, base_path, jupyter_base_path=jupyter_base_path)
        elif suffix in {".json", ".webmanifest"}:
            updated = rewrite_json_text(original, base_path)
        else:
            updated = rewrite_urls(original, base_path)
        if updated != original:
            path.write_text(updated, encoding="utf-8", newline="")
            changed += 1
    for jupyter_base_path, paths in javascript.items():
        changed += rewrite_javascript_files(paths, base_path, jupyter_base_path=jupyter_base_path)
    return changed


def prepare(source: Path, destination: Path, base_path: str) -> int:
    base_path = normalized_base_path(base_path)
    source = validate_source_bundle(source, destination)
    shutil.copytree(source, destination, copy_function=shutil.copy2)
    changed = rewrite_text_files(destination, base_path)
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
