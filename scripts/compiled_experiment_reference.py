"""Offline, fail-closed article handoff to the public Compiler projection."""
import html
import re

ORIGIN = 'https://experiments.tyharbin.com'


def _matches(pattern, value):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def safe_article_url(value):
    if not _matches(r'https://tyharbin\.com/articles/[a-z0-9-]+/', value):
        raise ValueError('Article URL must be an exact canonical tyharbin.com article route')
    return value


def _reference_identifier(reference):
    if not isinstance(reference, dict) or set(reference) - {'ref', 'expected'}:
        raise ValueError('compiled_experiment requires ref and optional expected assertions')
    identifier = reference.get('ref')
    if (not _matches(r'[a-z0-9][a-z0-9-]{0,79}', identifier)
            or 'latest' in identifier.split('-')):
        raise ValueError('compiled_experiment.ref must be an exact immutable identifier')
    return identifier


def _projection_record(projection, identifier):
    if (not isinstance(projection, dict) or type(projection.get('schemaVersion')) is not int
            or projection.get('schemaVersion') != 2):
        raise ValueError('Compiler public projection schemaVersion 2 is required')
    if projection.get('project') != {'name': 'Experiment Compiler',
            'repository': 'https://github.com/pH34r-pH/experiment-compiler'}:
        raise ValueError('Compiler public projection authority is invalid')
    records = projection.get('experiments')
    if not isinstance(records, list) or any(not isinstance(record, dict) for record in records):
        raise ValueError('Invalid Compiler experiments projection')
    ids = [record.get('id') for record in records]
    if any(not isinstance(value, str) for value in ids) or len(ids) != len(set(ids)):
        raise ValueError('Compiler projection contains ambiguous identifiers')
    matches = [record for record in records if record.get('id') == identifier]
    if len(matches) != 1:
        raise ValueError('Exact compiled experiment is unavailable')
    return matches[0]


def _record_identity(record, identifier):
    if record.get('detailUrl') != f'/experiments/{identifier}/':
        raise ValueError('Compiler detail URL does not match exact identity')
    package = record.get('package') or {}
    source = record.get('source') or {}
    if (not isinstance(package, dict) or not _matches(r'[0-9a-f]{64}', package.get('sha256'))
            or type(package.get('size')) is not int or package['size'] <= 0
            or record.get('profile') not in ('compiled-experiment-v1', 'compiled-experiment-lifecycle-v1')
            or not isinstance(source, dict) or not _matches(r'[0-9a-f]{40}', source.get('commit'))
            or not _matches(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', source.get('repository'))):
        raise ValueError('Compiler package digest, profile or source identity is invalid')
    return {'sha256': package['sha256'], 'profile': record['profile'], 'source': source}


def _expected_pins(reference, actual):
    expected = reference.get('expected', {})
    if not isinstance(expected, dict) or set(expected) - {'sha256', 'profile', 'source'}:
        raise ValueError('Invalid compiled experiment assertions')
    if 'source' in expected and (not isinstance(expected['source'], dict)
            or set(expected['source']) != {'repository', 'commit'}):
        raise ValueError('Expected source requires exactly repository and commit')
    if any(value != actual[key] for key, value in expected.items()):
        raise ValueError('Compiled experiment identity assertion mismatch')


def _article_binding(record, article_url, article_commit):
    safe_article_url(article_url)
    backlinks = record.get('backlinks')
    if not isinstance(backlinks, list):
        raise ValueError('Compiler article relationship is missing')
    for backlink in backlinks:
        if (not isinstance(backlink, dict) or set(backlink) != {'title', 'url', 'sourceCommit'}
                or not isinstance(backlink.get('title'), str) or not backlink['title'].strip()
                or not _matches(r'[0-9a-f]{40}', backlink.get('sourceCommit'))):
            raise ValueError('Invalid Compiler article relationship')
        safe_article_url(backlink.get('url'))
    if not any(link.get('url') == article_url and link.get('sourceCommit') == article_commit
               for link in backlinks):
        raise ValueError('Compiler does not declare this exact article relationship')


def resolve_reference(reference, projection, article_url, article_commit):
    identifier = _reference_identifier(reference)
    record = _projection_record(projection, identifier)
    _expected_pins(reference, _record_identity(record, identifier))
    _article_binding(record, article_url, article_commit)
    return record


def render_handoff(record):
    identifier = html.escape(record['id'])
    url = ORIGIN + record['detailUrl']
    return ('<aside aria-label="Compiled experiment reference"><p>'
            f'<a href="{html.escape(url, quote=True)}">Exact compiled experiment: {identifier}</a>. '
            'Compiler owns the package records and reproduction instructions. '
            'Qualification is unknown unless separately documented by Compiler; this reference '
            'does not establish execution, scientific acceptance, package integrity or independent '
            'reproduction.</p></aside>')
