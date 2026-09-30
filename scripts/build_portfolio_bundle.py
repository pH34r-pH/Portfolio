#!/usr/bin/env python3
"""Assemble an immutable Portfolio publication input tree."""

import argparse
import hashlib
import html
import json
import nbformat
import yaml
from compiled_experiment_reference import resolve_reference, render_handoff
from compiler_projection_input import verified_projection
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from nbconvert import HTMLExporter
from traitlets.config import Config
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
from bs4 import BeautifulSoup


def _strip_reader_structure(document, src: Path) -> str:
    for anchor in document.select("a.anchor-link"):
        anchor.decompose()
    heading = document.find("h1")
    title = heading.get_text(" ", strip=True) if heading else src.stem.replace("_", " ")
    if heading:
        if heading.get("id"):
            heading.insert_before(document.new_tag("span", id=heading["id"]))
        heading.decompose()
    for main in document.find_all("main"):
        main.unwrap()
    return title


def _rewrite_reader_links(document, src: Path, notebook_paths: set[Path],
                          research_notes: Path, revision: str) -> None:
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
            link["href"] = (
                f"https://github.com/pH34r-pH/research-notes/blob/{revision}/"
                f"{quote(relative.as_posix())}{suffix}"
            )


def _mark_reader_regions(document) -> None:
    for block in document.select(".highlight, .jp-OutputArea-output"):
        block["tabindex"] = "0"
        block["role"] = "region"
        block["aria-label"] = (
            "Notebook code" if "highlight" in block.get("class", []) else "Notebook output"
        )


def prepare_reader(rendered: str, src: Path, notebook_paths: set[Path],
                   research_notes: Path, revision: str) -> tuple[str, str]:
    """Adapt published HTML links without modifying executable notebook bytes."""
    document = BeautifulSoup(rendered, "html.parser")
    title = _strip_reader_structure(document, src)
    _rewrite_reader_links(document, src, notebook_paths, research_notes, revision)
    _mark_reader_regions(document)
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
    if (research_notes / "articles").is_dir():
        shutil.copytree(research_notes / "articles", output / "publication" / "articles")


def _article_metadata(source: str, src: Path) -> dict:
    match = re.match(r"\A---\s*\n(.*?)\n---\s*\n", source, re.DOTALL)
    if not match:
        raise ValueError(f"Canonical article is missing YAML frontmatter: {src}")
    metadata = {}
    for field in ("title", "description", "date"):
        value = re.search(rf"^{field}:\s*(.+?)\s*$", match.group(1), re.MULTILINE)
        if value:
            metadata[field] = value.group(1).strip().strip("'\"")
    for required in ("title", "description", "date"):
        if not metadata.get(required):
            raise ValueError(f"Canonical article requires {required}: {src}")
    class UniqueKeysLoader(yaml.SafeLoader):
        pass
    def unique_mapping(loader, node, deep=False):
        mapping = {}
        for key_node, value_node in node.value:
            key = loader.construct_object(key_node, deep=deep)
            if key in mapping:
                raise ValueError(f'Duplicate article frontmatter key: {key}')
            mapping[key] = loader.construct_object(value_node, deep=deep)
        return mapping
    UniqueKeysLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)
    structured = yaml.load(match.group(1), Loader=UniqueKeysLoader)
    if isinstance(structured, dict):
        if 'compiled_experiment' in structured:
            metadata['compiled_experiment'] = structured['compiled_experiment']
        for source_key, target_key in {
            'short_title': 'shortTitle',
            'model_focus': 'modelFocus',
            'model_variant': 'modelVariant',
            'depends_on': 'dependsOn',
            'tags': 'tags',
        }.items():
            if source_key in structured:
                metadata[target_key] = structured[source_key]
        for source_key, target_key in {
            'frontier_observed_json': 'frontierObserved',
            'frontier_open_json': 'frontierOpen',
            'frontier_next_json': 'frontierNext',
        }.items():
            if source_key not in structured:
                continue
            value = structured[source_key]
            if isinstance(value, str):
                try:
                    value = json.loads(value)
                except json.JSONDecodeError as error:
                    raise ValueError(f'Invalid {source_key} JSON in {src}: {error}') from error
            if not isinstance(value, list) or not all(isinstance(item, str) and item.strip() for item in value):
                raise ValueError(f'{source_key} must be a JSON/YAML list of non-empty strings: {src}')
            metadata[target_key] = value
    return metadata


