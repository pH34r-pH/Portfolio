// Architecture from the already-public retained source closure; no tensors loaded.
export const TOPOLOGY = Object.freeze({
  id: "unit_hypersphere_depth3",
  provenance: "TopologyTransformer / retained_radius_topology.py",
  sourceCommit: "82a96cbc5d3da5bd5dfe76e3b1b877be996e5df6",
  publicCommit: "7bf2e42fe1882e3bed9828b43f4354523fd50bd5",
  sourceArchiveSha256: "eab904df49ef5f85ef11f12dac065dfa4cad52220d9d8257096513481d5c660f",
  sourceModuleSha256: "77d3595b941db005946d8a09964c89ca9562db23ba64f065a675fb4aaa3718fc",
  sourceUrl: "https://github.com/pH34r-pH/experiment-compiler/blob/7bf2e42fe1882e3bed9828b43f4354523fd50bd5/examples/muon-unit-hypersphere-depth3-multiseed-v1-final-87409154/experiment/source-metadata.json",
  width: 128, heads: 4, headWidth: 32, effectiveDepth: 3, sharedBlocks: 1, ffn: 512, vocabulary: 256,
  widths: Object.freeze([128,384,4,128,512,128,128,256]),
  names: Object.freeze(["Positioned unit state", "Q / K / V", "Causal phase attention", "Projection + residual / norm", "FFN / ReLU", "Return + residual / norm", "Sphere update · repeat ×3", "256 byte logits"]),
  radii: Object.freeze([1.6,2.1,.8,1.6,2.45,1.6,1.6,2.05]),
  denseConnections: 229376,
});
export const LAST_FRAME = 360;
export const FPS = 60;
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const layerX = layer => (layer - (TOPOLOGY.widths.length - 1) / 2) * 1.18;
export function hashText(text) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return hash >>> 0;
}
export function tokenize(text) { return [...new TextEncoder().encode(text)].slice(0,12).map(byte=>byte.toString(16).padStart(2,"0")); }
function coordinatePosition(layer,index,count) {
  if(layer===2)return [layerX(layer),Math.cos(index*Math.PI/2)*.65,Math.sin(index*Math.PI/2)*.65];
  if(layer===1) {
    const head=Math.floor(index%128/32),component=Math.floor(index/128),coordinate=index%32;
    const angle=coordinate*Math.PI*(3-Math.sqrt(5)),radius=.65*Math.sqrt((coordinate+.5)/32),headAngle=head*Math.PI/2+Math.PI/4;
    return [layerX(layer)+(component-1)*.16,Math.cos(headAngle)*1.2+Math.cos(angle)*radius,Math.sin(headAngle)*1.2+Math.sin(angle)*radius];
  }
  const group=Math.floor(index/8),groups=count/8,angle=group*Math.PI*(3-Math.sqrt(5));
  const radius=TOPOLOGY.radii[layer]*Math.sqrt((group+.5)/groups),local=index%8*Math.PI/4;
  return [layerX(layer),Math.cos(angle)*radius+Math.cos(local)*.12,Math.sin(angle)*radius+Math.sin(local)*.12];
}
export function createTopology() {
  const nodes=[],layers=[],edges=[];
  TOPOLOGY.widths.forEach((count,layer)=>{
    const members=[];
    for(let index=0;index<count;index++) {
      const operator=layer===2;
      members.push(nodes.length);
      nodes.push({id:operator?`H${index}`:`L${layer}-${String(index).padStart(3,"0")}`,layer,index,operator,
        position:coordinatePosition(layer,index,count),label:operator?`Head ${index} · 32-wide context folded`:layer===1?`${["Q","K","V"][Math.floor(index/128)]} · head ${Math.floor(index%128/32)} · coordinate ${index%32}`:`${TOPOLOGY.names[layer]} · coordinate ${index}`,incoming:[],outgoing:[]});
    }
    layers.push(members);
  });
  function connect(sourceMembers,targetMembers,kind,represented,layer) {
    const center=members=>[0,1,2].map(axis=>members.reduce((sum,index)=>sum+nodes[index].position[axis],0)/members.length);
    const edge={source:sourceMembers[0],target:targetMembers[0],sourceMembers,targetMembers,sourcePosition:center(sourceMembers),targetPosition:center(targetMembers),kind,represented,layer};
    for(const index of sourceMembers)nodes[index].outgoing.push(edges.length);
    for(const index of targetMembers)nodes[index].incoming.push(edges.length);
    edges.push(edge);
  }
  function dense(a,b) {
    for(let s=0;s<layers[a].length;s+=8)for(let t=0;t<layers[b].length;t+=8)
      connect(layers[a].slice(s,s+8),layers[b].slice(t,t+8),"dense 8×8 bundle",64,a);
  }
  dense(0,1); dense(3,4); dense(4,5); dense(6,7);
  // Q/K/V split into four 32-wide heads. Their causal time matrix is folded,
  // not represented as fictitious dense neuron connections.
  for(let head=0;head<4;head++) {
    for(let qkv=0;qkv<3;qkv++)for(let channel=0;channel<32;channel+=8)
      connect(layers[1].slice(qkv*128+head*32+channel,qkv*128+head*32+channel+8),[layers[2][head]],"Q/K/V head input",8,1);
    for(let target=0;target<128;target+=8)
      connect([layers[2][head]],layers[3].slice(target,target+8),"attention context + output projection bundle",256,2);
  }
  for(let index=0;index<128;index++)connect([layers[5][index]],[layers[6][index]],"coordinate route through sphere operator",1,5);
  for(const [a,b] of [[0,3],[3,5]])for(let index=0;index<128;index+=8)
    connect(layers[a].slice(index,index+8),layers[b].slice(index,index+8),"residual identity bundle",8,a);
  connect(layers[6],layers[0],"shared block recurrence · three applications",128,6);
  return {nodes,layers,edges};
}
export const GRAPH = createTopology();
export function createReplay(text) {
  const cleaned=text.trim()||"the model learned a useful distinction";
  return Object.freeze({text:cleaned,tokens:Object.freeze(tokenize(cleaned)),seed:hashText(cleaned)});
}
export function createInferenceRun(text) {
  return {kind:'inference', text, tokens:Array.from(new TextEncoder().encode(text), byte=>byte.toString(16).padStart(2,'0')), observations:[], generating:false};
}
function sampleInference(run, requestedFrame) {
  const frame=clamp(Math.round(requestedFrame),0,Math.max(0,run.observations.length-1));
  const observation=run.observations[frame];
  const rawActivations=Array(GRAPH.nodes.length).fill(0),activations=Array(GRAPH.nodes.length).fill(0),capturedLayers=[];
  if(observation) {
    for(let index=frame;index>=0;index--) {
      const item=run.observations[index];
      if(item.token!==observation.token||item.pass!==observation.pass)break;
      capturedLayers.push(item.layer);
      const maximum=Math.max(1e-12,...item.values.map(Math.abs));
      for(let coordinate=0;coordinate<item.values.length;coordinate++) {
        const node=GRAPH.layers[item.layer][coordinate];
        rawActivations[node]=item.values[coordinate];activations[node]=Math.abs(item.values[coordinate])/maximum;
      }
    }
  }
  return {frame,stage:observation?`byte ${observation.token+1} · pass ${observation.pass}/3 · ${TOPOLOGY.names[observation.layer]}`:'Ready to generate',
    activations,rawActivations,capturedLayers,emitted:observation?.emitted||[],observation,measured:true};
}
export function sampleReplay(run,requestedFrame) {
  if(run.kind==='inference')return sampleInference(run,requestedFrame);
  const frame=clamp(Math.round(requestedFrame),0,LAST_FRAME);
  const stage=frame===LAST_FRAME?"complete":frame<54?"UTF-8 byte illustration":frame<252?"shared block illustration":"scripted byte echo";
  const activations=GRAPH.nodes.map(node=>{
    const envelope=Math.max(0,1-Math.abs(frame-(64+node.layer*25))/31);
    return envelope*(.24+(hashText(`${run.seed}:${node.id}`)%730)/1000);
  });
  const emittedCount=frame<252?0:Math.min(run.tokens.length,Math.floor((frame-252)/8));
  return {frame,stage,activations,emitted:run.tokens.slice(0,emittedCount)};
}
export function joinTokens(tokens) { return new TextDecoder().decode(new Uint8Array(tokens.map(token=>parseInt(token,16)))); }
