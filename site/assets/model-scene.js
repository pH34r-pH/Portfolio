import { sampleModelLight } from "./model-light.js";
import { GRAPH, TOPOLOGY, clamp, hashText, layerX } from "./model-topology.js";
import { ModelGestures } from "./model-gestures.js";
import { SharedGlass } from "./model-glass.js";
import { RenderMetrics } from "./model-render-metrics.js";
import { ModelQuality } from "./model-quality.js";
import { buildMachineHardware } from "./model-hardware.js";
import { digitalContours } from './model-digital.js';
import { HomepageScreens } from './homepage-screens.js';
import { containedDigitalView, digitalView, POSTER_FIT_MARGIN, POSTER_VIEWS } from './model-view.js';
import { applyPower } from './model-power.js';
const mobile = () => matchMedia("(max-width:720px)").matches;

export class MachineScene {
  constructor(T, root, selectNode, fail, scrub, instruments) {
    this.T = T; this.root = root; this.digital = root.hasAttribute('data-digital-home'); this.canvas = root.querySelector("[data-machine-canvas]");
    this.preparing=this.digital&&root.hasAttribute('data-model-startup');this.powerProgress=this.preparing?0:null;
    const options = { alpha: true, antialias: true, powerPreference: "low-power" };
    const context = this.canvas.getContext("webgl2", options);
    if (!context) {throw new Error("WebGL2 unavailable");}
    this.quality = new ModelQuality(context);
    this.renderer = new T.WebGLRenderer({ canvas: this.canvas, context, ...options });
    this.transmissionTarget = null;
    const setRenderTarget = this.renderer.setRenderTarget.bind(this.renderer);
    this.renderer.setRenderTarget = (target, ...args) => {
      const result = setRenderTarget(target, ...args);
      if (target && target.samples && Math.abs(target.width-this.canvas.width)<=1 && Math.abs(target.height-this.canvas.height)<=1) {
        this.transmissionTarget = {width:target.width, height:target.height, samples:target.samples,
          activeSamples:context.getParameter(context.SAMPLES),viewport:Array.from(context.getParameter(context.VIEWPORT))};
      }
      return result;
    };
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.transmissionResolutionScale = 1;
    this.renderer.info.autoReset = false; this.metrics = new RenderMetrics(this.renderer);
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(28, 1, .1, 80);
    this.machine = new T.Group(); this.scene.add(this.machine);
    this.phone=mobile();this.poseTouched=false;
    this.yaw = this.phone ? -.15 : -.5; this.pitch = this.phone ? .38 : .1; this.zoom = 1; this.pan = {x:0,y:0}; this.selected = GRAPH.layers[6][0]; this.focus = "all";
    this.materials = {
      shell: new T.MeshStandardMaterial({ color: 0x10364c, metalness: .72, roughness: .28 }),
      ceramic: new T.MeshStandardMaterial({ color: 0x8faabd, metalness: .32, roughness: .23 }),
      node: new T.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.9, depthWrite:false, blending:T.AdditiveBlending}),
      edge: new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .18, depthWrite: false }),
      probe: new T.LineBasicMaterial({ color: 0x168cdd, transparent: true, opacity: .85, depthWrite: false }),
      signal: new T.MeshStandardMaterial({ color: 0x60ccff, emissive: 0x16a6ff, emissiveIntensity: 2, roughness: .25 }),
    };
    this.materials.probe.color.set(0x9b78cf); this.materials.signal.color.set(0x9b78cf);
    this.dummy = new T.Object3D(); this.color = new T.Color();
    this.buildGraph(); this.buildHardware(); this.addLights();
    const Screens = this.digital ? HomepageScreens : SharedGlass;
    this.glass = new Screens(T, this.scene, this.renderer, instruments);
    this.glass.setQuality(this.quality.effective); instruments.quality(this.quality.effective);
    this.fitGeometry = this.collectFitGeometry();
    this.bindOrbit(selectNode,scrub);
    this.contextLost = event => { event.preventDefault(); fail("webgl-context-lost"); };
    this.canvas.addEventListener("webglcontextlost", this.contextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.canvas);
    this.themeObserver = new MutationObserver(() => this.refreshTheme());
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    this.refreshTheme(); this.resize();
  }
  buildGraph() {
    const T = this.T;
    // Home and article nodes use the same fine point geometry and contour field.
    this.beads = new T.InstancedMesh(new T.OctahedronGeometry(.0255), this.materials.node, GRAPH.nodes.length);
    this.beads.instanceMatrix.setUsage(T.DynamicDrawUsage);
    GRAPH.nodes.forEach((node, index) => {
      this.dummy.position.set(...node.position); this.dummy.updateMatrix();
      this.beads.setMatrixAt(index, this.dummy.matrix);
      this.beads.setColorAt(index, this.color.set(0x165577));
    });
    this.machine.add(this.beads);
    const segments=[];this.edgeOffsets=[];
    GRAPH.edges.forEach(edge=>{
      this.edgeOffsets.push(segments.length);
      const points=this.edgePoints(edge);
      for(let index=1;index<points.length;index++){segments.push(...points[index-1],...points[index]);}
    });
    this.edgeOffsets.push(segments.length);
    const positions=new Float32Array(segments);
    this.edgeColors = new Float32Array(positions.length);
    this.edgeGeometry = new T.BufferGeometry();
    this.edgeGeometry.setAttribute("position", new T.BufferAttribute(positions, 3));
    this.edgeGeometry.setAttribute("color", new T.BufferAttribute(this.edgeColors, 3).setUsage(T.DynamicDrawUsage));
    this.edges = new T.LineSegments(this.edgeGeometry, this.materials.edge); this.machine.add(this.edges);
    this.probe = new T.LineSegments(new T.BufferGeometry(), this.materials.probe); this.machine.add(this.probe);
    this.selection = new T.Mesh(new T.TorusGeometry(.1015, .0112, 6, 32), this.materials.signal);
    this.machine.add(this.selection);
    this.pulses = new T.InstancedMesh(new T.SphereGeometry(.0455, 8, 6), this.materials.signal, 12);
    this.tokens = new T.InstancedMesh(new T.BoxGeometry(.21, .15, .22), this.materials.ceramic, 12);
    this.machine.add(this.pulses, this.tokens);
    this.select(this.selected);
  }
  buildHardware() {
    if (!this.digital) this.machine.add(buildMachineHardware(this.T, this.materials, TOPOLOGY, layerX));
    this.contours = digitalContours(this.T); this.machine.add(this.contours);
  }
  addLights() {
    const T = this.T;
    this.scene.add(new T.HemisphereLight(0xd6efff, 0x041225, 1.25));
    const key = new T.DirectionalLight(0xe9f5ff, 3.4); key.position.set(-3, 5, 6); this.scene.add(key);
    const rim = new T.DirectionalLight(0x1789f5, 4.5); rim.position.set(3, -1, -5); this.scene.add(rim);
    const fill = new T.DirectionalLight(0x5ecfff, 1.8); fill.position.set(1, -4, 3); this.scene.add(fill);
    this.replayLight = new T.PointLight(0x39baff, 0, 7, 2); this.machine.add(this.replayLight);
    this.replayLight.userData.replayPulse = true;
  }
  resize() {
    if (this.disposed) {return;}
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) {return;}
    // Native DPR is retained unless it exceeds the actual GL target/viewport limit.
    this.renderer.setPixelRatio(this.pixelRatio(width,height));
    this.renderer.transmissionResolutionScale = 1;
    this.renderer.setSize(width, height, false);
    const view=this.configureView(width,height),phone=mobile(),fitKey=this.digital?`poster:${phone}`:`${width}x${height}:${view.fov}`;
    this.machine.rotation.set(0,0,0);this.machine.position.y=0;this.machine.scale.setScalar(.9);this.machine.updateMatrixWorld(true);
    // Refit only when the actual layout changes. Same-size glass/coordinate
    // relayouts must not alter the base camera distance after user inspection.
    if(this.fitKey!==fitKey) {
      if(this.digital) {
        const poster=POSTER_VIEWS[phone?'phone':'desktop'];
        const posterView=digitalView(poster.width/poster.height,phone);
        this.distance=this.fitGraphDistance(poster.width,poster.height,poster.yaw,poster.pitch,posterView.fov,POSTER_FIT_MARGIN);
      } else {
        this.distance=this.fitGraphDistance(width,height,this.yaw,this.pitch,view.fov);
      }
      this.fitKey=fitKey;
    }
    // Home borrows the canonical poster's distance, while its live camera keeps
    // the actual canvas projection so a contained poster and live graph scale
    // together at every host aspect ratio.
    this.camera.aspect=width/height;this.camera.fov=view.fov;this.camera.updateProjectionMatrix();
    this.updateCamera();
    const stage = this.canvas.parentElement;
    if (!this.digital) {this.glass.instruments.layer.style.cssText = `width:${width}px;height:${height}px;top:${stage.offsetTop + stage.clientTop + this.canvas.offsetTop}px;left:${stage.offsetLeft + stage.clientLeft + this.canvas.offsetLeft}px`;}
    this.glass.layout(this.camera, {width, height}, this.distance, mobile());
    // Layout can rebuild scene planes. Keep the rendered camera synchronized
    // with the stored inspection pose after every resize-driven layout.
    this.updateCamera();
    this.render();
  }
  pixelRatio(width,height) {
    const native=Number(window.devicePixelRatio)||1;
    // WebGL drawing buffers, renderbuffers, textures and viewports share the
    // strictest active GL dimension limit; only that hardware limit may reduce DPR.
    const dimensionLimit=this.quality.limits.maxTargetDimension;
    return Math.min(native,dimensionLimit/Math.max(width,height));
  }
  configureView(width,height) {
    const phone=mobile();
    if(this.phone!==phone&&this.digital&&!this.poseTouched) {
      this.yaw=phone ? -.15 : -.5;this.pitch=phone ? .38 : .1;this.zoom=1;this.pan={x:0,y:0};
    }
    this.phone=phone;
    this.camera.aspect=width/height;
    const view=this.digital?containedDigitalView(width,height,phone):digitalView(this.camera.aspect,phone);
    this.camera.fov=view.fov;this.camera.updateProjectionMatrix();return view;
  }
  collectFitGeometry() {
    const nodes=[],routeControlPoints=[],contourVertices=[],carrierEnvelope=[],support=.13;
    for(const node of GRAPH.nodes)for(const x of [-support,support])for(const y of [-support,support])for(const z of [-support,support])
      nodes.push([node.position[0]+x,node.position[1]+y,node.position[2]+z]);
    for(const edge of GRAPH.edges)routeControlPoints.push(...this.edgePoints(edge));
    const contour=this.contours.geometry.attributes.position.array;
    for(let index=0;index<contour.length;index+=3)contourVertices.push([contour[index],contour[index+1],contour[index+2]]);
    for(const center of [[-6,0,.02],[-4.52,0,.02],[4.45,0,.02],[6,0,.02]])
      for(const x of [-.13,.13])for(const y of [-.85,.85])for(const z of [-.14,.14])carrierEnvelope.push([center[0]+x,center[1]+y,center[2]+z]);
    const groups={nodes,routeControlPoints,contourVertices,carrierEnvelope};
    return {...groups,all:Object.values(groups).flat(),routeCount:GRAPH.edges.length,
      recurrenceCount:GRAPH.edges.filter(edge=>edge.kind.startsWith('shared block')).length};
  }
  graphFitsAt(distance,width,height,yaw,pitch,margin) {
    this.poseCamera(yaw,pitch,1,{x:0,y:0},distance);this.machine.updateMatrixWorld(true);
    const point=new this.T.Vector3(),limitX=width-margin,limitY=height-margin;
    for(const [x,y,z] of this.fitGeometry.all) {
      point.set(x,y,z).applyMatrix4(this.machine.matrixWorld).project(this.camera);
      const screenX=(point.x+1)*width*.5,screenY=(1-point.y)*height*.5;
      if(point.z < -1 || point.z > 1 || screenX < margin || screenX > limitX || screenY < margin || screenY > limitY)return false;
    }
    return true;
  }
  fitGraphDistance(width,height,yaw,pitch,fov,requestedMargin) {
    this.camera.aspect=width/height;this.camera.fov=fov;this.camera.updateProjectionMatrix();
    const margin=requestedMargin??Math.min(12,Math.max(4,Math.min(width,height)*.04));
    this.cameraFitMargin=margin;
    let lower=.1,upper=1;
    while(upper<72&&!this.graphFitsAt(upper,width,height,yaw,pitch,margin))upper*=1.5;
    if(upper>=72&&!this.graphFitsAt(upper,width,height,yaw,pitch,margin))throw new Error('Complete graph geometry exceeds the supported camera fit range');
    for(let iteration=0;iteration<22;iteration++) {
      const middle=(lower+upper)*.5;
      if(this.graphFitsAt(middle,width,height,yaw,pitch,margin))upper=middle;else lower=middle;
    }
    return upper*1.002;
  }
  projectBounds(points,width,height) {
    const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity,count:points.length},point=new this.T.Vector3();
    for(const [x,y,z] of points) {
      point.set(x,y,z).applyMatrix4(this.machine.matrixWorld).project(this.camera);
      const screenX=(point.x+1)*width*.5,screenY=(1-point.y)*height*.5;
      bounds.left=Math.min(bounds.left,screenX);bounds.right=Math.max(bounds.right,screenX);
      bounds.top=Math.min(bounds.top,screenY);bounds.bottom=Math.max(bounds.bottom,screenY);
    }
    if(!points.length)Object.assign(bounds,{left:0,right:0,top:0,bottom:0});
    return Object.fromEntries(Object.entries(bounds).map(([key,value])=>[key,key==='count'?value:+value.toFixed(3)]));
  }
  projectedGraphBounds(width,height) {
    this.machine.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);
    const components=Object.fromEntries(Object.entries(this.fitGeometry).filter(([key])=>!['all','routeCount','recurrenceCount'].includes(key))
      .map(([key,points])=>[key,this.projectBounds(points,width,height)]));
    return {viewport:{width,height},marginPx:Math.min(12,Math.max(4,Math.min(width,height)*.04)),cameraFitMarginPx:this.cameraFitMargin,routeCount:this.fitGeometry.routeCount,
      recurrenceCount:this.fitGeometry.recurrenceCount,components,all:this.projectBounds(this.fitGeometry.all,width,height)};
  }
  poseCamera(yaw, pitch, zoom, pan, distance=this.distance) {
    const viewDistance = distance / zoom;
    const near = Math.max(Number.MIN_VALUE, Math.min(.1, viewDistance / 1000));
    const far = Math.max(80, viewDistance * 1.25 + distance);
    if (!Number.isFinite(viewDistance) || viewDistance <= 0 || !Number.isFinite(near) || !Number.isFinite(far) || far <= near) return false;
    if (this.camera.near !== near || this.camera.far !== far) {
      this.camera.near = near; this.camera.far = far; this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(pan.x - Math.sin(yaw) * Math.cos(pitch) * viewDistance, pan.y + Math.sin(pitch) * viewDistance, Math.cos(yaw) * Math.cos(pitch) * viewDistance);
    this.camera.lookAt(pan.x, pan.y, 0); this.camera.updateMatrixWorld(); return true;
  }
  updateCamera() { this.poseCamera(this.yaw, this.pitch, this.zoom, this.pan); }
  setQuality(mode) {
    this.quality.set(mode);
    this.beads.geometry.dispose();
    this.beads.geometry = new this.T.OctahedronGeometry(.0255);
    this.glass.setQuality(this.quality.effective); this.glass.instruments.quality(this.quality.effective);
    this.resize(); if (this.snapshot) {this.applyFrame(this.run, this.snapshot);}
  }
  render(force=false) {
    if (this.disposed||this.preparing) {return;}
    if (this.digital&&!force) { const rect = this.canvas.getBoundingClientRect(); if (rect.bottom < 0 || rect.top > innerHeight) {return;} }
    this.glass?.sync(this.camera);this.scene.updateMatrixWorld();this.camera.updateMatrixWorld();this.renderer.info.reset(); this.metrics.begin();
    this.renderer.render(this.scene, this.camera); this.metrics.end();
  }
  refreshTheme() {
    this.dark = document.documentElement.dataset.theme === "dark";
    this.powerBackground=new this.T.Color(getComputedStyle(this.root).getPropertyValue('--bg').trim()||(this.dark?'#050712':'#f4f9fd'));
    this.scene.background = this.digital ? null : new this.T.Color(this.dark ? 0x071b2b : 0xe6f1fa);
    this.materials.shell.color.set(this.dark ? 0x123b51 : 0x46768b);
    this.materials.ceramic.color.set(this.dark ? 0x799bad : 0xd4e8f4);
    this.materials.edge.opacity = this.dark ? .23 : .17;
    this.contours.material.color.set(this.dark ? 0x447abb : 0x165577);
    this.contours.material.opacity = this.dark ? .28 : .2;
    if (this.snapshot) {this.applyFrame(this.run, this.snapshot);} else {this.render();}
  }
  applyFrame(run, state) {
    if (this.disposed) {return;}
    const began = performance.now();
    this.run = run; this.snapshot = state;
    if(this.powerProgress!==null){applyPower(this,this.powerProgress);this.render();return;}
    const T = this.T, base = new T.Color(this.dark ? 0x447abb : 0x165577), active = new T.Color(0x39baff);
    GRAPH.nodes.forEach((node, index) => {
      const value = state.activations[index], selected = index === this.selected;
      const dim = this.focus === "consumer" && node.layer < 4 || this.focus === "representation" && node.layer > 3;
      this.color.copy(base).lerp(active, value); if (dim) {this.color.multiplyScalar(.38);}
      this.beads.setColorAt(index, this.color);
      this.dummy.position.set(...node.position); this.dummy.scale.setScalar(1 + value * .25 + (selected ? .18 : 0)); this.dummy.updateMatrix();
      this.beads.setMatrixAt(index, this.dummy.matrix);
    });
    this.dummy.scale.setScalar(1);
    this.beads.instanceColor.needsUpdate = true;
    this.beads.instanceMatrix.needsUpdate = true;
    GRAPH.edges.forEach((edge,index)=>{
      const value=Math.min(state.activations[edge.source],state.activations[edge.target]),intensity=.15+value*.85;
      for(let offset=this.edgeOffsets[index];offset<this.edgeOffsets[index+1];offset+=3) {
        this.edgeColors[offset]=intensity*.04;this.edgeColors[offset+1]=intensity*.42;this.edgeColors[offset+2]=intensity;
      }
    });
    this.edgeGeometry.attributes.color.needsUpdate = true;
    const light = sampleModelLight(run, state.frame, false);
    this.replayLight.position.set((light.x - .5) * 8.88, 1.6, 3);
    this.replayLight.intensity = light.energy * 14;
    this.glass.pulse(light.energy);
    this.updateCarriers(run, state.frame); this.render();
    this.metrics.add(this.metrics.frameCPU, performance.now() - began);
  }
  updateCarriers(run, frame) {
    const T = this.T;
    this.pulses.count = run.tokens.length; this.tokens.count = run.tokens.length;
    run.tokens.forEach((token, index) => {
      const delay = index * 2;
      const progress = (frame - 54 - delay) / 25;
      const layer = clamp(Math.floor(progress), 0, GRAPH.layers.length-2), amount = clamp(progress - layer, 0, 1);
      const pathNode = depth => GRAPH.nodes[GRAPH.layers[depth][hashText(`${run.seed}:${index}:${depth}`) % TOPOLOGY.widths[depth]]];
      const a = pathNode(layer).position, b = pathNode(layer + 1).position;
      this.dummy.position.set(...a).lerp(new T.Vector3(...b), amount);
      this.dummy.scale.setScalar(progress >= 0 && progress < GRAPH.layers.length-1 ? 1 : 0); this.dummy.updateMatrix();
      this.pulses.setMatrixAt(index, this.dummy.matrix);
      const input = frame < 54, t = input ? clamp((frame - delay) / 46, 0, 1) : clamp((frame - 252 - index * 8) / 20, 0, 1);
      this.dummy.position.set(input ? -6 + t * 1.48 : 4.45 + t * 1.55, (index - (run.tokens.length - 1) / 2) * .13, .02);
      this.dummy.scale.setScalar(input || frame >= 252 + index * 8 && t < 1 ? 1 : 0); this.dummy.updateMatrix();
      this.tokens.setMatrixAt(index, this.dummy.matrix);
    });
    this.dummy.scale.setScalar(1); this.pulses.instanceMatrix.needsUpdate = true; this.tokens.instanceMatrix.needsUpdate = true;
  }
  select(index) {
    this.selected = index;
    const node = GRAPH.nodes[index]; this.selection.position.set(...node.position);
    const points = [];
    for (const edgeIndex of [...node.incoming, ...node.outgoing]) {
      const edge = GRAPH.edges[edgeIndex]; const route=this.edgePoints(edge);for(let index=1;index<route.length;index++){points.push(new this.T.Vector3(...route[index-1]),new this.T.Vector3(...route[index]));}
    }
    this.probe.geometry.dispose(); this.probe.geometry = new this.T.BufferGeometry().setFromPoints(points);
    if (this.snapshot) {this.applyFrame(this.run, this.snapshot);} else {this.render();}
  }
  setFocus(part) { this.focus = part; this.glass.instruments.setContext(part); if (this.snapshot) {this.applyFrame(this.run, this.snapshot);} }
  orbit(dx, dy) { this.poseTouched=true;this.yaw = clamp(this.yaw + dx, -1.05, 1.05); this.pitch = clamp(this.pitch + dy, -.65, .65); this.updateCamera(); this.render(); }
  zoomBy(amount) { this.zoomByRatio(Math.exp(Number.isFinite(amount) ? amount : 0)); }
  zoomByRatio(ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    const next = this.zoom * ratio, viewDistance = this.distance / next;
    if (!Number.isFinite(next) || next <= 0 || !Number.isFinite(viewDistance) || viewDistance <= 0) return;
    // Recompute clipping planes from the finite camera distance. Zoom itself
    // has no fixed range; only IEEE-754 representability bounds the pose.
    const near = Math.max(Number.MIN_VALUE, Math.min(.1, viewDistance / 1000));
    const far = Math.max(80, viewDistance * 1.25 + this.distance);
    if (!Number.isFinite(near) || !Number.isFinite(far) || far <= near) return;
    this.poseTouched = true; this.zoom = next;
    this.updateCamera(); this.render();
  }
  resetView() { this.poseTouched=false;this.yaw = mobile() ? -.15 : -.5; this.pitch = mobile() ? .38 : .1; this.zoom = 1; this.pan={x:0,y:0}; this.depthView = null; if(!this.digital)this.fitKey=null; this.resize(); }
  panBy(dx,dy) { this.poseTouched=true;this.pan.x=clamp(this.pan.x+dx,-2,2);this.pan.y=clamp(this.pan.y+dy,-2,2);this.updateCamera(); this.render(); }
  toggleDepthView() {
    if (this.depthView) { const {yaw, pitch} = this.depthView; this.depthView = null; this.yaw = yaw; this.pitch = pitch; this.updateCamera(); this.render(); }
    else { this.depthView = {yaw:this.yaw, pitch:this.pitch}; this.orbit(-.05, .01); }
  }
  edgePoints(edge) {
    const a=edge.sourcePosition,b=edge.targetPosition;
    if(edge.kind.startsWith("shared block")){return [a,[a[0],3.05,-.3],[b[0],3.05,-.3],b];}
    if(edge.kind.startsWith("residual")){return [a,[a[0],-2.85,-.2],[b[0],-2.85,-.2],b];}
    return [a,b];
  }
  bindOrbit(selectNode,scrub) {
    this.abort=new AbortController();const options={signal:this.abort.signal};
    this.gestures=new ModelGestures({
      orbit:(dx,dy)=>this.orbit(dx*.007,dy*.005),
      zoom:ratio=>this.zoomByRatio(ratio),
      pan:(dx,dy)=>this.panBy(-dx*.012,dy*.012),
      scrub:dx=>scrub(dx*360/Math.max(this.canvas.clientWidth,1)),
    });
    if (this.digital) {
      window.visualViewport?.addEventListener('resize', () => this.render(), options);
      return; // Homepage gestures belong to native scrolling and browser zoom.
    }
    this.canvas.addEventListener("pointerdown",event=>{
      if(event.button!==0){return;}
      this.gestures.down(event.pointerId,event.clientX,event.clientY);this.canvas.setPointerCapture(event.pointerId);
    },options);
    this.canvas.addEventListener("pointermove",event=>this.gestures.move(event.pointerId,event.clientX,event.clientY),options);
    this.canvas.addEventListener("pointerup",event=>{
      const select=this.gestures.up(event.pointerId);
      if(this.canvas.hasPointerCapture(event.pointerId)){this.canvas.releasePointerCapture(event.pointerId);}
      if(select) {
        const rect=this.canvas.getBoundingClientRect(),pointer=new this.T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
        const ray=new this.T.Raycaster();ray.setFromCamera(pointer,this.camera);
        const hit=ray.intersectObject(this.beads)[0];if(hit?.instanceId!==undefined){selectNode(hit.instanceId);}
      }
    },options);
    for(const type of ["pointercancel","lostpointercapture"]){this.canvas.addEventListener(type,event=>this.gestures.up(event.pointerId,true),options);}
    window.addEventListener("blur",()=>this.gestures.clear(),options);
    window.visualViewport?.addEventListener('resize', () => this.render(), options);
    // No global touch listeners or gesture prevention: OS gestures remain OS-owned.
    // Native browser zoom is retained; camera zoom has pinch/buttons/keyboard alternatives.
  }
  graphOrigin() {
    const point = new this.T.Vector3().applyMatrix4(this.machine.matrixWorld).project(this.camera);
    return [(point.x + 1) * this.glass.viewport.width * .5, (1 - point.y) * this.glass.viewport.height * .5];
  }
  reading({quiet,progress}) {
    if (!this.digital || this.disposed || document.hidden) {return;}
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.bottom < 0 || bounds.top > innerHeight) {return;}
    this.readingState={quiet,progress};if(this.powerProgress!==null){return;}
    this.materials.edge.opacity = quiet ? .065 : (this.dark ? .23 : .18);
    this.materials.node.opacity = quiet ? .42 : .9;
    this.contours.material.opacity = quiet ? .1 : .24 + Math.sin(progress * Math.PI * 2) * .045;
    this.render();
  }
  async prepare() {
    if(!this.preparing){return;}
    applyPower(this,0);this.glass.power=null;this.selection.visible=this.probe.visible=true;this.glass.sync(this.camera);
    await this.renderer.compileAsync(this.scene,this.camera);
    if(!this.disposed){applyPower(this,0);this.preparing=false;}
  }
  setPower(progress,force=false) {this.powerProgress=progress;applyPower(this,progress);this.render(force);}
  finishPower() {
    this.powerProgress=null;this.glass.power=null;this.scene.background=null;this.selection.visible=this.probe.visible=true;
    this.materials.node.blending=this.contours.material.blending=this.T.AdditiveBlending;
    if(this.snapshot){this.applyFrame(this.run,this.snapshot);}else {this.render();}
    if(this.readingState){this.reading(this.readingState);}
  }
  powerView() {
    this.scene.updateMatrixWorld();this.camera.updateMatrixWorld();
    const width=this.glass.viewport.width,height=this.glass.viewport.height,geometryBounds=this.projectedGraphBounds(width,height);
    return {width,height,aspect:this.camera.aspect,fov:this.camera.fov,distance:this.distance,geometryBounds,
      landmarks:GRAPH.layers.map(nodes=>{const p=new this.T.Vector3(...GRAPH.nodes[nodes[0]].position).applyMatrix4(this.machine.matrixWorld).project(this.camera);return [(p.x+1)*width*.5,(1-p.y)*height*.5];})};
  }
  diagnostics() {
    const bounds=this.canvas.getBoundingClientRect(),context=this.renderer.getContext(),view=this.powerView();
    const graphBounds=view.geometryBounds.all;
    return {nodes:this.beads.count,edges:GRAPH.edges.length,graphOrigin:this.graphOrigin(),quality:this.quality.snapshot(),
      drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,pixelRatio:this.renderer.getPixelRatio(),
      transmissionScale:this.renderer.transmissionResolutionScale,resolution:{cssWidth:bounds.width,cssHeight:bounds.height,
        nativeDPR:window.devicePixelRatio||1,effectiveDPR:this.renderer.getPixelRatio(),canvasWidth:this.canvas.width,canvasHeight:this.canvas.height,
        drawingBufferWidth:context.drawingBufferWidth,drawingBufferHeight:context.drawingBufferHeight,
        limits:this.quality.limits,transmissionTarget:this.transmissionTarget},
      landmarks:view.landmarks,graphBounds,graphGeometryBounds:view.geometryBounds,appearance:{pointGeometry:this.beads.geometry.type,pointRadius:this.beads.geometry.parameters.radius,
        lightBlue:'165577',darkBlue:'447abb',activityBlue:'39baff',contourColor:this.contours.material.color.getHexString()},
      resources:{...this.renderer.info.memory},glass:this.glass.diagnostics(),performance:this.metrics.snapshot(),frame:this.snapshot?.frame,
      camera:{yaw:this.yaw,pitch:this.pitch,zoom:this.zoom,pan:{...this.pan},distance:this.distance,
        position:this.camera.position.toArray(),quaternion:this.camera.quaternion.toArray()},pointers:this.gestures.points.size};
  }
  dispose() {
    if (this.disposed) {return;} this.disposed = true;
    this.gestures.clear(); this.abort.abort(); this.resizeObserver.disconnect(); this.themeObserver.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    this.glass.dispose(); this.metrics.dispose();
    const geometry = new Set(), materials = new Set();
    this.scene.traverse(object => { if (object.geometry) {geometry.add(object.geometry);} if (object.material) {materials.add(object.material);} });
    geometry.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); this.renderer.dispose();
  }
}
