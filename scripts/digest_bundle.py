#!/usr/bin/env python3
"""Hash a complete publication directory by sorted paths and file contents."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def digest_tree(root: Path) -> str:
    if not root.is_dir() or root.is_symlink():
        raise ValueError("Publication root must be a real directory")
    digest = hashlib.sha256(b"fleet-bundle-v1\0")
    count = 0
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Publication cannot contain a symlink: {path}")
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError(f"Publication contains a non-file: {path}")
        name = path.relative_to(root).as_posix().encode("utf-8")
        content_digest = hashlib.sha256()
        size = 0
        with path.open("rb") as file:
            while chunk := file.read(1024 * 1024):
                content_digest.update(chunk)
                size += len(chunk)
        digest.update(len(name).to_bytes(4, "big"))
        digest.update(name)
        digest.update(size.to_bytes(8, "big"))
        digest.update(content_digest.digest())
        count += 1
    if count == 0:
        raise ValueError("Publication directory is empty")
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--expect", help="Fail unless the exact directory digest matches")
    args = parser.parse_args()
    actual = digest_tree(args.root)
    if args.expect is not None and args.expect != actual:
        raise SystemExit(f"Publication digest mismatch: expected {args.expect}, got {actual}")
    print(actual)


if __name__ == "__main__":
    main()
