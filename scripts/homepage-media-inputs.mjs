// The exact files that determine the recorded homepage media. CI keys its media cache on
// a digest of these, so UI-only edits (panes, copy, search) reuse a rendered recording
// while any change to the model scene, its styles, the weights or the render scripts
// re-renders it. render-homepage-recording.mjs verifies at render time that everything
// its page requested is inside this set, so the key cannot silently go stale.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'site', 'assets');

// Entry points of the recording page and its Node-side driver.
const JS_ENTRIES = ['model-machine.js', 'model-inference.js', 'model-topology.js'];
// Loaded at runtime rather than imported, so the import walk cannot see them.
const RUNTIME_ASSETS = ['site.css', 'material-system.css', 'model-glass.css', 'model-machine.css', 'lm/manifest.json', 'lm/unit-hypersphere.f32',
  'vendor/three@0.186.1/three.module.js', 'vendor/three@0.186.1/three.core.js'];
const SCRIPTS = ['scripts/build-homepage-loop.mjs', 'scripts/render-homepage-recording.mjs', 'scripts/homepage-recorded-run.mjs',
  'scripts/homepage-media-inputs.mjs', 'scripts/verify-homepage-recording.mjs'];
const TOOLCHAIN = ['package.json', 'package-lock.json'];
// Bump when the CI recording procedure changes in a way the files above cannot show.
const PROCEDURE_VERSION = 'v2';

const IMPORT = /(?:\bimport|\bexport)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

async function walk(file, seen) {
  if (seen.has(file)) return;
  seen.add(file);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier.startsWith('.')) await walk(resolve(dirname(file), specifier), seen);
  }
}

export async function homepageMediaInputs() {
  const seen = new Set();
  for (const entry of JS_ENTRIES) await walk(join(assets, entry), seen);
  const files = [...seen, ...RUNTIME_ASSETS.map(name => join(assets, name)), ...[...SCRIPTS, ...TOOLCHAIN].map(name => join(root, name))];
  return [...new Set(files.map(file => relative(root, file).split(sep).join('/')))].sort();
}

export async function homepageMediaFingerprint() {
  const hash = createHash('sha256').update(`procedure ${PROCEDURE_VERSION}\n`);
  for (const file of await homepageMediaInputs()) {
    hash.update(`${file}\0`).update(await readFile(join(root, file))).update('\0');
  }
  return hash.digest('hex');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(process.argv.includes('--list') ? (await homepageMediaInputs()).join('\n') : await homepageMediaFingerprint());
}
