import { sampleReplay } from "./model-topology.js";

// Interpolate presentation only. Inspectors keep the actual discrete observation.
export function samplePresentation(run, position, { loop = false, smooth = false } = {}) {
  const frame = Math.floor(position),
    a = sampleReplay(run, frame);
  if (!a.measured) return a;
  const next = loop ? (frame + 1) % run.observations.length : Math.min(frame + 1, run.observations.length - 1);
  const b = sampleReplay(run, next), fraction = position - frame;
  const amount = smooth ? fraction * fraction * (3 - 2 * fraction) : fraction;
  const activations = a.activations.map((value, index) => value + (b.activations[index] - value) * amount);
  if (!smooth) return { ...a, activations };
  // This hue mixture belongs to presentation; raw captured coordinates stay exact.
  const presentationNegative = activations.map((value, index) => {
    const from = a.rawActivations[index] < 0 ? a.activations[index] : 0;
    const to = b.rawActivations[index] < 0 ? b.activations[index] : 0;
    return value > 0 ? (from + (to - from) * amount) / value : 0;
  });
  return { ...a, activations, presentationNegative };
}
