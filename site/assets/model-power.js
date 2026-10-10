import {GRAPH,clamp,layerX} from './model-topology.js';
import {ENCASED_PALETTE} from './model-encased-materials.js';

// Theatrical display power, independent of replay or trained activation data.
export function ignitionLevel(layer,progress) {
  const value=clamp((progress*10-layer)/2,0,1);
  return value*value*(3-2*value);
}
export function applyPower(scene,progress) {
  const p=clamp(progress,0,1),base=new scene.T.Color(scene.dark?0x447abb:0x165577);
  scene.scene.background=scene.powerBackground;
  scene.materials.node.blending=scene.T.NormalBlending;scene.contours.material.blending=scene.T.NormalBlending;
  const on=new scene.T.Color(scene.dark?ENCASED_PALETTE.dark:ENCASED_PALETTE.light),activity=new scene.T.Color(ENCASED_PALETTE.active);
  GRAPH.nodes.forEach((node,index)=>{
    const level=ignitionLevel(node.layer,p),spark=Math.sin(Math.PI*level)*.6;
    scene.color.copy(base).lerp(on,level).lerp(activity,spark*.35);
    scene.beads.setColorAt(index,scene.color);
  });
  GRAPH.edges.forEach((edge,index)=>{
    const strength=.025+ignitionLevel(edge.layer,p)*.125;
    for(let offset=scene.edgeOffsets[index];offset<scene.edgeOffsets[index+1];offset+=3) {
      scene.edgeColors[offset]=strength*(edge.layer%2?.65:.12);
      scene.edgeColors[offset+1]=strength*.55;scene.edgeColors[offset+2]=strength;
    }
  });
  scene.beads.instanceColor.needsUpdate=true;scene.edgeGeometry.attributes.color.needsUpdate=true;
  scene.materials.node.opacity=1;scene.materials.node.emissiveIntensity=.03+p*.09;scene.materials.edge.opacity=.1+p*.13;scene.routes.setPower(p);
  scene.contours.material.opacity=.055+p*.185;
  scene.pulses.count=scene.tokens.count=0;scene.selection.visible=scene.probe.visible=false;
  scene.replayLight.position.set(layerX(Math.min(7,Math.floor(p*8))),1.6,3);
  scene.replayLight.intensity=Math.sin(Math.PI*p)*6;scene.glass.pulse(Math.sin(Math.PI*p)*.4);
  scene.glass.power=p;
}
