#!/usr/bin/env python3
"""Prepare an isolated project-path copy of a qualified Portfolio bundle for GitHub Pages."""

from __future__ import annotations

import argparse
import json
import re
import shutil
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


JS_URL_ARGUMENT = re.compile(r"\b(?:fetch|import|URL|register)\s*\(\s*$", re.IGNORECASE)
JS_URL_PROPERTY = re.compile(
    r"\b(?:href|src|url|uri|endpoint|baseUrl|baseURL|publicPath|serviceWorkerUrl)\s*[:=]\s*$",
    re.IGNORECASE,
)
JS_LOCATION_ASSIGNMENT = re.compile(r"\b(?:window\.)?location(?:\.href)?\s*=\s*$", re.IGNORECASE)


def _rewrite_javascript_literal(
    value: str,
    base_path: str,
    *,
    is_url: bool = False,
    jupyter_base_path: str | None = None,
) -> str:
    """Rewrite URL-like text inside one JS string/template chunk, never JS syntax."""
    rewritten = rewrite_urls(value, base_path)
    # A common fetch/import URL is the whole string literal. Only use the site
    # prefix when the surrounding JS indicates a URL; otherwise `"/"` is often
    # just a path separator in generated bundles.
    if value == "/api/service-worker-heartbeat" and jupyter_base_path:
        return prefixed_url(jupyter_base_path, value)
    if is_url and rewritten.startswith("/") and not rewritten.startswith("//"):
        return prefixed_url(base_path, rewritten)
    return rewritten


