import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./capture-browser-evidence.mjs', import.meta.url));
const digest = fileURLToPath(new URL('./digest_bundle.py', import.meta.url));
const python = process.platform === 'win32' ? 'python' : 'python3';

test('capture rejects the wrong digest and refuses to write into the candidate', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'portfolio-evidence-'));
  try {
    const bundle = path.join(root, 'candidate');
    const output = path.join(root, 'evidence');
    await mkdir(bundle);
    const page = path.join(bundle, 'index.html');
    await writeFile(page, '<p>Fixture</p>\n');
    const tree = spawnSync(python, ['-B', digest, bundle], { encoding: 'utf8' });
    assert.equal(tree.status, 0, tree.stderr);
    const run = (pin, destination) => spawnSync(process.execPath, [
      script, '--bundle', bundle, '--expected-sha256', pin, '--output', destination,
    ], { encoding: 'utf8', timeout: 10000 });

    const wrong = run('0'.repeat(64), output);
    assert.equal(wrong.status, 1, wrong.stderr);
    assert.match(wrong.stderr, /Publication digest mismatch/);
    assert.ok(!existsSync(output));
    const nested = path.join(bundle, 'proof');
    const inside = run(tree.stdout.trim(), nested);
    assert.equal(inside.status, 1, inside.stderr);
    assert.match(inside.stderr, /Keep evidence outside the publication directory/);
    assert.ok(!existsSync(nested));
    assert.equal(await readFile(page, 'utf8'), '<p>Fixture</p>\n');
  } finally {
    const resolved = await realpath(root);
    assert.equal(path.dirname(resolved), await realpath(tmpdir()));
    assert.ok(path.basename(resolved).startsWith('portfolio-evidence-'));
    await rm(resolved, { recursive: true, force: true });
  }
});