def _source_file_index(research_notes: Path) -> dict[str, Path]:
    research_root = research_notes.resolve()
    candidates = []
    for folder in ("articles", "notebooks", "reference"):
        candidates.extend(path for path in (research_root / folder).rglob("*") if path.is_file())
    candidates.extend(path for path in (
        research_root / "README.md",
        research_root / "CHRONOLOGY.md",
        research_root / "PUBLICATION-DISPOSITIONS.md",
    )
                      if path.is_file())
    index = {}
    for path in sorted(candidates):
        index.setdefault(hashlib.sha256(path.read_bytes()).hexdigest(), path)
    return index


def _myst_asset_path(myst_html: Path, url_path: str) -> Path:
    root = myst_html.parent.resolve()
    parts = unquote(url_path).lstrip("/").split("/")
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise ValueError(f"MyST output asset path is malformed: {url_path}")
    candidate = root
    for part in parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise ValueError(f"MyST output asset must not contain symlinks: {url_path}")
    source = candidate.resolve()
    try:
        source.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"MyST output asset leaves its build directory: {url_path}") from exc
    if source.is_symlink() or not source.is_file():
        raise ValueError(f"MyST output references a missing or unsafe asset: {url_path}")
    return source


def _myst_article_sources(research_notes: Path) -> list[Path]:
    """Read the source order from the standard MyST project table of contents."""
    config = (research_notes / "myst.yml").read_text(encoding="utf-8")
    relative_paths = re.findall(r"^\s+- file:\s*(articles/\S+\.md)\s*$", config, re.MULTILINE)
    if not relative_paths or len(relative_paths) != len(set(relative_paths)):
        raise ValueError("MyST project.toc must list canonical article sources exactly once")
    sources = []
    for relative in relative_paths:
        source = (research_notes / relative).resolve()
        try:
            source.relative_to((research_notes / "articles").resolve())
        except ValueError as exc:
            raise ValueError(f"MyST table-of-contents path leaves articles/: {relative}") from exc
        if source.is_symlink() or not source.is_file():
            raise ValueError(f"MyST table of contents points to a missing or unsafe article: {relative}")
        sources.append(source)
    article_files = {path.resolve() for path in (research_notes / "articles").glob("*.md")}
    if set(sources) != article_files:
        raise ValueError("MyST project.toc must include each canonical article source exactly once")
    return sources


def _myst_article_html_path(myst_html: Path, source: Path,
                            ordered_sources: list[Path]) -> Path:
    """Resolve MyST's static article route from its source filename."""
    try:
        position = ordered_sources.index(source.resolve())
    except ValueError as exc:
        raise ValueError(f"Article is absent from the MyST project table of contents: {source}") from exc
    root = myst_html.parent.resolve()
    route = re.sub(r"^\d{3}-", "", source.stem)
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", route):
        raise ValueError(f"Article filename does not map to a stable MyST route: {source.name}")
    result = root / route / "index.html"
    if result.is_symlink() or not result.is_file():
        raise ValueError(f"MyST static output is missing the page for {source.name}: {result}")
    return result


