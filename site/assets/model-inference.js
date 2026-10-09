// Browser/Node forward pass of the retained trained unit-hypersphere byte LM.
// All observations are actual intermediate tensors; no illustrative signals.
const D = 128, H = 4, HD = 32, FF = 512;
const f32 = Math.fround;

export function decodeWeights(manifest, buffer) {
  if (manifest.schemaVersion !== 1 || manifest.condition !== 'unit_hypersphere_depth3'
      || manifest.width !== D || manifest.heads !== H || manifest.depth !== 3
      || buffer.byteLength !== manifest.bytes) throw new Error('Unsupported or incomplete model checkpoint');
  const weights = {};
  for (const [name, item] of Object.entries(manifest.tensors)) {
    if (item.offset % 4 || item.bytes % 4 || item.offset < 0 || item.offset + item.bytes > buffer.byteLength)
      throw new Error(`Invalid checkpoint tensor: ${name}`);
    const values = new Float32Array(buffer, item.offset, item.bytes / 4);
    if (values.length !== item.shape.reduce((a, b) => a * b, 1) || values.some(x => !Number.isFinite(x)))
      throw new Error(`Invalid checkpoint values: ${name}`);
    weights[name] = values;
  }
  return {manifest, weights};
}

function linear(x, rows, inputWidth, outputWidth, weight, bias) {
  const y = new Float32Array(rows * outputWidth);
  for (let t = 0; t < rows; t++) for (let o = 0; o < outputWidth; o++) {
    let sum = bias?.[o] || 0;
    for (let i = 0; i < inputWidth; i++) sum += x[t * inputWidth + i] * weight[o * inputWidth + i];
    y[t * outputWidth + o] = sum;
  }
  return y;
}

function normalize(x, rows, epsilon = 1e-6) {
  const y = new Float32Array(x.length);
  for (let t = 0; t < rows; t++) {
    let norm = 0;
    for (let i = 0; i < D; i++) norm += x[t * D + i] ** 2;
    norm = Math.sqrt(norm);
    if (norm <= epsilon) y[t * D] = 1;
    else for (let i = 0; i < D; i++) y[t * D + i] = x[t * D + i] / norm;
  }
  return y;
}

function residualNorm(a, b, rows, scale, bias, epsilon) {
  const y = new Float32Array(a.length);
  for (let t = 0; t < rows; t++) {
    let mean = 0, variance = 0;
    for (let i = 0; i < D; i++) { const k = t * D + i; y[k] = a[k] + b[k]; mean += y[k]; }
    mean /= D;
    for (let i = 0; i < D; i++) variance += (y[t * D + i] - mean) ** 2;
    const inverse = 1 / Math.sqrt(variance / D + epsilon);
    for (let i = 0; i < D; i++) { const k = t * D + i; y[k] = (y[k] - mean) * inverse * scale[i] + bias[i]; }
  }
  return y;
}

function sphereUpdate(before, proposal, rows, epsilon) {
  const base = normalize(before, rows, epsilon), target = normalize(proposal, rows, epsilon);
  const y = new Float32Array(before.length);
  for (let t = 0; t < rows; t++) {
    let dot = 0;
    for (let i = 0; i < D; i++) dot += base[t * D + i] * target[t * D + i];
    dot = Math.max(-1 + epsilon, Math.min(1, dot));
    const angle = Math.acos(dot), raw = new Float32Array(D);
    let norm = 0;
    for (let i = 0; i < D; i++) { raw[i] = target[t * D + i] - dot * base[t * D + i]; norm += raw[i] ** 2; }
    norm = Math.sqrt(norm);
    const tangent = new Float32Array(D);
    let tangentNorm = 0;
    if (norm > epsilon) for (let i = 0; i < D; i++) { tangent[i] = angle * raw[i] / norm; tangentNorm += tangent[i] ** 2; }
    tangentNorm = Math.sqrt(tangentNorm);
    for (let i = 0; i < D; i++) {
      y[t * D + i] = tangentNorm > epsilon
        ? Math.cos(tangentNorm) * base[t * D + i] + Math.sin(tangentNorm) * tangent[i] / tangentNorm
        : base[t * D + i] + tangent[i];
    }
  }
  return normalize(y, rows, epsilon);
}

function frontend(bytes, model) {
  const ids = [0, ...bytes.map(b => b + 1)], n = ids.length, x = new Float32Array(n * D);
  const real = model.weights['frontend.real.weight'], imag = model.weights['frontend.imag.weight'];
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 16; k++) {
      if (ids[t] !== 0) {
        const phase = f32(t * f32(10000 ** (-k / 16))), c = f32(Math.cos(phase)), s = f32(Math.sin(phase));
        const re = real[ids[t] * 16 + k], im = imag[ids[t] * 16 + k];
        const r = f32(f32(re * c) - f32(im * s)), z = f32(f32(re * s) + f32(im * c));
        if (r || z) {
          const theta = Math.atan2(z, r), rms = f32(model.manifest.scalarRms);
          x[t * D + k] = Math.log(Math.sqrt(f32(r * r + z * z)) + model.manifest.logRadiusEpsilon) / rms;
          x[t * D + 16 + k] = Math.cos(theta) / rms;
          x[t * D + 32 + k] = Math.sin(theta) / rms;
        }
      }
    }
    for (let i = 0; i < D; i++) {
      const phase = t * Math.exp(-Math.log(10000) * (i - i % 2) / D);
      x[t * D + i] += i % 2 ? Math.cos(phase) : Math.sin(phase);
    }
  }
  return normalize(x, n, model.manifest.geometryEpsilon);
}

