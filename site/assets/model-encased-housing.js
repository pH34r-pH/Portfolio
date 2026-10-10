import {TOPOLOGY,layerX} from './model-topology.js';

export const HOUSING_BOUNDS=Object.freeze({x:6.55,top:3.7,bottom:-4.05,z:3.15});

function roundedPlate(T,width,depth,height) {
  const shape=new T.Shape(),x=width/2,y=depth/2,r=.16;
  shape.moveTo(-x+r,-y);shape.lineTo(x-r,-y);shape.quadraticCurveTo(x,-y,x,-y+r);
  shape.lineTo(x,y-r);shape.quadraticCurveTo(x,y,x-r,y);shape.lineTo(-x+r,y);
  shape.quadraticCurveTo(-x,y,-x,y-r);shape.lineTo(-x,-y+r);shape.quadraticCurveTo(-x,-y,-x+r,-y);
  return new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:true,bevelSize:.025,
    bevelThickness:.025,bevelSegments:3,steps:1,curveSegments:12}).rotateX(-Math.PI/2);
}

function addMesh(T,group,geometry,material,position) {
  const mesh=new T.Mesh(geometry,material);mesh.position.set(...position);group.add(mesh);return mesh;
}

function beams(T,group,material,segments,radius) {
  const mesh=new T.InstancedMesh(new T.CylinderGeometry(radius,radius,1,32),material,segments.length);
  const dummy=new T.Object3D(),up=new T.Vector3(0,1,0);
  segments.forEach(([a,b],index)=>{
    const start=new T.Vector3(...a),end=new T.Vector3(...b),direction=end.clone().sub(start);
    dummy.position.copy(start).add(end).multiplyScalar(.5);dummy.scale.set(1,direction.length(),1);
    dummy.quaternion.setFromUnitVectors(up,direction.normalize());dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
  });
  mesh.computeBoundingSphere();group.add(mesh);return mesh;
}

function fittings(T,group,material,points) {
  const geometry=roundedPlate(T,.29,.29,.24),mesh=new T.InstancedMesh(geometry,material,points.length),dummy=new T.Object3D();
  points.forEach((point,index)=>{dummy.position.set(...point);dummy.position.y-=.12;dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);});
  mesh.computeBoundingSphere();group.add(mesh);
}

function frame(T,group,materials) {
  const x=6.28,y=3.5,z=2.88,segments=[],corners=[];
  for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]) {
    const point=[sx*x,sy*y,sz*z];corners.push(point);
    if(sx===-1)segments.push([point,[x,sy*y,sz*z]]);
    if(sy===-1)segments.push([point,[sx*x,y,sz*z]]);
    if(sz===-1)segments.push([point,[sx*x,sy*y,z]]);
  }
  beams(T,group,materials.shell,segments,.075);fittings(T,group,materials.brass,corners);
  const screws=new T.InstancedMesh(new T.CylinderGeometry(.036,.036,.03,6),materials.ceramic,32),dummy=new T.Object3D();
  corners.forEach(([px,py,pz],corner)=>{
    for(let index=0;index<4;index++) {
      dummy.position.set(px+(index%2?1:-1)*.075,py+.14,pz+(index<2?1:-1)*.075);
      dummy.updateMatrix();screws.setMatrixAt(corner*4+index,dummy.matrix);
    }
  });
  screws.computeBoundingSphere();group.add(screws);
}

function glazing(T,group,material) {
  const panes=[];
  for(const side of [-1,1]) {
    const front=addMesh(T,group,new T.PlaneGeometry(12.42,6.86),material,[0,0,side*2.88]);
    front.renderOrder=side<0?1:3;panes.push(front);
    const end=addMesh(T,group,new T.PlaneGeometry(5.64,6.86),material,[side*6.28,0,0]);
    end.rotation.y=Math.PI/2;end.renderOrder=2;panes.push(end);
  }
  const lid=addMesh(T,group,new T.PlaneGeometry(12.42,5.64),material,[0,3.5,0]);
  lid.rotation.x=Math.PI/2;lid.renderOrder=2;panes.push(lid);
  return panes;
}

function base(T,group,materials) {
  addMesh(T,group,roundedPlate(T,12.9,6.12,.23),materials.bed,[0,-3.8,0]);
  addMesh(T,group,roundedPlate(T,12.82,6.04,.035),materials.brass,[0,-3.53,0]);
  addMesh(T,group,roundedPlate(T,12.55,5.83,.025),materials.shell,[0,-3.48,0]);
  const feet=new T.InstancedMesh(new T.CylinderGeometry(.19,.24,.2,32),materials.brass,4),dummy=new T.Object3D();
  let index=0;
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    dummy.position.set(sx*5.95,-3.93,sz*2.6);dummy.updateMatrix();feet.setMatrixAt(index++,dummy.matrix);
  }
  feet.computeBoundingSphere();group.add(feet);
}

function opticalStages(T,group,materials) {
  const uprights=[],crossbars=[],bolts=[];
  TOPOLOGY.radii.forEach((radius,layer)=>{
    const x=layerX(layer),back=-radius-.19;
    uprights.push([[x,-3.4,back],[x,radius+.19,back]]);
    crossbars.push([[x,-radius-.19,-radius-.19],[x,-radius-.19,radius+.19]]);
    bolts.push([x,-3.35,back]);
  });
  beams(T,group,materials.brass,uprights,.019);beams(T,group,materials.shell,crossbars,.015);
  fittings(T,group,materials.brass,bolts);
}

function apertures(T,group,materials) {
  for(const side of [-1,1]) {
    const x=side*5.65;
    const rim=addMesh(T,group,new T.TorusGeometry(.5,.065,16,96),materials.brass,[x,0,0]);rim.rotation.y=Math.PI/2;
    const bezel=addMesh(T,group,new T.CylinderGeometry(.46,.46,.16,64),materials.bed,[x,0,0]);bezel.rotation.z=Math.PI/2;
    const lens=addMesh(T,group,new T.CylinderGeometry(.37,.37,.18,64),materials.glazing,[x,0,0]);lens.rotation.z=Math.PI/2;
    beams(T,group,materials.shell,[[[x,-3.39,0],[x,-.5,0]]],.052);
  }
}

export function encasedHousing(T,materials) {
  const group=new T.Group();group.name='Encased research instrument · physical display housing';
  frame(T,group,materials);base(T,group,materials);opticalStages(T,group,materials);apertures(T,group,materials);
  const panes=glazing(T,group,materials.glazing),bounds=[];
  for(const x of [-HOUSING_BOUNDS.x,HOUSING_BOUNDS.x])for(const y of [HOUSING_BOUNDS.bottom,HOUSING_BOUNDS.top])
    for(const z of [-HOUSING_BOUNDS.z,HOUSING_BOUNDS.z])bounds.push([x,y,z]);
  return {group,panes,bounds};
}
