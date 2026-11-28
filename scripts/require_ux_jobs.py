#!/usr/bin/env python3
"""Final qualification gate: every job this change needed must have succeeded.

GitHub reports a job as `skipped` both when it was never needed and when an
upstream job failed, so skipped alone proves nothing. A job passes the gate only
if it succeeded, or it was skipped and was not expected to run.
"""
from __future__ import annotations

import json
import os
import sys

# needs-job id -> scope output that says the job was expected to run.
EXPECTED = {'checks': 'checks', 'record': 'media', 'lighthouse': 'lighthouse', 'build': 'bundle', 'pages-copy': 'pages'}


def evaluate(needs: dict, selection: dict) -> tuple[list[tuple[str, str, bool]], list[str]]:
    rows, failures = [], []
    if needs.get('scope', {}).get('result') != 'success':
        failures.append('scope: change classification did not succeed')
    expected = {job: selection.get(key) == 'true' for job, key in EXPECTED.items()}
    expected['audit'] = selection.get('audits', '[]') != '[]'
    for job, info in sorted(needs.items()):
        result = info.get('result')
        want = job == 'scope' or expected.get(job, False)
        rows.append((job, result, want))
        if result not in ('success', 'skipped'):
            failures.append(f'{job}: {result}')
        elif want and result != 'success':
            failures.append(f'{job}: expected to run but was {result}')
    return rows, failures


def main() -> int:
    needs = json.loads(os.environ['NEEDS_JSON'])
    selection = {key: os.environ.get(key.upper(), '') for key in ('checks', 'media', 'lighthouse', 'bundle', 'pages', 'audits')}
    rows, failures = evaluate(needs, selection)
    table = ['| job | result | expected |', '| --- | --- | --- |']
    table += [f'| {job} | {result} | ' + ('yes' if want else 'no') + ' |' for job, result, want in rows]
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as handle:
            handle.write('### Qualification gate\n\n' + '\n'.join(table) + '\n')
    print('\n'.join(table))
    for failure in failures:
        print(f'::error::{failure}', file=sys.stderr)
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
