"""Bounded documentation and tracked-artifact hygiene checks.

The checker intentionally operates on a supplied changed-file set. Existing
historical warnings are not a reason to block unrelated changes.
"""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

LIVING_DOC_EXCEPTIONS = {"README.md", "AGENTS.md"}
IMMUTABLE_OR_GENERATED_ALLOWED = {
    "publication/compiler-projection.lock.json",
    "publication/lab-return.html",
}
FORBIDDEN_PARTS = {
    ".jupyterlite.doit.db",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "ux-screenshots",
}
FORBIDDEN_SUFFIXES = {".pyc", ".pyo"}
BAD_LIVING_STEMS = {"draft", "new", "notes", "tmp", "temp", "untitled"}


def _relative(path: str | Path, root: Path) -> Path:
    candidate = Path(path)
    if not candidate.is_absolute():
        return candidate
    return candidate.resolve().relative_to(root.resolve())


def _is_new_living_doc(path: Path, new_paths: set[str]) -> bool:
    return path.suffix.lower() in {".md", ".markdown"} and path.as_posix() in new_paths


def _check_doc_name(path: Path, new_paths: set[str]) -> list[str]:
    if not _is_new_living_doc(path, new_paths):
        return []
    if path.name in LIVING_DOC_EXCEPTIONS:
        return []
    stem = path.stem.lower()
    if stem in BAD_LIVING_STEMS or len(re.findall(r"[a-z0-9]+", stem)) < 2:
        return [f"new living document needs a descriptive name: {path}"]
    return []


def _check_artifact(path: Path) -> list[str]:
    normalized = path.as_posix()
    if normalized in IMMUTABLE_OR_GENERATED_ALLOWED:
        return []
    if path.suffix.lower() in FORBIDDEN_SUFFIXES or any(part in FORBIDDEN_PARTS for part in path.parts):
        return [f"new or changed path is an unapproved temporary/build artifact: {path}"]
    if path.name in {".DS_Store", "Thumbs.db"}:
        return [f"new or changed path is an unapproved temporary/build artifact: {path}"]
    return []


def _local_link_errors(path: Path, root: Path) -> list[str]:
    if path.suffix.lower() not in {".md", ".markdown"}:
        return []
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    for match in re.finditer(r"!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)", text):
        target = unquote(match.group(1)).strip("<>")
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or not parsed.path:
            continue
        candidate = (path.parent / parsed.path).resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError:
            errors.append(f"local link escapes repository: {path} -> {target}")
            continue
        if not candidate.exists():
            errors.append(f"broken local link: {path} -> {target}")
    return errors


def check_paths(root: Path, paths: list[str | Path], new_paths: set[str] | None = None) -> list[str]:
    new_paths = new_paths or set()
    errors: list[str] = []
    for raw_path in paths:
        path = _relative(raw_path, root)
        errors.extend(_check_artifact(path))
        errors.extend(_check_doc_name(path, new_paths))
        absolute = root / path
        if absolute.is_file():
            errors.extend(_local_link_errors(absolute, root))
    return errors


def _git_paths(root: Path, since: str) -> tuple[list[str], set[str]]:
    command = ["git", "diff", "--name-only", "--diff-filter=ACMRT", f"{since}...HEAD"]
    changed = subprocess.check_output(command, cwd=root, text=True).splitlines()
    added = subprocess.check_output(
        ["git", "diff", "--name-only", "--diff-filter=A", f"{since}...HEAD"],
        cwd=root,
        text=True,
    ).splitlines()
    return changed, set(added)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--paths", nargs="+", help="changed paths to check")
    parser.add_argument("--changed-since", help="git revision used for the changed-file ratchet")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.changed_since:
        paths, new_paths = _git_paths(root, args.changed_since)
    elif args.paths:
        paths, new_paths = args.paths, set(args.paths)
    else:
        parser.error("provide --paths or --changed-since")
    errors = check_paths(root, paths, new_paths)
    if errors:
        print("\n".join(errors))
        return 1
    print(f"Documentation/artifact hygiene passed for {len(paths)} changed path(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
