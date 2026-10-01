// Explicit, synthetic autoencoder teaching graph. No trained weights or observations.
export const TOPOLOGY = Object.freeze({
  id: "teaching-autoencoder-v1",
  provenance: "Authored teaching topology / site/assets/model-topology.js",
  widths: Object.freeze([48, 32, 16, 8, 16, 32, 48]),
  names: Object.freeze(["Input", "Encoder 1", "Encoder 2", "Bottleneck", "Decoder 1", "Decoder 2", "Reconstruction"]),
  radii: Object.freeze([2.12, 1.64, 1.08, .49, 1.08, 1.64, 2.12]),
});
export const LAST_FRAME = 360;
export const FPS = 60;
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function hashText(text) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return hash >>> 0;
}
export function tokenize(text) {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?|[^\s\p{L}\p{N}]/gu)?.slice(0, 12) || [];
}
export function createTopology() {
  const nodes = [], layers = [], edges = [];
  TOPOLOGY.widths.forEach((count, layer) => {
    const members = [];
    for (let index = 0; index < count; index++) {
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const radius = TOPOLOGY.radii[layer] * Math.sqrt((index + .5) / count);
      const node = { id: `L${layer}-${String(index).padStart(2, "0")}`, layer, index,
        position: [(layer - 3) * 1.48, Math.cos(angle) * radius, Math.sin(angle) * radius],
        incoming: [], outgoing: [] };
      members.push(nodes.length); nodes.push(node);
    }
    layers.push(members);
  });
  for (let layer = 0; layer < layers.length - 1; layer++) {
    for (const source of layers[layer]) for (const target of layers[layer + 1]) {
      const edge = { source, target, layer };
      nodes[source].outgoing.push(edges.length); nodes[target].incoming.push(edges.length);
      edges.push(edge);
    }
  }
  return { nodes, layers, edges };
}
export const GRAPH = createTopology();
export function createReplay(text) {
  const cleaned = text.trim() || "the model learned a useful distinction";
  return Object.freeze({ text: cleaned, tokens: Object.freeze(tokenize(cleaned)), seed: hashText(cleaned) });
}
export function sampleReplay(run, requestedFrame) {
  const frame = clamp(Math.round(requestedFrame), 0, LAST_FRAME);
  const stage = frame === LAST_FRAME ? "complete" : frame < 54 ? "tokenizing" : frame < 252 ? "encoding / decoding" : "reconstructing";
  // Fixed timing and hashed amplitudes are illustrative, never model evidence.
  const activations = GRAPH.nodes.map(node => {
    const center = 64 + node.layer * 29;
    const envelope = Math.max(0, 1 - Math.abs(frame - center) / 31);
    const amplitude = .24 + (hashText(`${run.seed}:${node.id}`) % 730) / 1000;
    return envelope * amplitude;
  });
  const emittedCount = frame < 252 ? 0 : Math.min(run.tokens.length, Math.floor((frame - 252) / 8));
  return { frame, stage, activations, emitted: run.tokens.slice(0, emittedCount) };
}
export function joinTokens(tokens) { return tokens.join(" ").replace(/\s+([.,!?;:])/g, "$1"); }
