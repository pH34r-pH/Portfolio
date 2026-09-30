"""Render only source-owned public experiment evidence in an article reader."""
import html
import math
from urllib.parse import quote

ORIGIN = 'https://experiments.tyharbin.com'
STATUSES = {
    'https://schema.org/ActiveActionStatus': 'Active',
    'https://schema.org/CompletedActionStatus': 'Completed',
    'https://schema.org/FailedActionStatus': 'Failed',
}


def _text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'Invalid public experiment {label}')
    return html.escape(value)


def _member(value):
    _text(value, 'package member reference')
    parts = value.split('/')
    if (len(value) > 1024 or any(ord(char) < 32 for char in value)
            or any(char in value for char in '\\:*?"<>|')
            or any(part in ('', '.', '..') or part.endswith(('.', ' ')) for part in parts)):
        raise ValueError('Unsafe public experiment package member reference')
    reserved = {'CON', 'PRN', 'AUX', 'NUL'} | {f'{prefix}{number}'
        for prefix in ('COM', 'LPT') for number in range(1, 10)}
    if any(part.split('.')[0].upper() in reserved for part in parts):
        raise ValueError('Nonportable public experiment package member reference')
    return f'<code>{html.escape(value)}</code>'


def _optional_text(record, key, label):
    value = record.get(key)
    if value is None:
        return ''
    return f'<h3>{label}</h3><p class="source-text">{_text(value, key)}</p>'


def _attempt(attempt):
    if not isinstance(attempt, dict) or set(attempt) != {'id', 'actionStatus', 'result'}:
        raise ValueError('Invalid public execution attempt fields')
    identifier = _text(attempt['id'], 'attempt identifier')
    if not isinstance(attempt['actionStatus'], str) or attempt['actionStatus'] not in STATUSES:
        raise ValueError('Invalid public execution attempt status')
    results = attempt['result']
    if not isinstance(results, list):
        raise ValueError('Invalid public execution result references')
    members = [_member(value) for value in results]
    if len(results) != len(set(results)):
        raise ValueError('Duplicate public execution result reference')
    content = ('<ul>' + ''.join(f'<li>{value}</li>' for value in members) + '</ul>'
               if members else '<p>No result member references are recorded.</p>')
    return (f'<li><strong>{STATUSES[attempt["actionStatus"]]}</strong> — <code>{identifier}</code>'
            '<details><summary>Retained result references</summary>' + content + '</details></li>')


def _attempts(record):
    attempts = record.get('executionAttempts')
    if attempts is None:
        return '<p>Execution attempts are not declared in this public record.</p>', set()
    if not isinstance(attempts, list):
        raise ValueError('Invalid public execution attempts')
    content = [_attempt(attempt) for attempt in attempts]
    identifiers = [attempt['id'] for attempt in attempts]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError('Duplicate public execution attempt identifier')
    if not content:
        return '<p>No execution attempts are recorded. This does not establish execution.</p>', set()
    return '<ul>' + ''.join(content) + '</ul>', set(identifiers)


def _interpretation(record, identifiers):
    interpretations = record.get('scientificInterpretation')
    if interpretations is None:
        return '<p>Scientific interpretation is not declared in this public record.</p>'
    if not isinstance(interpretations, list):
        raise ValueError('Invalid public scientific interpretation')
    content = []
    for item in interpretations:
        if not isinstance(item, dict) or set(item) != {'record', 'summary', 'aboutAttempt'}:
            raise ValueError('Invalid public scientific interpretation fields')
        attempt = _text(item['aboutAttempt'], 'interpretation attempt')
        if item['aboutAttempt'] not in identifiers:
            raise ValueError('Scientific interpretation references an unavailable attempt')
        member = _member(item['record'])
        summary = _text(item['summary'], 'scientific interpretation summary')
        content.append(f'<p class="source-text">{summary}</p><p>Source: {member}; attempt <code>{attempt}</code>.</p>')
    return ''.join(content) or '<p>No scientific interpretation is recorded.</p>'


def _finite_numbers(value):
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError('Nonfinite public scientific value')
    if isinstance(value, dict):
        for item in value.values():
            _finite_numbers(item)
    elif isinstance(value, list):
        for item in value:
            _finite_numbers(item)


def _acceptance(record):
    result = record.get('result')
    _finite_numbers(result)
    acceptance = record.get('acceptance')
    if acceptance is not None and not isinstance(acceptance, dict):
        raise ValueError('Invalid public scientific acceptance criteria')
    _finite_numbers(acceptance)
    if result is None:
        return 'Scientific acceptance is not declared as a pass/fail field in this public record.'
    if not isinstance(result, dict):
        raise ValueError('Invalid public scientific result')
    if 'acceptancePassed' not in result:
        return 'Scientific acceptance is not declared as a pass/fail field in this public record.'
    if type(result['acceptancePassed']) is not bool:
        raise ValueError('Invalid public scientific acceptance status')
    status = 'passed' if result['acceptancePassed'] else 'failed'
    return f'The source result reports that its scientific acceptance checks {status}.'


def _protocol(record):
    protocol = record.get('protocol')
    if protocol is None:
        return '<p>A full protocol is not included in this public record; inspect Compiler for available source records.</p>'
    if not isinstance(protocol, dict) or set(protocol) != {'record', 'text'}:
        raise ValueError('Invalid public experiment protocol fields')
    member = _member(protocol['record'])
    text = _text(protocol['text'], 'protocol text')
    return ('<details><summary>Full authoritative protocol</summary>'
            f'<p>Source: {member}</p><pre class="source-text" tabindex="0" '
            f'aria-label="Full authoritative experiment protocol">{text}</pre></details>')


def _identity(record):
    package, source = record['package'], record['source']
    digest = html.escape(package['sha256'])
    repository, commit = source['repository'], source['commit']
    source_url = f'https://github.com/{quote(repository, safe="/")}/tree/{commit}'
    return (f'<p><a href="{ORIGIN}/packages/{digest}.zip" download>Download exact package</a>'
            f' · <a href="{source_url}">Exact scientific source</a></p>'
            f'<p>Package SHA-256: <code>{digest}</code><br>'
            f'Scientific source: <code>{html.escape(repository)}@{html.escape(commit)}</code><br>'
            f'Package profile: <code>{html.escape(record["profile"])}</code></p>')


def render_worklog(record):
    attempts, identifiers = _attempts(record)
    return ('<section class="compiled-experiment-evidence" aria-label="Artifact-derived experiment evidence">'
            '<h2>Experiment evidence</h2>' + _identity(record)
            + _optional_text(record, 'question', 'Question') + _optional_text(record, 'method', 'Method')
            + '<h3>Recorded execution attempts</h3>' + attempts
            + '<p>Completed execution does not establish scientific acceptance or independent reproduction.</p>'
            + '<h3>Source-owned scientific interpretation</h3>' + _interpretation(record, identifiers)
            + f'<p>{_acceptance(record)}</p>' + _protocol(record)
            + '<p>The published digest identifies the package; this reader does not independently verify its integrity. '
            'Independent reproduction is not established by this page.</p></section>')
