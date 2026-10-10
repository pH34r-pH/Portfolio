import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeWeights, forwardBytes, sampleByte, seededRandom} from '../site/assets/model-inference.js';

const manifest = JSON.parse(await readFile('site/assets/lm/manifest.json', 'utf8'));
const bytes = await readFile('site/assets/lm/unit-hypersphere.f32');
const reference = JSON.parse(await readFile('scripts/fixtures/lm-reference.json', 'utf8'));
const digest = createHash('sha256').update(bytes).digest('hex');
assert.equal(digest, manifest.sha256);
assert.equal(digest, reference.weightsSha256);
const model = decodeWeights(manifest, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
let worst = 0;
for (const fixture of reference.references) {
  const observed = forwardBytes(new TextEncoder().encode(fixture.prompt), model);
  assert.equal(sampleByte(observed.logits, 0, seededRandom(17)), fixture.nextByte, fixture.prompt);
  assert.equal(observed.observations.length, fixture.observations.length);
  for (let i = 0; i < fixture.observations.length; i++) {
    const a = observed.observations[i], b = fixture.observations[i];
    assert.equal(a.pass, b.pass); assert.equal(a.layer, b.layer); assert.equal(a.values.length, b.values.length);
    const error = Math.max(...a.values.map((value, j) => Math.abs(value - b.values[j])));
    worst = Math.max(worst, error);
    assert.ok(error < 1e-4, `${JSON.stringify(fixture.prompt)} pass ${a.pass} layer ${a.layer}: error ${error}`);
  }
  for (const attention of observed.observations.filter(x => x.attentionWeights))
    for (const head of attention.attentionWeights) assert.ok(Math.abs(head.reduce((a, b) => a + b, 0) - 1) < 1e-5);
}
assert.throws(() => decodeWeights(manifest, new ArrayBuffer(4)), /incomplete/);
console.log(`Trained LM matches exact-source PyTorch logits and every captured stage on ${reference.references.length} prompts; max absolute error ${worst}.`);
