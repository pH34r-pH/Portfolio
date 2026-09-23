#!/usr/bin/env python3
"""Assemble an immutable Portfolio publication input tree."""

import argparse
import hashlib
import html
import json
import nbformat
import re
import shutil
from nbconvert import HTMLExporter
from traitlets.config import Config
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
from bs4 import BeautifulSoup


def prepare_reader(rendered: str, src: Path, notebook_paths: set[Path],
                   research_notes: Path, revision: str) -> tuple[str, str]:
    """Adapt published HTML links without modifying executable notebook bytes."""
    document = BeautifulSoup(rendered, "html.parser")
    for anchor in document.select("a.anchor-link"):
        anchor.decompose()
    heading = document.find("h1")
    title = heading.get_text(" ", strip=True) if heading else src.stem.replace("_", " ")
    # The shared reader header supplies the single page title and main landmark.
    if heading:
        if heading.get("id"):
            marker = document.new_tag("span", id=heading["id"])
            heading.insert_before(marker)
        heading.decompose()
    for main in document.find_all("main"):
        main.unwrap()
    for link in document.find_all("a", href=True):
        href = urlsplit(link["href"])
        if href.scheme or href.netloc or not href.path or href.path.startswith("/"):
            continue
        target = (src.parent / unquote(href.path)).resolve()
        try:
            relative = target.relative_to(research_notes.resolve())
        except ValueError:
            continue
        suffix = ("?" + href.query if href.query else "") + ("#" + href.fragment if href.fragment else "")
        if target in notebook_paths:
            link["href"] = "/notebooks/" + quote(target.stem) + "/" + suffix
        elif target.is_file():
            link["href"] = f"https://github.com/pH34r-pH/research-notes/blob/{revision}/{quote(relative.as_posix())}" + suffix
    # Preserve horizontal inspection of code and tables without page overflow.
    for block in document.select(".highlight, .jp-OutputArea-output"):
        block["tabindex"] = "0"
        block["role"] = "region"
        block["aria-label"] = "Notebook code" if "highlight" in block.get("class", []) else "Notebook output"
    return title, str(document)

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def copy_lab_contents(research_notes: Path, output: Path) -> None:
    """Preserve source-relative paths and retain legacy flat notebook URLs."""
    contents = output / "publication" / "lab-contents"
    shutil.copytree(research_notes / "notebooks", contents / "notebooks")
    shutil.copytree(research_notes / "reference", contents / "reference")
    for src in (research_notes / "notebooks").glob("*.ipynb"):
        shutil.copy2(src, contents / src.name)
    # The former flat notebook URLs resolve ../reference outside /files/.
    # Keep that read-only URL working for existing browser workspaces too.
    shutil.copytree(research_notes / "reference", output / "lab" / "reference")

def apply_output_descriptions(notebook, rendered: str) -> str:
    document = BeautifulSoup(rendered, "html.parser")
    descriptions = [output.get("metadata", {}).get("publication", {}).get("alt")
                    for cell in notebook.cells for output in cell.get("outputs", [])
                    if "image/png" in output.get("data", {})]
    images = document.select('img[src^="data:image/png"]')
    if len(images) != len(descriptions):
        raise ValueError("Notebook output image count changed during rendering")
    for image, description in zip(images, descriptions):
        if description:
            image["alt"] = description
    return str(document)

def render_markdown(source: str) -> str:
    escaped = html.escape(source)
    escaped = re.sub(r"^### (.+)$", r"<h3>\1</h3>", escaped, flags=re.M)
    escaped = re.sub(r"^## (.+)$", r"<h2>\1</h2>", escaped, flags=re.M)
    escaped = re.sub(r"^# (.+)$", r"<h1>\1</h1>", escaped, flags=re.M)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    blocks = [p.strip() for p in escaped.split("\n\n") if p.strip()]
    return "".join(p if p.startswith("<h") else "<p>" + p.replace("\n", "<br>") + "</p>" for p in blocks)

