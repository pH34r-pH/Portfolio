import { sampleReplay } from "./model-topology.js";

// Interpolate presentation only. Inspectors keep the actual discrete observation.
export function samplePresentation(run, position) {
  const frame = Math.floor(position),
    a = sampleReplay(run, frame);
  if (!a.measured) return a;
  const b = sampleReplay(run, Math.min(frame + 1, run.observations.length - 1)),
    amount = position - frame;
  return { ...a, activations: a.activations.map((value, index) => value + (b.activations[index] - value) * amount) };
}
