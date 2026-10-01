import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sampleModelLight } from '../site/assets/model-light.js';
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

for (const vertical of [false,true]) {
 const lights=forward.map(state=>sampleModelLight(run,state.frame,vertical));
 for(let frame=LAST_FRAME;frame>=0;frame--) {
  assert.deepEqual(sampleModelLight(run,frame,vertical),lights[frame]);
  for(const key of ['energy','x','y','depth']) assert.ok(lights[frame][key]>=0 && lights[frame][key]<=1);
 }
}
console.log('Scene lighting passed all 361 frames in horizontal and vertical compositions.');

const engineHashes={
 'three.module.js':'9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea',
 'three.core.js':'9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6',
 LICENSE:'8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc',
};
for(const [name,hash] of Object.entries(engineHashes)) {
 const bytes=readFileSync(new URL(`../site/assets/vendor/three@0.186.1/${name}`,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,`Upstream engine bytes changed: ${name}`);
 assert.deepEqual(bytes,readFileSync(new URL(`../node_modules/three/${name==='LICENSE'?name:'build/'+name}`,import.meta.url)));
}
const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url)));
assert.equal(lock.packages['node_modules/three'].version,'0.186.1');
console.log('Vendored engine matches the locked upstream package and license.');
