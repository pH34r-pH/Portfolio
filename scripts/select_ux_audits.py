#!/usr/bin/env python3
"""Decide which qualification jobs and audits a change scope needs.

Emits GITHUB_OUTPUT lines. The same rules used to live in shell conditionals
spread over two jobs; keeping them here makes them testable and means every
audit is chosen in exactly one place and runs exactly once, on the finished
public bundle that would actually be published.
"""
from __future__ import annotations

import argparse
import json

# name -> command run from the Portfolio checkout against the bundle on :4173.
AUDITS = {
    'ux': 'node scripts/ux-audit.mjs',
    'interaction': 'node scripts/interaction-audit.mjs',
    '2071': 'node scripts/2071-audit.mjs',
    'appearance': 'env PORTFOLIO_STYLE_SCREENSHOTS=ux-screenshots/appearance node scripts/appearance-audit.mjs',
    'homepage-digital-and-lifecycle': 'node scripts/homepage-digital-audit.mjs',
    'model-startup': 'node scripts/model-startup-audit.mjs',
    'model-machine': 'node scripts/model-machine-audit.mjs',
    'model-glass': 'env GLASS_EVIDENCE_DIR=ux-screenshots/leaf03-glass node scripts/model-glass-audit.mjs',
    'model-visual': 'env PORTFOLIO_PUBLISHED_AUDIT_URL="$PORTFOLIO_AUDIT_URL" MODEL_VISUAL_EVIDENCE_DIR=ux-screenshots/visual-v2/visual-audit node scripts/model-visual-audit.mjs',
    'article-model-sticky': 'node scripts/article-model-sticky-audit.mjs',
}
# Layout and accessibility audits apply to every scope except article-only audit changes.
SITE_AUDITS = ('ux', 'interaction', '2071', 'appearance')
FULL_ONLY = ('homepage-digital-and-lifecycle', 'model-startup', 'model-machine', 'model-glass', 'model-visual')
ARTICLE_AUDITS = ('article-model-sticky',)


def select(event: str, fast_path: bool, scope: str) -> dict:
    # A pull request on the fast path needs no bundle. Pushes and manual runs always
    # build one: a push is what Fleet may publish.
    bundle = (event == 'pull_request' and not fast_path) or event in ('push', 'workflow_dispatch')
    names: list[str] = []
    if bundle:
        if scope != 'article-audit':
            names += SITE_AUDITS
        if scope == 'full':
            names += FULL_ONLY
        if scope in ('full', 'article-audit'):
            names += ARTICLE_AUDITS
    return {
        'checks': not fast_path,
        # The bundle embeds the recording, so every bundle needs media.
        'media': (not fast_path) or bundle,
        'lighthouse': (not fast_path) and scope != 'article-audit',
        'bundle': bundle,
        'pages': bundle and (event == 'workflow_dispatch' or (event == 'pull_request' and scope != 'article-audit')),
        'audits': [{'name': name, 'run': AUDITS[name]} for name in names],
    }


def render(selection: dict) -> list[str]:
    lines = []
    for key, value in selection.items():
        text = json.dumps(value, separators=(',', ':')) if key == 'audits' else str(value).lower()
        lines.append(f'{key}={text}')
    return lines


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--event', required=True)
    parser.add_argument('--fast-path', required=True, choices=('true', 'false'))
    parser.add_argument('--scope', required=True)
    args = parser.parse_args()
    print('\n'.join(render(select(args.event, args.fast_path == 'true', args.scope))))


if __name__ == '__main__':
    main()
