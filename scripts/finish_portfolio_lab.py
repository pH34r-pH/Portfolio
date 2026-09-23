#!/usr/bin/env python3
"""Attach Portfolio-owned navigation to built Lab entrypoints."""
import argparse
import re
import shutil
from pathlib import Path


def finish_lab(portfolio: Path, bundle: Path) -> None:
    # Legacy flat notebooks resolve ../reference outside /files/.
    shutil.copytree(bundle / 'publication/lab-contents/reference',
                    bundle / 'lab/reference', dirs_exist_ok=True)
    fragment = portfolio / 'publication/lab-return.html'
    if not fragment.exists():
        return  # Compatible with earlier independently pinned Portfolio revisions.
    if not (bundle / 'assets/lab-return.css').is_file():
        raise ValueError('Lab return navigation is missing its Portfolio stylesheet')
    # /lab/tree and /lab/workspaces are script-only redirects to this document.
    entrypoints = [bundle / 'lab/lab/index.html']
    if not entrypoints[0].is_file():
        raise ValueError('Built JupyterLab entrypoint is missing')
    for page in entrypoints:
        if not page.is_file():
            continue
        content = page.read_text()
        if 'id="portfolio-lab-return"' in content:
            continue
        content = content.replace('</head>', '<link rel="stylesheet" href="/assets/lab-return.css"></head>')
        content, count = re.subn(r'(<body\b[^>]*>)', lambda m: m[1] + fragment.read_text(), content, count=1)
        if count != 1:
            raise ValueError(f'Cannot attach return navigation to {page}')
        page.write_text(content)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--portfolio', type=Path, required=True)
    parser.add_argument('--bundle', type=Path, required=True)
    args = parser.parse_args()
    finish_lab(args.portfolio, args.bundle)
