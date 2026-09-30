#!/usr/bin/env python3
"""Prepare an isolated Research Notes tree with Portfolio article export targets."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

EXPORTS = """exports:
  - format: typst
    template: lapreprint-typst
    output: _build/exports/{slug}.pdf
  - format: docx
    output: _build/exports/{slug}.docx
  - format: tex
    output: _build/exports/{slug}-latex.zip
  - format: jats
    output: _build/exports/{slug}.xml
"""


def inject_exports(source: str, slug: str, path: Path) -> str:
    match = re.match(r"\A---\s*\n(.*?)\n---\s*\n", source, re.DOTALL)
    if not match:
        raise ValueError(f"Article is missing YAML frontmatter: {path}")
    frontmatter = match.group(1)
    if re.search(r"^exports\\s*:", frontmatter, re.MULTILINE):
        raise ValueError(f"Article already declares exports; reconcile instead of overriding: {path}")
    if not re.search(r"^abstract\\s*:", frontmatter, re.MULTILINE):
        description = re.search(r"^description:\\s*(.+?)\\s*$", frontmatter, re.MULTILINE)
        if not description:
            raise ValueError(f"Article requires description or abstract for manuscript export: {path}")
        value = description.group(1).strip().strip("'\\\"")
        frontmatter = frontmatter.rstrip() + "\\nabstract: " + json.dumps(value)
    replacement = f"---\\n{frontmatter.rstrip()}\\n{EXPORTS.format(slug=slug)}---\\n"
    return replacement + source[match.end():]


def prepare(source_root: Path, output_root: Path) -> list[dict[str, str]]:
    if output_root.exists():
        shutil.rmtree(output_root)
    shutil.copytree(
        source_root,
        output_root,
        ignore=shutil.ignore_patterns(".git", "_build", ".myst"),
    )
    articles = []
    for article in sorted((output_root / "articles").glob("*.md")):
        slug = article.stem
        article.write_text(
            inject_exports(article.read_text(encoding="utf-8"), slug, article),
            encoding="utf-8",
        )
        articles.append({
            "source": f"articles/{article.name}",
            "slug": slug,
            "pdf": f"{slug}.pdf",
            "docx": f"{slug}.docx",
            "latex": f"{slug}-latex.zip",
            "jats": f"{slug}.xml",
        })
    if not articles:
        raise ValueError("No canonical MyST articles found")
    return articles


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--research-notes", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    records = prepare(args.research_notes.resolve(), args.output.resolve())
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(records)} article export definitions")


if __name__ == "__main__":
    main()