def _canonical_myst_target(canonical: Path | None, context, suffix: str) -> tuple[str, bool] | None:
    if canonical is None:
        return None
    if canonical.suffix == ".ipynb":
        return f"/notebooks/{quote(canonical.stem)}/{suffix}", False
    if canonical.suffix == ".md":
        article_root = context.research_notes.resolve() / "articles"
        if canonical.parent == article_root:
            return f"/articles/{quote(canonical.stem)}/{suffix}", False
        relative = canonical.relative_to(context.research_notes.resolve()).as_posix()
        url = f"https://github.com/pH34r-pH/research-notes/blob/{context.revision}/{quote(relative)}{suffix}"
        return url, True
    return None


@dataclass
class _MystAssetContext:
    myst_html: Path
    output: Path
    source_digests: dict[str, Path]
    research_notes: Path
    revision: str
    copied: set[str] = field(default_factory=set)

    def _copy_asset(self, source: Path, parsed, element, attribute: str, digest: str, suffix: str) -> None:
        name = Path(parsed.path).name
        destination = self.output / "publication" / "article-assets" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        if name not in self.copied:
            shutil.copy2(source, destination)
            self.copied.add(name)
        elif sha256(destination) != digest:
            raise ValueError(f"MyST output asset basename collision: {name}")
        element[attribute] = f"/publication/article-assets/{quote(name)}{suffix}"

    def rewrite(self, element, attribute: str) -> None:
        parsed = urlsplit(element[attribute])
        if not parsed.path.startswith("/build/"):
            return
        source = _myst_asset_path(self.myst_html, parsed.path)
        digest = sha256(source)
        canonical = self.source_digests.get(digest)
        suffix = ("?" + parsed.query if parsed.query else "") + ("#" + parsed.fragment if parsed.fragment else "")
        target = _canonical_myst_target(canonical, self, suffix)
        if target:
            element[attribute] = target[0]
            # MyST marks source attachments as downloads. Portfolio routes them
            # to readers or source pages, so that icon no longer describes the link.
            for icon in element.select('svg.link-icon'):
                icon.decompose()
            if target[1]:
                element["target"] = "_blank"
                element["rel"] = "noreferrer"
            else:
                element.attrs.pop("target", None)
                element.attrs.pop("rel", None)
            return
        self._copy_asset(source, parsed, element, attribute, digest, suffix)


def _copy_myst_assets(document, myst_html: Path, output: Path,
                      source_digests: dict[str, Path], research_notes: Path,
                      revision: str) -> list[str]:
    context = _MystAssetContext(myst_html, output, source_digests, research_notes, revision)
    for element in document.find_all(src=True):
        context.rewrite(element, "src")
    for element in document.find_all("a", href=True):
        context.rewrite(element, "href")
    return sorted(context.copied)


def _rewrite_myst_article_routes(document, ordered_sources: list[Path]) -> None:
    """Map MyST's native article routes to Portfolio's canonical routes."""
    routes = {
        '/' + re.sub(r'^\d{3}-', '', source.stem): f'/articles/{source.stem}/'
        for source in ordered_sources
    }
    for link in document.find_all('a', href=True):
        parsed = urlsplit(link['href'])
        if parsed.scheme or parsed.netloc:
            continue
        target = routes.get(parsed.path.rstrip('/'))
        if target:
            suffix = ('?' + parsed.query if parsed.query else '') + ('#' + parsed.fragment if parsed.fragment else '')
            link['href'] = target + suffix


def _prepare_article_execution(document) -> bool:
    cells = document.select(".myst-jp-nb-block")
    for index, cell in enumerate(cells, 1):
        source = cell.select_one("pre")
        output = cell.select_one('[data-name="outputs-container"]')
        if source is None or output is None:
            raise ValueError("MyST executable cell is missing its source or output container")
        source["data-executable"] = ""
        source["aria-label"] = f"Editable illustrative Python cell {index}"
        source["tabindex"] = "0"
        output["data-output"] = ""
        output["role"] = "status"
        output["aria-live"] = "polite"
        output["aria-label"] = f"Your session output for code cell {index}"
        output["tabindex"] = "0"
    if cells:
        panel = document.new_tag("section", attrs={"class": "article-execution", "data-article-execution": ""})
        panel["aria-label"] = "Browser-local code execution"
        button = document.new_tag("button", attrs={"type": "button", "class": "primary", "data-load-browser-runtime": ""})
        button.string = "Load browser Python"
        status = document.new_tag("p", attrs={"role": "status", "aria-live": "polite", "data-runtime-status": ""})
        status.string = "Run and edit this example in your browser."
        panel.append(button)
        panel.append(status)
        cells[0].insert_before(panel)
    return bool(cells)


