import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../design/interaction-coverage.json', import.meta.url), 'utf8'));
const allowed = new Set(['automated', 'automated-with-fixture-limit', 'automated-artifact-only', 'uncovered', 'manual', 'separate-owner']);
assert.equal(manifest.schemaVersion, 1);
assert.ok(manifest.coverage.length >= 10, 'The interaction inventory should cover the requested route and state families');
for (const test of manifest.testRunners) {
  assert.ok(existsSync(new URL(`../${test}`, import.meta.url)), `Missing listed runner ${test}`);
}
const ids = new Set();
for (const area of manifest.coverage) {
  assert.ok(area.id && !ids.has(area.id), `Coverage entries need unique IDs: ${area.id}`);
  ids.add(area.id);
  assert.ok(allowed.has(area.status), `${area.id}: unknown status ${area.status}`);
  assert.ok(Array.isArray(area.surfaces) && area.surfaces.length, `${area.id}: identify its real surface`);
  assert.ok(Array.isArray(area.tests), `${area.id}: tests must be listed explicitly`);
  assert.ok(area.status !== 'uncovered' || area.limits?.length, `${area.id}: uncovered coverage needs a reason`);
  for (const test of area.tests) {
    const path = test.startsWith('.github/') || test === 'lighthouserc.cjs'
      ? `../${test}`
      : `../scripts/${test.replace(/^scripts\//, '')}`;
    assert.ok(existsSync(new URL(path, import.meta.url)), `${area.id}: missing test runner ${test}`);
  }
}
console.log(`Interaction coverage manifest passed: ${manifest.coverage.length} areas; ${ids.size} unique IDs.`);
