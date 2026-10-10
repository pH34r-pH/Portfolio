export const vertex = `#version 300 es
in vec2 position;
out vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;

// Implicit solid geometry, measured in CSS pixels. The atlas supplies albedo
// and correlated fiber relief; routed profiles and tool cuts change the solid.
export const fragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 pixel;
uniform sampler2D wood;
uniform vec4 shape; // full width, height, rail width, frame/control
uniform vec4 windowRect; // visible crop x/y/width/height
uniform vec4 state; // press travel, hover, selected, dark environment
uniform vec3 lighting;
uniform float seed;
uniform float density;
const float PI=3.14159265359;

float hash(float p){return fract(sin(p*127.1+seed*311.7)*43758.5453);}
float rounded2(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.)+length(max(q,0.))-r;}
float rounded3(vec3 p,vec3 b,float r){vec3 q=abs(p)-b+r;return min(max(q.x,max(q.y,q.z)),0.)+length(max(q,0.))-r;}

vec3 board(vec2 p){
  vec2 halfSize=shape.xy*.5;
  if(shape.w<.5)return vec3(p.x/shape.x+.5,p.y/shape.y+.5,0.);
  vec2 edge=halfSize-abs(p);
  bool horizontal=edge.y<edge.x;
  float number=horizontal?(p.y<0.?1.:3.):(p.x<0.?4.:2.);
  float along=horizontal?p.x/shape.x+.5:p.y/shape.y+.5;
  float cross=horizontal?edge.y/shape.z:edge.x/shape.z;
  return vec3(along,clamp(cross,0.,1.),number);
}

vec3 fibers(vec2 p){
  vec3 b=board(p);
  float width=shape.w<.5?clamp(shape.x*1.7/1254.,.12,.72):.76;
  float height=shape.w<.5?clamp(shape.y*1.7/418.,.1,.32):.10;
  vec2 start=vec2(hash(b.z+11.)*(.96-width),hash(b.z+29.)*(.92-height));
  vec2 sampleUV=start+clamp(b.xy,0.,1.)*vec2(width,height);
  float species=shape.w<.5?2.:0.;
  sampleUV.y=(species+sampleUV.y)/3.;
  return textureLod(wood,sampleUV,0.).rgb;
}

float toolCut(vec2 p){
  vec3 b=board(p);
  vec2 size=shape.w<.5?shape.xy:vec2(max(shape.x,shape.y),shape.z);
  float result=0.;
  for(int i=0;i<3;i++){
    float k=float(i)+b.z*7.;
    if(hash(k+59.)<.28)continue;
    vec2 center=vec2(.1+hash(k+61.)*.8,.15+hash(k+72.)*.7);
    vec2 q=(b.xy-center)*size;
    float trace=q.y-(hash(k+98.)-.5)*q.x*.12-sin(q.x*.17+k)*.09;
    float length=4.+hash(k+84.)*12.;
    result+=exp(-pow(trace/(.10+hash(k+67.)*.07),2.))*exp(-pow(q.x/length,6.))*(.07+hash(k+93.)*.09);
  }
  return result;
}

float front(vec2 p){
  float relief=(dot(fibers(p),vec3(.5,.35,.15))-.65)*.46-toolCut(p);
  if(shape.w<.5){
    float edge=-rounded2(p,shape.xy*.5-5.5,4.);
    float dish=.72*smoothstep(1.,7.,edge);
    return -3.2-state.x*2.4-dish+relief;
  }
  float inner=rounded2(p,shape.xy*.5-shape.z-1.,3.);
  float groove=.48*exp(-pow((inner-1.8)/.65,2.));
  float outer=-rounded2(p,shape.xy*.5-1.,12.);
  float edgeBevel=max(0.,1.7-min(inner,outer))*.65;
  return 2.4-groove-edgeBevel+relief;
}

vec2 solids(vec3 p){
  if(shape.w<.5){
    float travel=state.x*2.4;
    float stock=rounded3(p-vec3(0.,0.,-7.0-travel),vec3(shape.xy*.5-5.5,3.8),3.0);
    float cap=max(stock,p.z-front(p.xy));
    float outside=rounded3(p,vec3(shape.xy*.5+3.3,2.2),4.3);
    float cavity=rounded3(p,vec3(shape.xy*.5-.3,20.),5.2);
    float socket=max(outside,-cavity);
    float bed=rounded3(p-vec3(0.,0.,-13.8),vec3(shape.xy*.5+1.2,.8),4.);
    if(cap<socket&&cap<bed)return vec2(cap,1.);
    return socket<bed?vec2(socket,2.):vec2(bed,3.);
  }
  float outer=rounded2(p.xy,shape.xy*.5-1.,12.);
  float inner=rounded2(p.xy,shape.xy*.5-shape.z-1.,3.);
  float rail=max(max(outer,-inner),max(p.z-front(p.xy),-6.3-p.z));
  vec2 corner=shape.xy*.5-abs(p.xy);
  if(max(corner.x,corner.y)<shape.z*1.5)rail=max(rail,.20-abs(corner.x-corner.y));
  return vec2(rail,1.);
}

vec3 normalAt(vec3 p){
  const float e=.06;
  return normalize(vec3(solids(p+vec3(e,0.,0.)).x-solids(p-vec3(e,0.,0.)).x,
    solids(p+vec3(0.,e,0.)).x-solids(p-vec3(0.,e,0.)).x,
    solids(p+vec3(0.,0.,e)).x-solids(p-vec3(0.,0.,e)).x));
}

float shadow(vec3 p,vec3 light){
  float value=1.,t=.25;
  for(int i=0;i<14;i++){
    float d=solids(p+light*t).x;
    value=min(value,9.*d/t);
    t+=clamp(d,.25,3.);
    if(t>24.)break;
  }
  return clamp(value,.10,1.);
}

vec3 brdf(vec3 color,vec3 n,vec3 v,vec3 l,float roughness){
  vec3 h=normalize(v+l);
  float nl=max(dot(n,l),0.),nv=max(dot(n,v),.01),nh=max(dot(n,h),0.);
  float a=roughness*roughness,a2=a*a,den=nh*nh*(a2-1.)+1.;
  float distribution=a2/(PI*den*den);
  float k=pow(roughness+1.,2.)/8.;
  float visibility=(nl/(nl*(1.-k)+k))*(nv/(nv*(1.-k)+k));
  vec3 fresnel=vec3(.04)+.96*pow(1.-max(dot(v,h),0.),5.);
  return ((1.-fresnel)*color/PI+distribution*visibility*fresnel/max(.01,4.*nl*nv))*nl;
}

vec3 endGrain(vec3 p,vec3 color){
  float rings=sin(length(p.xy+vec2(hash(137.),hash(148.))*90.)*2.8+sin(p.y*.23)*.7);
  return color*(.72+.12*rings);
}

vec4 shade(vec3 p,vec3 ray,float material){
  vec3 n=normalAt(p),v=-ray;
  vec3 key=normalize(vec3(-.65+lighting.x,-.8+lighting.y,1.7));
  if(material>1.5){
    if(material>2.5){
      float gap=abs(rounded2(p.xy,shape.xy*.5-5.5,4.));
      float contact=exp(-gap*.85);
      vec3 bed=mix(vec3(.07,.17,.24),vec3(.005,.012,.018),contact*.9);
      return vec4(bed,.74);
    }
    float fresnel=.08+.92*pow(1.-max(dot(n,v),0.),5.);
    float reflection=pow(max(dot(reflect(-key,n),v),0.),14.);
    vec3 tint=mix(vec3(.48,.70,.79),vec3(.10,.25,.34),state.w);
    vec3 color=tint+reflection*.78+vec3(.08,.38,.72)*(state.y*.15+state.z*.28);
    return vec4(color,.62+fresnel*.32);
  }
  vec3 albedo=fibers(p.xy);
  float stock=board(p.xy).z;
  bool alongX=stock==0.||stock==1.||stock==3.;
  if(n.z<.55&&(alongX?abs(n.x):abs(n.y))>.5)albedo=endGrain(p,albedo);
  albedo*=.96+hash(board(p.xy).z+167.)*.08;
  albedo=pow(albedo,vec3(2.2));
  float ao=shape.w<.5?mix(.92,.72,state.x):.92;
  vec3 color=albedo*.44*ao+brdf(albedo,n,v,key,.34+toolCut(p.xy)*1.3)*3.3*shadow(p+n*.16,key);
  vec3 fill=normalize(vec3(.8,.5,.8));
  color+=brdf(albedo,n,v,fill,.44)*vec3(.24,.52,.85)*(1.+lighting.z*.35);
  color=color/(1.+color*.34);
  return vec4(pow(max(color,0.),vec3(1./2.2)),1.);
}

vec4 trace(vec2 screen){
  vec2 p=screen-shape.xy*.5;
  if(shape.w>.5&&rounded2(p,shape.xy*.5-shape.z-8.,1.)<0.)return vec4(0.);
  vec3 ray=normalize(shape.w<.5?vec3(.24,.32,-1.):vec3(.10,.18,-1.));
  vec3 origin=vec3(p,0.)-ray*30.;
  float t=0.;vec2 hit=vec2(0.);
  for(int i=0;i<70;i++){
    hit=solids(origin+ray*t);
    if(hit.x<.035)break;
    t+=max(.025,hit.x*.65);
    if(t>54.)return vec4(0.);
  }
  vec3 point=origin+ray*t;
  if(hit.x>.08)return vec4(0.);
  return shade(point,ray,hit.y);
}

void main(){
  vec2 screen=windowRect.xy+vec2(uv.x,1.-uv.y)*windowRect.zw;
  vec4 color=trace(screen);
  if(density<1.5){
    color=(trace(screen+vec2(-.22,-.22))+trace(screen+vec2(.22,-.22))+
      trace(screen+vec2(-.22,.22))+trace(screen+vec2(.22,.22)))*.25;
  }
  pixel=color;
}`;
