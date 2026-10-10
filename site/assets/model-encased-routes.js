import {GRAPH} from './model-topology.js';

function opticalCurve(T,edge) {
  const a=new T.Vector3(...edge.sourcePosition),b=new T.Vector3(...edge.targetPosition);
  if(edge.kind.startsWith('shared block')||edge.kind.startsWith('residual')) {
    const y=edge.kind.startsWith('shared block')?3.08:-2.86;
    return new T.CatmullRomCurve3([a,new T.Vector3(a.x,y,-.28),new T.Vector3(b.x,y,-.28),b],false,'centripetal');
  }
  const reach=(b.x-a.x)*.44;
  return new T.CubicBezierCurve3(a,new T.Vector3(a.x+reach,a.y,a.z),new T.Vector3(b.x-reach,b.y,b.z),b);
}

function mergedGuides(T,curves) {
  const positions=[],normals=[],indices=[],ranges=[];
  curves.forEach(({curve,edgeIndex})=>{
    const geometry=new T.TubeGeometry(curve,32,.0065,6,false),offset=positions.length/3;
    positions.push(...geometry.attributes.position.array);normals.push(...geometry.attributes.normal.array);
    for(const index of geometry.index.array)indices.push(index+offset);
    ranges.push({edgeIndex,offset,count:geometry.attributes.position.count});geometry.dispose();
  });
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setIndex(indices);geometry.computeBoundingSphere();
  return {geometry,ranges};
}

export class EncasedRoutes {
  constructor(T,group,material) {
    this.T=T;this.points=new Map();this.offsets=[];this.groups=[];this.groupKeys=new Map();this.links=[];
    const positions=[],guides=[];
    GRAPH.edges.forEach((edge,index)=>{
      const curve=opticalCurve(T,edge),points=curve.getPoints(24).map(point=>point.toArray());
      this.points.set(edge,points);this.offsets.push(positions.length);
      for(let point=1;point<points.length;point++)positions.push(...points[point-1],...points[point]);
      this.links.push([this.endpoint(edge.sourceMembers),this.endpoint(edge.targetMembers)]);
      if(index%36===0||edge.kind.startsWith('shared block'))guides.push({curve,edgeIndex:index});
    });
    this.offsets.push(positions.length);this.values=new Float32Array(this.groups.length);
    this.colors=new Float32Array(positions.length);this.geometry=new T.BufferGeometry();
    this.geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    this.geometry.setAttribute('color',new T.BufferAttribute(this.colors,3).setUsage(T.DynamicDrawUsage));
    this.geometry.computeBoundingSphere();this.lines=new T.LineSegments(this.geometry,material);group.add(this.lines);
    const featured=mergedGuides(T,guides);this.guideRanges=featured.ranges;
    this.guideColors=new Float32Array(featured.geometry.attributes.position.count*3);
    featured.geometry.setAttribute('color',new T.BufferAttribute(this.guideColors,3).setUsage(T.DynamicDrawUsage));
    const guideMaterial=new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.75,
      blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});
    this.guides=new T.Mesh(featured.geometry,guideMaterial);this.guides.renderOrder=5;group.add(this.guides);
    this.halo=this.createHalo(featured.geometry);group.add(this.halo);
    this.rest=new T.Color(0x3488c3);this.gold=new T.Color(0xffc778);this.color=new T.Color();
  }
  endpoint(members) {
    const key=members.join(',');
    if(!this.groupKeys.has(key)){this.groupKeys.set(key,this.groups.length);this.groups.push(members);}
    return this.groupKeys.get(key);
  }
  createHalo(core) {
    const geometry=core.clone(),position=geometry.attributes.position,normal=geometry.attributes.normal;
    for(let index=0;index<position.count;index++)position.setXYZ(index,
      position.getX(index)+normal.getX(index)*.01,position.getY(index)+normal.getY(index)*.01,position.getZ(index)+normal.getZ(index)*.01);
    geometry.setAttribute('color',core.attributes.color);geometry.computeBoundingSphere();
    const material=new this.T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.12,
      blending:this.T.AdditiveBlending,depthWrite:false,toneMapped:false});
    const halo=new this.T.Mesh(geometry,material);halo.renderOrder=4;return halo;
  }
  update(state) {
    this.groups.forEach((members,index)=>{
      this.values[index]=members.reduce((sum,node)=>sum+state.activations[node],0)/members.length;
    });
    this.links.forEach(([source,target],index)=>{
      const value=Math.min(this.values[source],this.values[target]);
      this.color.copy(this.rest).lerp(this.gold,value).multiplyScalar(.13+value*.87);
      for(let offset=this.offsets[index];offset<this.offsets[index+1];offset+=3)this.color.toArray(this.colors,offset);
    });
    for(const {edgeIndex,offset,count} of this.guideRanges) {
      const [source,target]=this.links[edgeIndex],value=Math.min(this.values[source],this.values[target]);
      this.color.copy(this.rest).lerp(this.gold,value);
      for(let vertex=offset;vertex<offset+count;vertex++)this.color.toArray(this.guideColors,vertex*3);
    }
    this.geometry.attributes.color.needsUpdate=true;this.guides.geometry.attributes.color.needsUpdate=true;
  }
  setPower(progress) {this.guides.visible=this.halo.visible=progress>0;this.guides.material.opacity=.25+progress*.5;this.halo.material.opacity=progress*.12;}
  diagnostics() {return {curvedRoutes:GRAPH.edges.length,featuredOpticalGuides:this.guideRanges.length,segmentsPerRoute:24,
    activation:'mean absolute normalized endpoint coordinates; lower endpoint sets route strength'};}
}