def _strip_article_theme_controls(document) -> None:
    """Remove application controls from the static article fragment."""
    for anchor in document.select('a.anchor-link, a[aria-label="Link to this Section"]'):
        anchor.decompose()
    # The static export includes controls owned by the hydrated MyST theme.
    # Portfolio supplies its own navigation and source link; copy buttons here
    # have no event handler after extracting the article from that application.
    for control in document.select('button.myst-code-copy-icon'):
        control.decompose()
    for toolbar in document.select('div.col-screen'):
        text = toolbar.get_text(' ', strip=True)
        if 'Back to Article' in text and 'Download' in text:
            toolbar.decompose()


def _preserve_article_section_links(document) -> None:
    """Keep section URLs published before the prose cleanup."""
    for heading in document.find_all(['h2', 'h3']):
        alias = {
            'Interpretation': 'what-this-does-not-show',
            'Try a small example': 'a-small-editable-teaching-example',
        }.get(heading.get_text(' ', strip=True))
        if alias and not document.find(id=alias):
            heading.insert_before(document.new_tag('span', id=alias))


def _mark_article_code_regions(document) -> None:
    """Allow keyboard readers to scroll wide code and saved output."""
    for index, block in enumerate(document.select('pre'), start=1):
        code = block.find('code')
        kind = 'Saved output' if code and 'language-text' in code.get('class', []) else 'Code sample'
        block['tabindex'] = '0'
        block['role'] = 'region'
        block['aria-label'] = f'{kind} {index}'


def _normalize_article_heading(document, source: str, title: str) -> None:
    """Give each published article a level-one heading and stable source label."""
    _strip_article_theme_controls(document)
    _preserve_article_section_links(document)
    _mark_article_code_regions(document)
    frontmatter = re.match(r"\A---\s*\n.*?\n---\s*\n", source, re.DOTALL)
    body = source[frontmatter.end():] if frontmatter else source
    label = re.match(r"\s*\(([A-Za-z0-9_-]+)\)=\s*\n", body)
    identifier = label.group(1) if label else re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    heading = next(
        (candidate for candidate in document.find_all(["h1", "h2"])
         if candidate.get_text(" ", strip=True) == title),
        None,
    )
    if heading is None:
        heading = BeautifulSoup("", "html.parser").new_tag("h1")
        heading.string = title
        document.insert(0, heading)
    else:
        heading.name = "h1"
    heading["id"] = identifier
    for index, table in enumerate(document.find_all("table"), start=1):
        container = table.find_parent("div", class_=re.compile(r"\boverflow-auto\b"))
        target = container or table
        target["tabindex"] = "0"
        if container:
            caption = table.find("caption") or table.find("th")
            label = caption.get_text(" ", strip=True) if caption else f"table {index}"
            container["role"] = "region"
            container["aria-label"] = f"Scrollable table: {label}"
    for index, equation in enumerate(document.select('.katex-display'), start=1):
        equation['tabindex'] = '0'
        equation['role'] = 'region'
        equation['aria-label'] = f'Equation {index}'