def rewrite_javascript_urls(
    source: str,
    base_path: str,
    *,
    jupyter_base_path: str | None = None,
) -> str:
    """Rewrite root URLs in JS string tokens while leaving regexes/comments alone.

    Generated JupyterLite bundles contain many regular expressions with quoted
    fragments. Applying the markup URL regex to the complete JS file changes
    regex syntax and can also rewrite ordinary path-separator strings. This
    small lexer limits URL rewriting to string literals and template chunks.
    """
    expression_prefix_keywords = {
        "await", "case", "delete", "do", "else", "in", "instanceof", "new",
        "of", "return", "throw", "typeof", "void", "yield",
    }

    def skip_regex(index: int) -> int:
        index += 1
        in_class = False
        escaped = False
        while index < len(source):
            char = source[index]
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == "[":
                in_class = True
            elif char == "]":
                in_class = False
            elif char == "/" and not in_class:
                index += 1
                while index < len(source) and source[index].isalpha():
                    index += 1
                return index
            elif char in "\r\n":
                return index
            index += 1
        return index

    def rewrite_code(index: int, stop_at_template_brace: bool = False) -> tuple[str, int]:
        output: list[str] = []
        previous: tuple[str, str] | None = None
        brace_depth = 0
        while index < len(source):
            char = source[index]
            if char.isspace():
                output.append(char)
                index += 1
                continue
            if source.startswith("//", index):
                end = source.find("\n", index + 2)
                if end < 0:
                    output.append(source[index:])
                    return "".join(output), len(source)
                output.append(source[index:end])
                index = end
                continue
            if source.startswith("/*", index):
                end = source.find("*/", index + 2)
                end = len(source) if end < 0 else end + 2
                output.append(source[index:end])
                index = end
                continue
            if stop_at_template_brace and char == "}" and brace_depth == 0:
                return "".join(output), index
            if char in "\"'":
                prefix = source[max(0, index - 160) : index]
                is_url = any(pattern.search(prefix) for pattern in (JS_URL_ARGUMENT, JS_URL_PROPERTY, JS_LOCATION_ASSIGNMENT))
                end = index + 1
                while end < len(source):
                    if source[end] == "\\":
                        end += 2
                    elif source[end] == char:
                        end += 1
                        break
                    else:
                        end += 1
                raw = source[index + 1 : end - 1] if end <= len(source) and source[end - 1 : end] == char else source[index + 1 : end]
                output.extend((char, _rewrite_javascript_literal(
                    raw, base_path, is_url=is_url, jupyter_base_path=jupyter_base_path
                ), char if end <= len(source) and source[end - 1 : end] == char else ""))
                index = end
                previous = ("value", "string")
                continue
            if char == "`":
                prefix = source[max(0, index - 160) : index]
                is_url = any(pattern.search(prefix) for pattern in (JS_URL_ARGUMENT, JS_URL_PROPERTY, JS_LOCATION_ASSIGNMENT))
                output.append(char)
                index += 1
                chunk_start = index
                while index < len(source):
                    if source[index] == "\\":
                        index += 2
                        continue
                    if source.startswith("${", index):
                        output.append(_rewrite_javascript_literal(
                            source[chunk_start:index], base_path, is_url=is_url,
                            jupyter_base_path=jupyter_base_path,
                        ))
                        output.append("${")
                        expression, index = rewrite_code(index + 2, stop_at_template_brace=True)
                        output.append(expression)
                        if index < len(source) and source[index] == "}":
                            output.append("}")
                            index += 1
                        chunk_start = index
                        continue
                    if source[index] == "`":
                        output.append(_rewrite_javascript_literal(
                            source[chunk_start:index], base_path, is_url=is_url,
                            jupyter_base_path=jupyter_base_path,
                        ))
                        output.append("`")
                        index += 1
                        break
                    index += 1
                previous = ("value", "template")
                continue
            if char == "/":
                can_start_regex = previous is None or previous[0] == "operator" or previous[0] == "open"
                if previous and previous[0] == "keyword" and previous[1] in expression_prefix_keywords:
                    can_start_regex = True
                if can_start_regex:
                    end = skip_regex(index)
                    output.append(source[index:end])
                    index = end
                    previous = ("value", "regexp")
                else:
                    output.append(char)
                    index += 1
                    previous = ("operator", char)
                continue
            if char.isalpha() or char in "_$":
                end = index + 1
                while end < len(source) and (source[end].isalnum() or source[end] in "_$"):
                    end += 1
                word = source[index:end]
                output.append(word)
                previous = ("keyword", word) if word in expression_prefix_keywords else ("value", word)
                index = end
                continue
            if char.isdigit():
                end = index + 1
                while end < len(source) and (source[end].isalnum() or source[end] in "._"):
                    end += 1
                output.append(source[index:end])
                previous = ("value", "number")
                index = end
                continue

            punct = next((item for item in ("===", "!==", ">>>", "**=", "=>", "==", "!=", "<=", ">=", "++", "--", "&&", "||", "??", "?.", "**", "+=", "-=", "*=", "/=", "...", "<<", ">>") if source.startswith(item, index)), char)
            output.append(punct)
            index += len(punct)
            if stop_at_template_brace:
                if punct == "{":
                    brace_depth += 1
                elif punct == "}":
                    brace_depth -= 1
            if punct in {")", "]", "}", "++", "--"}:
                previous = ("value", punct)
            elif punct in "([{,;:?=!*%&|^~<>+-" or punct in {"=>", "...", "/=", "**", "&&", "||", "??"}:
                previous = ("open" if punct in "([{" else "operator", punct)
            elif punct == "." or punct == "?.":
                previous = ("member", punct)
            else:
                previous = ("operator", punct)
        return "".join(output), index

    return rewrite_code(0)[0]


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
        suffix = path.suffix.lower()
        relative_path = path.relative_to(destination)
        jupyter_base_path = base_path + "/lab" if relative_path.parts[0] == "lab" else None
        if suffix in {".js", ".mjs"}:
            updated = rewrite_javascript_urls(original, base_path, jupyter_base_path=jupyter_base_path)
        elif suffix == ".html":
            updated = rewrite_html_urls(original, base_path, jupyter_base_path=jupyter_base_path)
        elif suffix in {".json", ".webmanifest"}:
            updated = rewrite_json_text(original, base_path)
        else:
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