export function forwardBytes(inputBytes, model) {
  const bytes = Array.from(inputBytes).slice(-model.manifest.contextBytes), n = bytes.length + 1;
  let current = frontend(bytes, model);
  const observations = [], w = model.weights, block = 'blocks.0.';
  const snapshot = (pass, layer, values, extra = {}) => observations.push({pass, layer, values: Array.from(values), ...extra});
  const last = (x, width) => x.slice((n - 1) * width, n * width);
  for (let pass = 1; pass <= 3; pass++) {
    snapshot(pass, 0, last(current, D));
    const qkv = linear(current, n, D, D * 3, w[block + 'self_attn.in_proj_weight'], w[block + 'self_attn.in_proj_bias']);
    snapshot(pass, 1, last(qkv, D * 3));
    const scoreQK = qkv.slice();
    for (let t = 0; t < n; t++) for (let component = 0; component < 2; component++) for (let h = 0; h < H; h++) {
      const start = t * D * 3 + component * D + h * HD;
      for (let i = 16; i < HD; i += 2) {
        const a = qkv[start + i], b = qkv[start + i + 1], norm = Math.sqrt(a * a + b * b + model.manifest.geometryEpsilon ** 2);
        scoreQK[start + i] = Math.SQRT2 * a / norm; scoreQK[start + i + 1] = Math.SQRT2 * b / norm;
      }
    }
    const context = new Float32Array(n * D), attentionWeights = [];
    for (let t = 0; t < n; t++) for (let h = 0; h < H; h++) {
      const scores = new Float32Array(t + 1);
      let maximum = -Infinity;
      for (let j = 0; j <= t; j++) {
        let sum = 0;
        for (let i = 0; i < HD; i++) sum += scoreQK[t * D * 3 + h * HD + i] * scoreQK[j * D * 3 + D + h * HD + i];
        scores[j] = sum / Math.sqrt(HD); maximum = Math.max(maximum, scores[j]);
      }
      let total = 0;
      for (let j = 0; j <= t; j++) { scores[j] = Math.exp(scores[j] - maximum); total += scores[j]; }
      for (let j = 0; j <= t; j++) scores[j] /= total;
      for (let i = 0; i < HD; i++) {
        let sum = 0;
        for (let j = 0; j <= t; j++) sum += scores[j] * qkv[j * D * 3 + D * 2 + h * HD + i];
        context[t * D + h * HD + i] = sum;
      }
      if (t === n - 1) attentionWeights.push(Array.from(scores));
    }
    const headRms = Array.from({length: H}, (_, h) => {
      let sum = 0;
      for (let i = 0; i < HD; i++) sum += context[(n - 1) * D + h * HD + i] ** 2;
      return Math.sqrt(sum / HD);
    });
    snapshot(pass, 2, headRms, {attentionWeights});
    const delta = linear(context, n, D, D, w[block + 'self_attn.out_proj.weight'], w[block + 'self_attn.out_proj.bias']);
    const post = residualNorm(current, delta, n, w[block + 'norm1.weight'], w[block + 'norm1.bias'], model.manifest.normalizationEpsilon);
    snapshot(pass, 3, last(post, D));
    const ffn = linear(post, n, D, FF, w[block + 'linear1.weight'], w[block + 'linear1.bias']);
    for (let i = 0; i < ffn.length; i++) ffn[i] = Math.max(0, ffn[i]);
    snapshot(pass, 4, last(ffn, FF));
    const returned = linear(ffn, n, FF, D, w[block + 'linear2.weight'], w[block + 'linear2.bias']);
    const proposal = residualNorm(post, returned, n, w[block + 'norm2.weight'], w[block + 'norm2.bias'], model.manifest.normalizationEpsilon);
    snapshot(pass, 5, last(proposal, D));
    current = sphereUpdate(current, proposal, n, model.manifest.geometryEpsilon);
    snapshot(pass, 6, last(current, D));
  }
  const logits = linear(last(current, D), 1, D, 256, w['head.weight'], w['head.bias']);
  snapshot(3, 7, logits);
  return {logits: Array.from(logits), observations, contextBytes: bytes.length};
}

export function sampleByte(logits, temperature, random) {
  if (temperature === 0) return logits.indexOf(Math.max(...logits));
  const maximum = Math.max(...logits), probabilities = logits.map(x => Math.exp((x - maximum) / temperature));
  let draw = random() * probabilities.reduce((a, b) => a + b, 0);
  for (let i = 0; i < probabilities.length; i++) { draw -= probabilities[i]; if (draw <= 0) return i; }
  return 255;
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