def copy_article_math_assets(args: argparse.Namespace) -> None:
    """Keep KaTeX styling and fonts with the pinned, server-rendered equations."""
    source = args.portfolio.resolve() / 'node_modules/katex'
    destination = args.output / 'assets/katex'
    if (destination / 'katex.min.css').is_file():
        return
    stylesheet = source / 'dist/katex.min.css'
    fonts = source / 'dist/fonts'
    if not stylesheet.is_file() or not fonts.is_dir():
        raise ValueError('Pinned KaTeX styles and fonts are missing; install Portfolio npm dependencies')
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copy2(stylesheet, destination / 'katex.min.css')
    shutil.copytree(fonts, destination / 'fonts')
    shutil.copy2(source / 'LICENSE', destination / 'LICENSE')


def publish_article(src: Path, navigation, args: argparse.Namespace,
                    source_digests: dict[str, Path], sequence: int,
                    ordered_sources: list[Path]) -> dict:
    source_text = src.read_text(encoding="utf-8")
    metadata = _article_metadata(source_text, src)
    article_html = _myst_article_html_path(args.myst_html, src, ordered_sources)
    document = BeautifulSoup(article_html.read_text(encoding="utf-8"), "html.parser")
    article = document.select_one("article.myst-article")
    if article is None:
        raise ValueError("MyST static build is missing its server-rendered article")
    article = BeautifulSoup(str(article), "html.parser").article
    _normalize_article_heading(article, source_text, metadata["title"])
    _rewrite_myst_article_routes(article, ordered_sources)
    copied_assets = _copy_myst_assets(article, args.myst_html, args.output, source_digests,
                                      args.research_notes, args.research_notes_sha)
    has_executable = _prepare_article_execution(article)
    math_style = ''
    if article.select_one('.katex'):
        copy_article_math_assets(args)
        math_style = '<link rel="stylesheet" href="/assets/katex/katex.min.css">'
    slug = src.stem
    reader = args.output / "articles" / slug
    reader.mkdir(parents=True)
    article_source_url = (
        f"https://github.com/pH34r-pH/research-notes/blob/{args.research_notes_sha}/"
        f"{quote(src.relative_to(args.research_notes.resolve()).as_posix())}"
    )
    handoff = ''
    if 'compiled_experiment' in metadata:
        if args.compiler_projection_data is None:
            raise ValueError('Article compiled_experiment requires an explicit pinned offline public Compiler projection')
        record = resolve_reference(metadata['compiled_experiment'],
                                   args.compiler_projection_data,
                                   f'https://tyharbin.com/articles/{slug}/', args.research_notes_sha)
        handoff = render_handoff(record)
    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="{html.escape(metadata['description'], quote=True)}"><title>{html.escape(metadata['title'])} — Tyler J.H.G.</title>{math_style}<link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/2071.css"></head><body><a class="skip-link" href="#article-main">Skip to article</a>{navigation}<main id="article-main" tabindex="-1" class="notebook-reader"><p class="eyebrow">RESEARCH ARTICLE · {html.escape(metadata['date'])}</p><article class="notebook-content myst-reader">{str(article)}</article>{handoff}<p class="article-source-links"><a href="/research/">← Research index</a> · <a href="{html.escape(article_source_url, quote=True)}" target="_blank" rel="noreferrer">Canonical MyST source ↗</a></p></main><script src="/assets/site.js"></script>{'<script src="/assets/article-runtime.js"></script>' if has_executable else ''}</body></html>'''
    (reader / "index.html").write_text(page, encoding="utf-8")
    rendered_article = reader / "index.html"
    entry = {
        "sequence": sequence,
        "path": f"publication/articles/{src.name}",
        "slug": slug,
        "url": f"/articles/{slug}/",
        "title": metadata["title"],
        "description": metadata["description"],
        "date": metadata["date"],
        "sha256": hashlib.sha256(src.read_bytes()).hexdigest(),
        "renderedSha256": sha256(rendered_article),
        "assets": copied_assets,
        "browserExecution": has_executable,
    }
    if 'compiled_experiment' in metadata:
        entry['compiled_experiment'] = metadata['compiled_experiment']
    for key in (
        'shortTitle', 'modelFocus', 'modelVariant', 'dependsOn', 'tags',
        'frontierObserved', 'frontierOpen', 'frontierNext',
    ):
        if key in metadata:
            entry[key] = metadata[key]
    return entry


