"""Verify the explicit immutable public Compiler input before publication."""
import argparse
import hashlib
import json
import re
from pathlib import Path

REPOSITORY = 'pH34r-pH/experiment-compiler'


def load_pin(path):
    if path.is_symlink():
        raise ValueError('Compiler projection pin must be a regular file')
    pin = json.loads(path.read_text())
    if not isinstance(pin, dict) or set(pin) != {'schemaVersion', 'repository', 'commit', 'projectionSha256'}:
        raise ValueError('Invalid Compiler projection pin fields')
    if type(pin['schemaVersion']) is not int or pin['schemaVersion'] != 1:
        raise ValueError('Compiler projection pin schemaVersion 1 is required')
    if pin['repository'] != REPOSITORY:
        raise ValueError('Compiler projection pin has the wrong public repository')
    for field, length in (('commit', 40), ('projectionSha256', 64)):
        if not isinstance(pin[field], str) or not re.fullmatch(f'[0-9a-f]{{{length}}}', pin[field]):
            raise ValueError(f'Compiler projection pin requires exact {field}')
    return pin


def verified_projection(path, pin_path):
    pin = load_pin(pin_path)
    if path.is_symlink() or not path.is_file():
        raise ValueError('Compiler projection must be a regular file')
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != pin['projectionSha256']:
        raise ValueError('Compiler projection bytes do not match the pinned SHA-256')
    projection = json.loads(raw)
    if (not isinstance(projection, dict) or type(projection.get('schemaVersion')) is not int
            or projection.get('schemaVersion') != 2):
        raise ValueError('Compiler public projection schemaVersion 2 is required')
    if projection.get('project') != {'name': 'Experiment Compiler',
            'repository': f'https://github.com/{REPOSITORY}'}:
        raise ValueError('Compiler public projection authority is invalid')
    receipt = {'repository': pin['repository'], 'commit': pin['commit'],
               'sha256': pin['projectionSha256'], 'schemaVersion': 2}
    return projection, receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pin', required=True, type=Path)
    args = parser.parse_args()
    pin = load_pin(args.pin)
    print(f"commit={pin['commit']}")
    print(f"sha256={pin['projectionSha256']}")


if __name__ == '__main__':
    main()
