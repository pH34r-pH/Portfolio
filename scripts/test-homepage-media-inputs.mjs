// Guards the CI media-cache key: the declared input set must cover everything the
// recording page is known to load, and must react to the files that matter.
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homepageMediaFingerprint, homepageMediaInputs} from './homepage-media-inputs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputs = await homepageMediaInputs();
for (const file of inputs) await access(join(root, file));

// Observed by tracing the recording page's requests (render-homepage-recording.mjs
// re-checks this on every real render).
const observed = ['site.css', 'material-system.css', 'model-glass.css', 'model-machine.css', 'model-machine.js', 'model-scene.js', 'model-renderer.js',
  'model-topology.js', 'model-inference.js', 'model-glass.js', 'model-background-glass.js', 'homepage-screens.js', 'homepage-instruments.js',
  'vendor/three@0.186.1/three.module.js', 'vendor/three@0.186.1/three.core.js', 'lm/manifest.json', 'lm/unit-hypersphere.f32'];
for (const name of observed) assert.ok(inputs.includes(`site/assets/${name}`), `Media inputs must include site/assets/${name}`);

// UI-only surfaces must not invalidate the recording.
for (const name of ['homepage-digital.js', 'homepage-native-model.js', 'physical-stage.js', 'physical-studio.js', 'energy-architecture.js', 'search.js'])
  assert.ok(!inputs.includes(`site/assets/${name}`), `site/assets/${name} does not affect the recording`);
assert.match(await homepageMediaFingerprint(), /^[0-9a-f]{64}$/);
console.log(`Homepage media inputs passed: ${inputs.length} files cover the recording page; UI-only modules are excluded.`);