def copy_thebe_assets(args: argparse.Namespace) -> None:
    portfolio = args.portfolio.resolve()
    helper = portfolio / "node_modules/thebe-core/bin/copy-thebe-assets.cjs"
    destination = (args.output / "assets/thebe").resolve()
    destination.mkdir(parents=True, exist_ok=True)
    if not helper.is_file():
        raise ValueError("Pinned Thebe asset helper is missing; install Portfolio npm dependencies")
    subprocess.run(["node", str(helper), str(destination)], check=True, cwd=portfolio)
    for required in ("thebe-lite.min.js", "index.js", "thebe.css"):
        if not (destination / required).is_file():
            raise ValueError(f"Thebe browser runtime is incomplete: {required}")

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

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--portfolio", type=Path, required=True)
    parser.add_argument("--research-notes", type=Path, required=True)
    parser.add_argument("--theorem-library", type=Path, required=True)
    parser.add_argument("--myst-html", type=Path, required=True,
                        help="The server-rendered index.html produced by the pinned MyST build")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--portfolio-sha", required=True)
    parser.add_argument("--research-notes-sha", required=True)
    parser.add_argument("--theorem-library-sha", required=True)
    parser.add_argument("--compiler-projection", type=Path, help="Offline versioned public Compiler experiments.json; required only for referenced articles")
    parser.add_argument("--compiler-projection-pin", type=Path, help="Exact public Compiler source commit and projection byte digest")
    parser.add_argument("--fleet-sha", help="Legacy v1 manifest only; public candidate builds omit this private source")
    return parser.parse_args()


def validate_sources(args: argparse.Namespace) -> None:
    parser = argparse.ArgumentParser(add_help=False)
    for revision in (
        args.portfolio_sha, args.research_notes_sha, args.theorem_library_sha, args.fleet_sha
    ):
        if revision is not None and not re.fullmatch(r"[0-9a-f]{40}", revision):
            parser.error("Every source revision must be an exact 40-character lowercase commit SHA")
    for source in (
        args.portfolio / "site",
        args.research_notes / "notebooks",
        args.research_notes / "reference",
        args.research_notes / "articles",
        args.theorem_library,
    ):
        if not source.is_dir():
            parser.error(f"Missing pinned public source directory: {source}")
        if any(path.is_symlink() for path in (source, *source.rglob("*"))):
            parser.error(f"Publication source contains a symlink: {source}")
    expected_myst_html = (args.research_notes / "_build/html/index.html").resolve()
    if (args.myst_html.resolve() != expected_myst_html or args.myst_html.is_symlink() or
            not args.myst_html.is_file()):
        parser.error("MyST HTML must be the static build output inside the exact Research Notes checkout")
    try:
        ordered_sources = _myst_article_sources(args.research_notes)
        for source in ordered_sources:
            page = _myst_article_html_path(args.myst_html, source, ordered_sources)
            if BeautifulSoup(page.read_text(encoding="utf-8"), "html.parser").select_one("article.myst-article") is None:
                raise ValueError(f"MyST page has no static article content: {page}")
    except (OSError, ValueError) as exc:
        parser.error(f"The exact Research Notes MyST output is incomplete: {exc}")


def prepare_output(args: argparse.Namespace) -> tuple[Path, Path]:
    if args.output.exists():
        shutil.rmtree(args.output)
    shutil.copytree(args.portfolio / "site", args.output)
    publication = args.output / "publication" / "notebooks"
    publication.mkdir(parents=True)
    reader_root = args.output / "notebooks"
    reader_root.mkdir(parents=True)
    copy_lab_contents(args.research_notes, args.output)
    return publication, reader_root


