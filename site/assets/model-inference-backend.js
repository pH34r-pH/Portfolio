import { cpuLinear, forwardBytes, forwardBytesAsync } from "./model-inference.js";

const prompts = ["", "the model", "attention changes the representation", "the model ".repeat(12)];
const tolerance = 1e-4;

function parity(reference, observed) {
  if (reference.observations.length !== observed.observations.length) throw new Error("Captured stage count differs");
  let worst = 0;
  reference.observations.forEach((a, index) => {
    const b = observed.observations[index];
    if (a.pass !== b.pass || a.layer !== b.layer || a.values.length !== b.values.length) throw new Error("Captured stage shape differs");
    a.values.forEach((value, i) => {
      const error = Math.abs(value - b.values[i]);
      if (!Number.isFinite(error)) throw new Error("Non-finite accelerated result");
      worst = Math.max(worst, error);
    });
    if (a.attentionWeights)
      for (let head = 0; head < a.attentionWeights.length; head++) {
        const weights = b.attentionWeights?.[head];
        if (weights?.length !== a.attentionWeights[head].length) throw new Error("Attention weights differ in shape");
        a.attentionWeights[head].forEach((value, i) => {
          const error = Math.abs(value - weights[i]);
          if (!Number.isFinite(error)) throw new Error("Non-finite attention");
          worst = Math.max(worst, error);
        });
      }
  });
  if (worst >= tolerance) throw new Error(`Accelerated stage error ${worst} exceeds ${tolerance}`);
  return worst;
}

async function qualify(candidate, model, references) {
  const result = { name: candidate.name, totalMs: 0, maxAbsoluteError: 0 };
  for (let index = 0; index < prompts.length; index++) {
    const bytes = new TextEncoder().encode(prompts[index]);
    await forwardBytesAsync(bytes, model, candidate.linear.bind(candidate));
    const start = performance.now(),
      observed = await forwardBytesAsync(bytes, model, candidate.linear.bind(candidate));
    result.totalMs += performance.now() - start;
    result.maxAbsoluteError = Math.max(result.maxAbsoluteError, parity(references[index], observed));
  }
  return result;
}

export async function selectInferenceBackend(model) {
  const references = [],
    cpu = { name: "cpu-worker", totalMs: 0, maxAbsoluteError: 0 },
    candidates = [];
  for (const prompt of prompts) {
    const bytes = new TextEncoder().encode(prompt);
    forwardBytes(bytes, model);
    const start = performance.now();
    references.push(forwardBytes(bytes, model));
    cpu.totalMs += performance.now() - start;
  }
  const report = { selected: cpu.name, scope: "Dense projections; custom geometry/attention remain the verified CPU kernel", tolerance, candidates: [cpu] };
  for (const [module, create] of [
    ["./model-linear-webnn.js", "createWebNNLinear"],
    ["./model-linear-webgpu.js", "createWebGPULinear"],
  ]) {
    let candidate;
    try {
      candidate = await (await import(module))[create]();
      const evidence = await qualify(candidate, model, references);
      candidates.push({ candidate, evidence });
      report.candidates.push(evidence);
    } catch (error) {
      candidate?.dispose();
      report.candidates.push({ name: create === "createWebNNLinear" ? "webnn-hybrid" : "webgpu-hybrid", unavailable: error.message });
    }
  }
  const fastest = candidates.sort((a, b) => a.evidence.totalMs - b.evidence.totalMs)[0];
  const chosen = fastest && fastest.evidence.totalMs < cpu.totalMs * 0.9 ? fastest.candidate : null;
  candidates.forEach(({ candidate }) => {
    if (candidate !== chosen) candidate.dispose();
  });
  if (chosen) report.selected = chosen.name;
  let queued = Promise.resolve();
  const backend = {
    report,
    async execute(bytes) {
      if (!this.accelerationFailed && chosen) {
        try {
          return await forwardBytesAsync(bytes, model, chosen.linear.bind(chosen));
        } catch (error) {
          this.accelerationFailed = true;
          chosen.dispose();
          report.runtimeFallback = error.message;
          report.selected = "cpu-worker";
        }
      }
      return forwardBytesAsync(bytes, model, cpuLinear);
    },
  };
  backend.forward = (bytes) => {
    const next = queued.then(() => backend.execute(bytes));
    queued = next.catch(() => {});
    return next;
  };
  return backend;
}
