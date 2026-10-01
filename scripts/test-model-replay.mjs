import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sampleModelLight } from '../site/assets/model-light.js';
import { ModelGestures } from '../site/assets/model-gestures.js';
import { GRAPH, TOPOLOGY, LAST_FRAME, createReplay, sampleReplay } from '../site/assets/model-topology.js';
assert.equal(GRAPH.nodes.length, 1668);
assert.equal(GRAPH.edges.length, 3601);
assert.equal(TOPOLOGY.sharedBlocks,1); assert.equal(TOPOLOGY.effectiveDepth,3);
assert.equal(TOPOLOGY.width,128);assert.equal(TOPOLOGY.heads,4);assert.equal(TOPOLOGY.ffn,512);assert.equal(TOPOLOGY.vocabulary,256);
assert.equal(GRAPH.nodes.filter(node=>node.operator).length,4);
const dense=GRAPH.edges.filter(edge=>edge.kind.includes('dense')||edge.kind.includes('output projection'));
assert.equal(dense.reduce((sum,edge)=>sum+edge.represented,0),229376);
assert.deepEqual(GRAPH.layers.map(layer => layer.length), TOPOLOGY.widths);
const unique = new Set(GRAPH.edges.map(edge => `${edge.source}:${edge.target}:${edge.kind}`));
assert.equal(unique.size, GRAPH.edges.length);
for (const [index,edge] of GRAPH.edges.entries()) {
  assert.ok(edge.sourceMembers.length && edge.targetMembers.length);
  for(const member of edge.sourceMembers)assert.ok(GRAPH.nodes[member].outgoing.includes(index));
  for(const member of edge.targetMembers)assert.ok(GRAPH.nodes[member].incoming.includes(index));
}
for(let head=0;head<4;head++)assert.equal(GRAPH.nodes[GRAPH.layers[2][head]].incoming.length,12);
assert.equal(GRAPH.edges.filter(edge=>edge.kind.startsWith('shared block')).length,1);
const architecture=JSON.parse(readFileSync(new URL('../site/assets/model-architecture.json',import.meta.url)));
assert.equal(architecture.dslSourceCommit,TOPOLOGY.sourceCommit);
assert.equal(architecture.sourceArchiveSha256,TOPOLOGY.sourceArchiveSha256);
assert.equal(architecture.sourceMembers['retained_radius_topology.py'],TOPOLOGY.sourceModuleSha256);
assert.equal(architecture.display.coordinateNodes+architecture.display.operatorNodes,GRAPH.nodes.length);
assert.equal(architecture.display.displayRoutes,GRAPH.edges.length);
const canonicalConfig=JSON.stringify(architecture.architecture,Object.keys(architecture.architecture).sort());
assert.equal(createHash('sha256').update(canonicalConfig).digest('hex'),architecture.architectureIdentitySha256);
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

const changes=[];const gestures=new ModelGestures(Object.fromEntries(['orbit','zoom','pan','scrub'].map(name=>[name,(...args)=>changes.push({name,args})])));
gestures.down(1,10,20);gestures.move(1,20,30);assert.equal(changes.at(-1).name,'orbit');
gestures.down(2,40,30);const count=changes.length;gestures.move(2,40,30);assert.equal(changes.length,count+2);assert.deepEqual(changes.at(-1).args,[0,0]);assert.equal(changes.at(-2).args[0],1);
gestures.move(2,60,30);assert.ok(changes.at(-2).args[0]>1);
gestures.down(3,70,30);gestures.move(3,100,30);assert.equal(changes.at(-1).name,'scrub');assert.equal(changes.at(-1).args[0],10);
assert.equal(gestures.up(3),false);const after=changes.length;gestures.move(1,20,30);assert.deepEqual(changes.slice(after).map(change=>change.args),[[1],[0,0]]);
gestures.up(2,true);gestures.up(1,true);gestures.down(4,5,5);assert.equal(gestures.up(4),true);
gestures.down(5,5,5);gestures.clear();gestures.move(5,30,30);assert.equal(gestures.points.size,0);
console.log('Pointer transitions, orbit, pinch/pan, replay scrub and cancellation passed.');

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