def publication_navigation(portfolio: Path):
    research_page = BeautifulSoup((portfolio / "site/research/index.html").read_text(), "html.parser")
    navigation = research_page.select_one("header.topbar")
    if navigation is None:
        raise ValueError("Portfolio Research page is missing its shared navigation")
    for current in navigation.select("[aria-current]"):
        current["aria-current"] = "location"
    return navigation


def _fallback_cells(notebook) -> list[str]:
    cells = []
    for cell in notebook.get("cells", []):
        source = "".join(cell.get("source", []))
        if cell.get("cell_type") == "markdown":
            cells.append('<section class="nb-markdown">' + render_markdown(source) + "</section>")
        elif cell.get("cell_type") == "code":
            outputs = [render_output(output) for output in cell.get("outputs", [])]
            cells.append(
                '<section class="nb-code"><div class="nb-cell-head"><span>Python</span>'
                '<span>Code cell</span></div><pre><code>' + html.escape(source) +
                "</code></pre>" + "".join(outputs) + "</section>"
            )
    return cells


def _render_notebook(notebook, fallback: list[str]) -> str:
    config = Config()
    config.HTMLExporter.exclude_input_prompt = True
    config.HTMLExporter.exclude_output_prompt = True
    exporter = HTMLExporter(template_name="lab", config=config)
    rendered_body, _ = exporter.from_notebook_node(notebook)
    body_match = re.search(r"<body[^>]*>(.*)</body>", rendered_body, flags=re.S | re.I)
    rendered = body_match.group(1) if body_match else "".join(fallback)
    rendered = re.sub(r'<a class="anchor-link"[^>]*>.*?</a>', "", rendered, flags=re.S)
    return re.sub(r'<a[^>]*class="[^"]*anchor[^"]*"[^>]*>¶</a>', "", rendered, flags=re.S)


def publish_notebook(src: Path, publication: Path, reader_root: Path, navigation,
                     notebook_paths: set[Path], args: argparse.Namespace) -> dict:
    dst = publication / src.name
    shutil.copy2(src, dst)
    notebook = nbformat.read(src, as_version=4)
    metadata = notebook.metadata.get("publication", {})
    rendered = _render_notebook(notebook, _fallback_cells(notebook))
    title, rendered = prepare_reader(
        rendered, src, notebook_paths, args.research_notes, args.research_notes_sha
    )
    rendered = apply_output_descriptions(notebook, rendered)
    slug = src.stem
    reader = reader_root / slug
    reader.mkdir()
    lab_label = (
        "Run illustrative example in Lab ↗"
        if metadata.get("exampleKind") == "illustrative"
        else "Inspect or run in Lab ↗"
    )
    evidence_note = (
        "Illustrative browser example. Its outputs explain a method; they are not evidence "
        "that the research experiment was reproduced."
        if metadata.get("exampleKind") == "illustrative"
        else "Preserved source notebook. Recorded outputs belong to the pinned source "
        "snapshot; execution status and scientific acceptance are not inferred from them."
    )
    evidence_note += (
        " Opening, downloading, or running a notebook is not independent reproduction. "
        "Compare exact source, configuration and inputs, endpoint units, scientific checks "
        "and acceptance criteria with the authoritative experiment record. Browser execution "
        "may be unavailable; the published notebook remains readable."
    )
    source_url = (
        "https://github.com/pH34r-pH/research-notes/blob/" + args.research_notes_sha
        + "/" + quote(src.relative_to(args.research_notes).as_posix(), safe="/")
    )
    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)} — Tyler J.H.G.</title><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/2071.css"></head><body><a class="skip-link" href="#notebook-main">Skip to notebook</a>{navigation}<main id="notebook-main" tabindex="-1" class="notebook-reader"><a class="back" href="/research/">← Research index</a><header><p class="eyebrow">RESEARCH NOTEBOOK</p><h1>{html.escape(title)}</h1><p>Read the published notebook. <a href="/lab/lab/index.html?path=notebooks%2F{quote(src.name)}">{lab_label}</a></p><aside aria-label="Notebook evidence and reproduction"><p>{html.escape(evidence_note)}</p><p><a href="{html.escape(source_url, quote=True)}">Exact source revision</a> · <a href="/publication/notebooks/{quote(src.name)}" download>Download preserved notebook</a> · <a href="https://experiments.tyharbin.com/">Authoritative experiment catalog</a></p><p>Notebook SHA-256: <code style="overflow-wrap:anywhere">{sha256(dst)}</code></p></aside></header><article class="notebook-content">{rendered}</article><p><a class="back" href="/research/">← Research index</a></p></main><script src="/assets/site.js"></script></body></html>'''
    (reader / "index.html").write_text(page, encoding="utf-8")
    entry = {
        "path": f"publication/notebooks/{src.name}",
        "jupyterPath": "notebooks/" + src.name,
        "slug": slug,
        "title": title,
        "sha256": sha256(dst),
    }
    entry.update({
        key: metadata[key]
        for key in ("question", "sequence", "exampleKind")
        if key in metadata
    })
    return entry


