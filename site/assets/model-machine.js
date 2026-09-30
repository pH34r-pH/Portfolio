const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COARSE = matchMedia("(pointer: coarse)").matches;

function splitTokens(text) {
  return (text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || []).slice(0, 18);
}
function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function toyCompletion(text, count = 8) {
  const vocabulary = ["system","state","signal","context","maps","through","the","next","layer","into","a","usable","prediction","path","while","structure","remains","visible"];
  let seed = hashText(text || "research");
  const out = [];
  for (let i = 0; i < count; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    out.push(vocabulary[Math.abs(seed) % vocabulary.length]);
  }
  return out;
}

class ModelMachine {
  constructor(root) {
    this.root = root;
    root.machine = this;
    this.viewport = root.querySelector(".machine-viewport");
    this.input = root.querySelector("[data-machine-input]");
    this.output = root.querySelector("[data-machine-output]");
    this.status = root.querySelector("[data-machine-status]");
    this.runButton = root.querySelector("[data-machine-run]");
    this.stageButtons = [...root.querySelectorAll("[data-machine-stage-button]")];
    this.stage = root.dataset.stage || "all";
    this.running = false;
    this.frame = 0;
    this.pulses = [];
    this.tokenMeshes = [];
    this.nodes = [];
    this.layers = [];
    this.bind();
    this.observe();
  }
  bind() {
    this.runButton?.addEventListener("click", () => this.run());
    this.input?.addEventListener("keydown", event => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") this.run();
    });
    this.stageButtons.forEach(button => button.addEventListener("click", () => this.focus(button.dataset.machineStageButton)));
  }
  observe() {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        this.init();
      }
    }, {rootMargin:"0px"});
    observer.observe(this.root);
  }
  async init() {
    if (this.ready || REDUCED) return;
    try {
      const THREE = await import("/assets/vendor/three.module.min.js");
      this.THREE = THREE;
      const {Scene,PerspectiveCamera,WebGLRenderer,Color,Group,BoxGeometry,MeshBasicMaterial,Mesh,EdgesGeometry,LineSegments,LineBasicMaterial,SphereGeometry,Vector3} = THREE;
      this.scene = new Scene();
      this.scene.background = new Color(0x020b13);
      this.camera = new PerspectiveCamera(40, 1, .1, 100);
      this.camera.position.set(0, 4.5, 14);
      this.camera.lookAt(0,0,0);
      this.renderer = new WebGLRenderer({antialias:true,powerPreference:"high-performance",alpha:false});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.5 : 2));
      this.renderer.domElement.setAttribute("aria-hidden","true");\n      this.viewport.append(this.renderer.domElement);

      this.tokenGroup = new Group();
      this.nodeGroup = new Group();
      this.scene.add(this.tokenGroup,this.nodeGroup);

      const layerX = [-4.6,-1.7,1.3,4.25];
      const layerCounts = [4,7,6,4];
      layerX.forEach((x, li) => {
        const layer = new Group();
        const count = layerCounts[li];
        for (let i=0;i<count;i++) {
          const y = (i-(count-1)/2)*.82;
          const g = new SphereGeometry(.105,16,12);
          const m = new MeshBasicMaterial({color: li === 3 ? 0x67c9ff : 0x1b9cff,transparent:true,opacity:.42});
          const node = new Mesh(g,m);
          node.position.set(x,y,(i%2)*.55-.27);
          layer.add(node); this.nodes.push({mesh:node,layer:li});
        }
        this.nodeGroup.add(layer); this.layers.push(layer);
      });

      for(let li=0;li<layerX.length-1;li++){
        const left=this.layers[li].children,right=this.layers[li+1].children;
        left.forEach((a,ai)=>{
          right.forEach((b,bi)=>{
            if((ai+bi)%2) return;
            const points=[a.getWorldPosition(new Vector3()),b.getWorldPosition(new Vector3())];
            const geom=new THREE.BufferGeometry().setFromPoints(points);
            const line=new THREE.Line(geom,new LineBasicMaterial({color:0x0b5d92,transparent:true,opacity:.13}));
            this.scene.add(line);
          });
        });
      }
      this.resize();
      new ResizeObserver(()=>this.resize()).observe(this.viewport);
      this.ready = true;
      this.root.dataset.ready = "true";
      this.status.textContent = "READY / ENTER TEXT";
      this.animate();
      this.run();
    } catch {
      this.status.textContent = "STATIC PATH";
    }
  }
  resize() {
    if (!this.renderer) return;
    const rect = this.viewport.getBoundingClientRect();
    this.renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
    this.camera.aspect = rect.width / Math.max(rect.height,1);
    this.camera.updateProjectionMatrix();
  }
  clearTokens() {
    this.tokenMeshes.forEach(item => {
      item.mesh.geometry.dispose(); item.mesh.material.dispose();
      this.tokenGroup.remove(item.mesh);
    });
    this.tokenMeshes = [];
    this.pulses.forEach(item => {
      item.mesh.geometry.dispose(); item.mesh.material.dispose();
      this.scene.remove(item.mesh);
    });
    this.pulses = [];
  }
  run() {
    const text = (this.input?.value || "").trim() || "A model can store a signal without using it.";
    if (this.input && !this.input.value.trim()) this.input.value = text;
    const tokens = splitTokens(text);
    this.output.textContent = "";
    if (!this.ready || REDUCED) {
      this.output.textContent = toyCompletion(text).join(" ");
      this.status.textContent = `${tokens.length} TOKENS / PATH COMPLETE`;
      return;
    }
    this.clearTokens();
    const THREE = this.THREE;
    const geo = new THREE.BoxGeometry(.34,.22,.22);
    tokens.forEach((token,i)=>{
      const mat = new THREE.MeshBasicMaterial({color: i%3===0?0x67c9ff:0x118ff0,transparent:true,opacity:.9});
      const mesh = new THREE.Mesh(geo.clone(),mat);
      mesh.position.set(-6.7,2.3 - (i%7)*.34, (i%3)*.24-.24);
      mesh.scale.x = Math.min(1.9,.65 + token.length*.09);
      this.tokenGroup.add(mesh);
      this.tokenMeshes.push({mesh,delay:i*.075,t:0,target:new THREE.Vector3(-4.9,(i%4-1.5)*.75,0)});
    });
    this.completion = toyCompletion(text);
    this.running = true;
    this.started = performance.now()/1000;
    this.status.textContent = `TOKENIZED / ${tokens.length} BLOCKS`;
  }
  emitPulse(from,to,delay=0) {
    const THREE=this.THREE;
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(.08,12,8),new THREE.MeshBasicMaterial({color:0xb9eaff,transparent:true,opacity:.95}));
    mesh.position.copy(from); this.scene.add(mesh);
    this.pulses.push({mesh,from:from.clone(),to:to.clone(),t:-delay,speed:1.8+Math.random()*.7});
  }
  focus(stage) {
    this.stage = stage;
    this.stageButtons.forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.machineStageButton===stage)));
    this.nodes.forEach(({mesh,layer})=>{
      const map={input:0,state:1,consumer:2,output:3};
      const active=stage==="all"||map[stage]===layer;
      mesh.material.opacity=active?.88:.16;
    });
  }
  animate = () => {
    if (!this.renderer) return;
    const now=performance.now()/1000;
    const dt=Math.min(.034,now-(this.last||now)); this.last=now;
    if (this.running) {
      let settled=0;
      this.tokenMeshes.forEach((item,i)=>{
        item.t += dt;
        const p=Math.max(0,Math.min(1,(item.t-item.delay)*1.75));
        const e=1-Math.pow(1-p,4);
        item.mesh.position.lerpVectors(new this.THREE.Vector3(-6.7,item.mesh.position.y,item.mesh.position.z),item.target,e);
        item.mesh.rotation.z += dt*2.4;
        if(p>=1){ settled++; if(!item.fired){item.fired=true; const n=this.layers[0].children[i%this.layers[0].children.length]; this.emitPulse(n.getWorldPosition(new this.THREE.Vector3()),this.layers[1].children[i%this.layers[1].children.length].getWorldPosition(new this.THREE.Vector3()),i*.018);}}
      });
      if(settled===this.tokenMeshes.length && !this.cascade){
        this.cascade=true; this.status.textContent="PROPAGATING / ACTIVATION";
        for(let li=1;li<this.layers.length-1;li++){
          this.layers[li].children.forEach((n,i)=>{
            const next=this.layers[li+1].children[i%this.layers[li+1].children.length];
            this.emitPulse(n.getWorldPosition(new this.THREE.Vector3()),next.getWorldPosition(new this.THREE.Vector3()),li*.18+i*.025);
          });
        }
      }
      if(this.cascade && now-this.started>2.25 && !this.wrote){
        this.wrote=true; this.status.textContent="READOUT / EMITTING TOKENS";
        let i=0; const timer=setInterval(()=>{
          if(i>=this.completion.length){clearInterval(timer);this.status.textContent="PATH COMPLETE";this.running=false;this.cascade=false;this.wrote=false;return;}
          this.output.textContent += (i?" ":"")+this.completion[i++]; 
        },95);
      }
    }
    this.pulses.forEach(p=>{
      p.t += dt*p.speed;
      if(p.t>=0){
        const x=Math.min(1,p.t); const e=x*x*(3-2*x);
        p.mesh.position.lerpVectors(p.from,p.to,e);
        p.mesh.material.opacity = 1-Math.max(0,(x-.72)/.28);
      }
    });
    this.pulses=this.pulses.filter(p=>{if(p.t<=1)return true;this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();return false;});
    const breathe=.74+.12*Math.sin(now*2.4);
    this.nodes.forEach(({mesh})=>{if(this.stage==="all")mesh.material.opacity=Math.max(mesh.material.opacity*.985,breathe*.42)});
    this.renderer.render(this.scene,this.camera);
    requestAnimationFrame(this.animate);
  }
}

document.querySelectorAll("[data-model-machine]").forEach(root=>new ModelMachine(root));

function inferredStage(element){
  if(element.dataset.machineStage) return element.dataset.machineStage;
  const text=(element.textContent||"").toLowerCase();
  if(/token|input|encoding|representation/.test(text)) return /representation|state/.test(text) ? "state" : "input";
  if(/consumer|readout|probe|prediction|decoder/.test(text)) return "consumer";
  if(/output|generation|next[- ]?byte|next[- ]?token/.test(text)) return "output";
  if(/state|recurrent|hidden|memory|sphere|normaliz/.test(text)) return "state";
  return "all";
}

const sectionObserver = new IntersectionObserver(entries=>{
  const active=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
  if(!active) return;
  const stage=inferredStage(active.target);
  const machine=document.querySelector("[data-model-machine]");
  if(machine && stage) machine.machine?.focus(stage);
},{rootMargin:"-30% 0px -52% 0px",threshold:[0,.2,.5]});
document.querySelectorAll("[data-machine-stage],.myst-reader h2").forEach(el=>sectionObserver.observe(el));
