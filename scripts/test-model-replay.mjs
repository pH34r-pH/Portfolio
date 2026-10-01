import assert from 'node:assert/strict';
import { GRAPH, TOPOLOGY, LAST_FRAME, createReplay, sampleReplay } from '../site/assets/model-topology.js';
assert.equal(GRAPH.nodes.length, 200);
assert.equal(GRAPH.edges.length, 4352);
assert.deepEqual(GRAPH.layers.map(layer => layer.length), TOPOLOGY.widths);
const unique = new Set(GRAPH.edges.map(edge => `${edge.source}:${edge.target}`));
assert.equal(unique.size, GRAPH.edges.length);
for (const edge of GRAPH.edges) assert.equal(GRAPH.nodes[edge.target].layer, GRAPH.nodes[edge.source].layer + 1);
for (const node of GRAPH.nodes) {
  assert.equal(node.incoming.length, TOPOLOGY.widths[node.layer - 1] || 0);
  assert.equal(node.outgoing.length, TOPOLOGY.widths[node.layer + 1] || 0);
}
const run = createReplay('Replay this exact frame.');
const forward = Array.from({length: LAST_FRAME + 1}, (_, frame) => sampleReplay(run, frame));
for (let frame = LAST_FRAME; frame >= 0; frame--) {
  assert.deepEqual(sampleReplay(run, frame), forward[frame], `Replay changed at frame ${frame}`);
  assert.ok(forward[frame].activations.every(value => value >= 0 && value <= 1));
}
assert.deepEqual(sampleReplay(run, LAST_FRAME).emitted, run.tokens);
assert.equal(sampleReplay(run, -100).frame, 0);
assert.equal(sampleReplay(run, 10000).frame, LAST_FRAME);
assert.equal(createReplay('one '.repeat(30)).tokens.length, 12);
console.log('Replay topology and all 361 rewind states passed.');