def write_publication_metadata(args: argparse.Namespace, notebooks: list[dict], articles: list[dict]) -> None:
    atlas_source = args.portfolio / "site" / "data" / "atlas-evidence.json"
    atlas_target = args.output / "data" / "atlas-evidence.json"
    atlas_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(atlas_source, atlas_target)
    sources = {
        "portfolio": {"repository": "pH34r-pH/Portfolio", "commit": args.portfolio_sha},
        "researchNotes": {"repository": "pH34r-pH/research-notes", "commit": args.research_notes_sha},
        "theoremLibrary": {"repository": "pH34r-pH/theorem-library", "commit": args.theorem_library_sha},
    }
    if args.fleet_sha:
        sources["fleet"] = {"repository": "pH34r-pH/long-haul-fleet", "commit": args.fleet_sha}
    manifest = {
        "schemaVersion": 1 if args.fleet_sha else 2,
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "notebooks": notebooks,
        "articles": articles,
    }
    if args.compiler_projection_receipt is not None:
        manifest["compilerProjection"] = args.compiler_projection_receipt
    (args.output / "publication.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    (args.output / "jupyter-lite.json").write_bytes(
        (args.portfolio / "jupyter-lite.json").read_bytes()
    )


def main() -> None:
    args = parse_args()
    validate_sources(args)
    args.compiler_projection_data, args.compiler_projection_receipt = None, None
    if (args.compiler_projection is None) != (args.compiler_projection_pin is None):
        raise ValueError('Compiler projection and pin must be provided together')
    if args.compiler_projection is not None:
        args.compiler_projection_data, args.compiler_projection_receipt = verified_projection(
            args.compiler_projection, args.compiler_projection_pin)
    publication, reader_root = prepare_output(args)
    notebook_paths = {
        path.resolve()
        for path in (args.research_notes / "notebooks").glob("*.ipynb")
    }
    navigation = publication_navigation(args.portfolio)
    source_digests = _source_file_index(args.research_notes)
    notebooks = [
        publish_notebook(src, publication, reader_root, navigation, notebook_paths, args)
        for src in (args.research_notes / "notebooks").glob("*.ipynb")
    ]
    notebooks.sort(key=lambda item: (item.get("sequence", 0), item["path"]), reverse=True)
    article_sources = _myst_article_sources(args.research_notes)
    articles = [publish_article(src, navigation, args, source_digests, sequence, article_sources)
                for sequence, src in enumerate(article_sources, start=1)]
    if not articles:
        raise ValueError("The exact Research Notes source has no canonical articles")
    if any(article["browserExecution"] for article in articles):
        copy_thebe_assets(args)
    write_publication_metadata(args, notebooks, articles)


if __name__ == "__main__":
    main()
