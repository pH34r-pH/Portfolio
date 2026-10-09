import {decodeWeights, forwardBytes, sampleByte, seededRandom} from './model-inference.js';
let modelPromise, generation = 0;

async function loadModel() {
  if (!modelPromise) modelPromise = (async () => {
    const response = await fetch(new URL('./lm/manifest.json', import.meta.url));
    if (!response.ok) throw new Error('Trained model manifest is unavailable');
    const manifest = await response.json();
    const weights = await fetch(new URL('./lm/unit-hypersphere.f32', import.meta.url));
    if (!weights.ok) throw new Error('Trained model weights are unavailable');
    const buffer = await weights.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('');
    if (digest !== manifest.sha256) throw new Error('Trained model checksum mismatch');
    return decodeWeights(manifest, buffer);
  })().catch(error => { modelPromise = null; throw error; });
  return modelPromise;
}

self.onmessage = async ({data}) => {
  if (data.type === 'cancel') { generation++; return; }
  const id = data.id, ownGeneration = ++generation;
  try {
    const model = await loadModel();
    if (ownGeneration !== generation) return;
    if (data.type === 'load') { self.postMessage({type:'ready', id, manifest:model.manifest}); return; }
    const prompt = String(data.prompt), count = Number(data.count), temperature = Number(data.temperature);
    if (!Number.isInteger(count) || count < 1 || count > 128 || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)
      throw new Error('Invalid generation settings');
    const bytes = Array.from(new TextEncoder().encode(prompt)), emitted = [], random = seededRandom(Number(data.seed));
    for (let token = 0; token < count && ownGeneration === generation; token++) {
      const result = forwardBytes(bytes, model), byte = sampleByte(result.logits, temperature, random);
      emitted.push(byte); bytes.push(byte);
      self.postMessage({type:'token', id, token, byte, emitted:[...emitted], ...result});
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (ownGeneration === generation) self.postMessage({type:'complete', id, emitted});
  } catch (error) { self.postMessage({type:'error', id, message:error.message}); }
};
