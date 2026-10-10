export const ENCASED_PALETTE = Object.freeze({light:0x165577,dark:0x447abb,active:0xffc778,negative:0xffa7b0});

export function crystalPose(dummy,node,value=0,selected=false) {
  dummy.position.set(...node.position);
  dummy.rotation.set(node.index%3*.24,node.index%7*.16,node.index%5*.2);
  dummy.scale.setScalar((node.operator?2.3:1)*(1+value*.25+(selected?.18:0)));dummy.updateMatrix();
}

export function encasedMaterials(T) {
  return {
    shell:new T.MeshStandardMaterial({color:0x6a8292,metalness:.96,roughness:.24}),
    ceramic:new T.MeshStandardMaterial({color:0x7992a5,metalness:.85,roughness:.27}),
    brass:new T.MeshStandardMaterial({color:0xb39360,metalness:.92,roughness:.23}),
    bed:new T.MeshStandardMaterial({color:0x071725,metalness:.72,roughness:.3}),
    glazing:new T.MeshPhysicalMaterial({color:0xe9f7ff,roughness:.065,metalness:0,transmission:1,
      thickness:.035,ior:1.46,side:T.DoubleSide,depthWrite:false,transparent:true,opacity:.14,envMapIntensity:.7}),
    node:new T.MeshPhysicalMaterial({color:0xffffff,metalness:0,roughness:.12,transmission:.18,
      thickness:.065,ior:1.76,clearcoat:1,clearcoatRoughness:.07,envMapIntensity:1.4,
      emissive:0x285b86,emissiveIntensity:.12}),
    edge:new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.34,depthWrite:false}),
    probe:new T.LineBasicMaterial({color:ENCASED_PALETTE.active,transparent:true,opacity:.8,depthWrite:false}),
    signal:new T.MeshStandardMaterial({color:ENCASED_PALETTE.active,emissive:0xe8a643,emissiveIntensity:1.2,roughness:.3}),
  };
}

// Studio illumination is rendered light, not recorded model telemetry.
export function encasedEnvironment(T,renderer) {
  const width=512,height=256,data=new Float32Array(width*height*4);
  const panels=[[.18,.24,.026,.19,5.8,7.2,9],[.69,.32,.055,.14,2.2,3.8,5.8],[.87,.58,.018,.1,5.2,3.5,1.7]];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const u=x/width,v=y/height,offset=(y*width+x)*4;
    data[offset]=.025;data[offset+1]=.06;data[offset+2]=.11;
    for(const [px,py,rx,ry,r,g,b] of panels) {
      const dx=Math.min(Math.abs(u-px),1-Math.abs(u-px))/rx,dy=Math.abs(v-py)/ry;
      const intensity=Math.exp(-Math.pow(dx,6)-Math.pow(dy,6));
      data[offset]+=r*intensity;data[offset+1]+=g*intensity;data[offset+2]+=b*intensity;
    }
    data[offset+3]=1;
  }
  const texture=new T.DataTexture(data,width,height,T.RGBAFormat,T.FloatType);
  texture.mapping=T.EquirectangularReflectionMapping;texture.colorSpace=T.LinearSRGBColorSpace;texture.needsUpdate=true;
  const generator=new T.PMREMGenerator(renderer);
  try {return generator.fromEquirectangular(texture);}
  finally {generator.dispose();texture.dispose();}
}
