"""Bounded documentation and tracked-artifact hygiene checks.

The checker intentionally operates on a supplied changed-file set. Existing
historical warnings are not a reason to block unrelated changes.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

LIVING_DOC_EXCEPTIONS = {"README.md", "AGENTS.md"}
IMMUTABLE_OR_GENERATED_ALLOWED = {
    "publication/compiler-projection.lock.json",
    "publication/lab-return.html",
}
FORBIDDEN_PARTS = {

    ".cache",
    ".jupyterlite.doit.db",
    ".pytest_cache",
    ".venv",
    "__pycache__",
    "build",
    "cache",
    "dist",
    "node_modules",
    "temp",
    "tmp",
    "ux-screenshots",
}
FORBIDDEN_SUFFIXES = {".bak", ".log", ".pyc", ".pyo", ".tmp"}
BAD_LIVING_STEMS = {"draft", "new", "notes", "tmp", "temp", "untitled"}
DESCRIPTIVE_SLUG = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
CONVENTIONAL_NAME = re.compile(r"^(?:adr|spec)-?\d+$", re.IGNORECASE)


def _relative(path: str | Path, root: Path) -> Path:
    candidate = Path(path)
    if not candidate.is_absolute():
        return candidate
    return candidate.resolve().relative_to(root.resolve())


def _is_new_living_doc(path: Path, new_paths: set[str]) -> bool:
    return path.suffix.lower() in {".md", ".markdown"} and path.as_posix() in new_paths


def _check_doc_name(path: Path, new_paths: set[str]) -> list[str]:
    if not _is_new_living_doc(path, new_paths) or not is_living_doc(path):
        return []
    if path.name in LIVING_DOC_EXCEPTIONS:
        return []
    stem = path.stem.lower()
    if stem in BAD_LIVING_STEMS or re.fullmatch(r"(?:issue-)?\d+", stem):
        return [f"new living document needs a descriptive name: {path}"]
    if not DESCRIPTIVE_SLUG.fullmatch(stem) and not CONVENTIONAL_NAME.fullmatch(path.stem):
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


def is_living_doc(path: Path) -> bool:
    """Return whether style/link tooling should inspect this Markdown file."""
    if path.suffix.lower() not in {".md", ".markdown"}:
        return False
    if path.as_posix() in {"README.md", "AGENTS.md"}:
        return True
    if path.parts and path.parts[0] == "docs" and path.name.startswith("live-review-"):
        return False
    return bool(path.parts and path.parts[0] in {"docs", "design", "publication", "scripts", "site"})


def check_paths(root: Path, paths: list[str | Path], new_paths: set[str] | None = None) -> list[str]:
    new_paths = new_paths or set()
    errors: list[str] = []
    for raw_path in paths:
        path = _relative(raw_path, root)
        errors.extend(_check_artifact(path))
        errors.extend(_check_doc_name(path, new_paths))
    return errors


def _git_paths(root: Path, since: str) -> tuple[list[str], set[str]]:
    command = ["git", "diff", "--name-only", "-z", "--diff-filter=ACMRT", f"{since}...HEAD"]
    changed = subprocess.check_output(command, cwd=root).decode().split("\0")
    changed = [path for path in changed if path]
    added = subprocess.check_output(
        ["git", "diff", "--name-only", "-z", "--diff-filter=AR", f"{since}...HEAD"],
        cwd=root,
    ).decode().split("\0")
    added = [path for path in added if path]
    return changed, set(added)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--paths", nargs="+", help="changed paths to check")
    parser.add_argument("--changed-since", help="git revision used for the changed-file ratchet")
    parser.add_argument("--list-living-docs", action="store_true", help="print changed living docs")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.changed_since:
        paths, new_paths = _git_paths(root, args.changed_since)
    elif args.paths:
        paths, new_paths = args.paths, set(args.paths)
    else:
        parser.error("provide --paths or --changed-since")
    if args.list_living_docs:
        living_docs = [path for path in paths if is_living_doc(Path(path))]
        if living_docs:
            sys.stdout.write("\n".join(living_docs) + "\n")
        return 0
    errors = check_paths(root, paths, new_paths)
    if errors:
        print("\n".join(errors))
        return 1
    print(f"Documentation/artifact hygiene passed for {len(paths)} changed path(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
