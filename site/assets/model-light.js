import { GRAPH, sampleReplay, clamp } from "./model-topology.js";

// Visual coordinates of the authored teaching graph, not scientific telemetry.
export function sampleModelLight(run, frame, vertical = false) {
  const state = sampleReplay(run, frame);
  const layerTotals = Array.from({ length: GRAPH.layers.length }, () => 0);
  let total = 0, flow = 0, offset = 0, depth = 0;
  GRAPH.nodes.forEach((node, index) => {
    const signal = state.activations[index]; layerTotals[node.layer] += signal;
    total += signal; flow += signal * node.layer / 6;
    offset += signal * node.position[1]; depth += signal * node.position[2];
  });
  const energy = Math.max(...layerTotals.map((value, layer) => value / GRAPH.layers[layer].length));
  const axis = total > 0 ? flow / total : .5;
  const cross = total > 0 ? clamp(.5 + offset / total / 4.24, 0, 1) : .5;
  return Object.freeze({ frame: state.frame, energy: +energy.toFixed(4),
    x: +(vertical ? cross : axis).toFixed(4), y: +(vertical ? axis : cross).toFixed(4),
    depth: +(total > 0 ? clamp(.5 + depth / total / 4.24, 0, 1) : .5).toFixed(4) });
}

export class ModelLightPublisher {
  constructor(root) {
    this.root = root; this.lastPublished = -Infinity; this.lastKey = "";
    this.sourceId = root.getAttribute("aria-labelledby") || "portfolio-model";
  }
  publish(run, frame, { active, reducedMotion, vertical, immediate = false }) {
    const now = performance.now();
    if (!immediate && now - this.lastPublished < 1000 / 30) return;
    const sampled = sampleModelLight(run, frame, vertical);
    const detail = Object.freeze({ sourceId: this.sourceId, ...sampled,
      energy: active ? sampled.energy : 0, active, reducedMotion });
    const key = JSON.stringify(detail);
    if (key === this.lastKey) return;
    this.lastKey = key; this.lastPublished = now;
    const style = document.documentElement.style;
    style.setProperty("--model-light-energy", detail.energy);
    style.setProperty("--model-light-x", `${(detail.x * 100).toFixed(2)}%`);
    style.setProperty("--model-light-y", `${(detail.y * 100).toFixed(2)}%`);
    style.setProperty("--model-light-depth", detail.depth);
    window.PortfolioModelLight = detail;
  }
}