def render_output(output: dict) -> str:
    data = output.get("data", {})
    if "image/png" in data:
        raw = "".join(data["image/png"])
        return '<figure class="nb-output nb-image"><img alt="Notebook output visualization" src="data:image/png;base64,' + raw + '"></figure>'
    if "image/svg+xml" in data:
        return '<figure class="nb-output nb-image">' + "".join(data["image/svg+xml"]) + "</figure>"
    if "text/html" in data:
        return '<div class="nb-output nb-html" aria-label="Notebook rich output">' + "".join(data["text/html"]) + "</div>"
    text_value = output.get("text") or data.get("text/plain")
    if text_value:
        return '<pre class="nb-output" aria-label="Notebook text output">' + html.escape("".join(text_value)) + "</pre>"
    return ""

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--portfolio", type=Path, required=True)
    p.add_argument("--research-notes", type=Path, required=True)
    p.add_argument("--theorem-library", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--portfolio-sha", required=True)
    p.add_argument("--research-notes-sha", required=True)
    p.add_argument("--theorem-library-sha", required=True)
    p.add_argument("--fleet-sha", help="Legacy v1 manifest only; public candidate builds omit this private source")
    a = p.parse_args()

    for revision in (a.portfolio_sha, a.research_notes_sha, a.theorem_library_sha, a.fleet_sha):
        if revision is not None and not re.fullmatch(r"[0-9a-f]{40}", revision):
            p.error("Every source revision must be an exact 40-character lowercase commit SHA")
    for source in (a.portfolio / "site", a.research_notes / "notebooks",
                   a.research_notes / "reference", a.theorem_library):
        if not source.is_dir():
            p.error(f"Missing pinned public source directory: {source}")
        if any(path.is_symlink() for path in (source, *source.rglob("*"))):
            p.error(f"Publication source contains a symlink: {source}")

    if a.output.exists():
        shutil.rmtree(a.output)
    shutil.copytree(a.portfolio / "site", a.output)
    publication = a.output / "publication" / "notebooks"
    publication.mkdir(parents=True)
    reader_root = a.output / "notebooks"
    reader_root.mkdir(parents=True)
    copy_lab_contents(a.research_notes, a.output)
    notebooks = []
    notebook_paths = {path.resolve() for path in (a.research_notes / "notebooks").glob("*.ipynb")}
    # Presentation remains Portfolio-owned; consume its existing navigation shell.
    research_page = BeautifulSoup((a.portfolio / "site/research/index.html").read_text(), "html.parser")
    navigation = research_page.select_one("header.topbar")
    if navigation is None:
        raise ValueError("Portfolio Research page is missing its shared navigation")
    for current in navigation.select("[aria-current]"):
        current["aria-current"] = "location"

    for src in (a.research_notes / "notebooks").glob("*.ipynb"):
        dst = publication / src.name
        shutil.copy2(src, dst)
        slug = src.stem
        notebook = nbformat.read(src, as_version=4)
        metadata = notebook.metadata.get("publication", {})
        cells = []
        for cell in notebook.get("cells", []):
            source = "".join(cell.get("source", []))
            if cell.get("cell_type") == "markdown":
                cells.append('<section class="nb-markdown">' + render_markdown(source) + "</section>")
            elif cell.get("cell_type") == "code":
                outputs = [render_output(output) for output in cell.get("outputs", [])]
                cells.append('<section class="nb-code"><div class="nb-cell-head"><span>Python</span><span>Code cell</span></div><pre><code>' + html.escape(source) + "</code></pre>" + "".join(outputs) + "</section>")

        title = slug.replace("_", " ")
        config = Config()
        config.HTMLExporter.exclude_input_prompt = True
        config.HTMLExporter.exclude_output_prompt = True
        exporter = HTMLExporter(template_name="lab", config=config)
        rendered_body, _ = exporter.from_notebook_node(notebook)
        body_match = re.search(r"<body[^>]*>(.*)</body>", rendered_body, flags=re.S | re.I)
        rendered_notebook = body_match.group(1) if body_match else "".join(cells)
        rendered_notebook = re.sub(r'<a class="anchor-link"[^>]*>.*?</a>', "", rendered_notebook, flags=re.S)
        rendered_notebook = re.sub(r'<a[^>]*class="[^"]*anchor[^"]*"[^>]*>¶</a>', "", rendered_notebook, flags=re.S)
        title, rendered_notebook = prepare_reader(rendered_notebook, src, notebook_paths, a.research_notes, a.research_notes_sha)
        rendered_notebook = apply_output_descriptions(notebook, rendered_notebook)
        reader = reader_root / slug
        reader.mkdir()
        lab_label = "Run illustrative example in Lab ↗" if metadata.get("exampleKind") == "illustrative" else "Inspect or run in Lab ↗"
        page = f'''<!doctype html><html lang="en" data-palette="nacre"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)} — Tyler J.H.G.</title><link rel="stylesheet" href="/assets/site.css"></head><body><a class="skip-link" href="#notebook-main">Skip to notebook</a>{navigation}<main id="notebook-main" tabindex="-1" class="notebook-reader"><a class="back" href="/research/">← Research index</a><header><p class="eyebrow">RESEARCH NOTEBOOK</p><h1>{html.escape(title)}</h1><p>Read the published notebook. <a href="/lab/lab/index.html?path=notebooks%2F{quote(src.name)}">{lab_label}</a></p></header><article class="notebook-content">{rendered_notebook}</article><p><a class="back" href="/research/">← Research index</a></p></main><script src="/assets/site.js"></script></body></html>'''
        (reader / "index.html").write_text(page, encoding="utf-8")
        entry = {"path": f"publication/notebooks/{src.name}", "jupyterPath": "notebooks/" + src.name, "slug": slug, "title": title, "sha256": sha256(dst)}
        entry.update({key: metadata[key] for key in ("question", "sequence", "exampleKind") if key in metadata})
        notebooks.append(entry)

    notebooks.sort(key=lambda n: (n.get("sequence", 0), n["path"]), reverse=True)
    atlas_source = a.portfolio / "site" / "data" / "atlas-evidence.json"
    atlas_target = a.output / "data" / "atlas-evidence.json"
    atlas_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(atlas_source, atlas_target)
    sources = {
        "portfolio": {"repository": "pH34r-pH/Portfolio", "commit": a.portfolio_sha},
        "researchNotes": {"repository": "pH34r-pH/research-notes", "commit": a.research_notes_sha},
        "theoremLibrary": {"repository": "pH34r-pH/theorem-library", "commit": a.theorem_library_sha},
    }
    # Fleet's commit describes the private promoter, not a source of public
    # bundle bytes. Fleet records that SHA in its protected receipt instead.
    if a.fleet_sha:
        sources["fleet"] = {"repository": "pH34r-pH/long-haul-fleet", "commit": a.fleet_sha}
    manifest = {"schemaVersion": 1 if a.fleet_sha else 2,
                "builtAt": datetime.now(timezone.utc).isoformat(),
                "sources": sources, "notebooks": notebooks}
    (a.output / "publication.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (a.output / "jupyter-lite.json").write_bytes((a.portfolio / "jupyter-lite.json").read_bytes())

if __name__ == "__main__":
    main()
