import { sampleModelLight } from "./model-light.js";
import { GRAPH, TOPOLOGY, clamp, hashText, layerX } from "./model-topology.js";
import { ModelGestures } from "./model-gestures.js";
import { SharedGlass } from "./model-glass.js";
import { RenderMetrics } from "./model-render-metrics.js";
import { ModelQuality } from "./model-quality.js";
import { buildMachineHardware } from "./model-hardware.js";
const mobile = () => matchMedia("(max-width:720px)").matches;

export class MachineScene {
  constructor(T, root, selectNode, fail, scrub, instruments) {
    this.T = T; this.root = root; this.canvas = root.querySelector("[data-machine-canvas]");
    const options = { alpha: true, antialias: false, powerPreference: "low-power" };
    const context = this.canvas.getContext("webgl2", options);
    if (!context) throw new Error("WebGL2 unavailable");
    this.quality = new ModelQuality(context);
    this.renderer = new T.WebGLRenderer({ canvas: this.canvas, context, ...options });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.transmissionResolutionScale = mobile() ? .4 : .5;
    this.renderer.info.autoReset = false; this.metrics = new RenderMetrics(this.renderer);
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(28, 1, .1, 80);
    this.machine = new T.Group(); this.scene.add(this.machine);
    this.yaw = mobile() ? -.15 : -.5; this.pitch = mobile() ? .38 : .1; this.zoom = 1; this.pan = {x:0,y:0}; this.selected = GRAPH.layers[6][0]; this.focus = "all";
    this.materials = {
      shell: new T.MeshStandardMaterial({ color: 0x10364c, metalness: .72, roughness: .28 }),
      ceramic: new T.MeshStandardMaterial({ color: 0x8faabd, metalness: .32, roughness: .23 }),
      node: new T.MeshStandardMaterial({ color: 0xffffff, metalness: .45, roughness: .2 }),
      core: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9 }),
      edge: new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .18, depthWrite: false }),
      probe: new T.LineBasicMaterial({ color: 0x168cdd, transparent: true, opacity: .85, depthWrite: false }),
      signal: new T.MeshStandardMaterial({ color: 0x60ccff, emissive: 0x16a6ff, emissiveIntensity: 2, roughness: .25 }),
    };
    this.dummy = new T.Object3D(); this.color = new T.Color();
    this.buildGraph(); this.buildHardware(); this.addLights();
    this.glass = new SharedGlass(T, this.scene, this.renderer, instruments);
    this.glass.setQuality(this.quality.effective); instruments.quality(this.quality.effective);
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
    // Coordinates stay 1:1; small projected beads use a bounded geometry LOD.
    this.beads = new T.InstancedMesh(this.quality.lightweight ? new T.OctahedronGeometry(.0595) : new T.SphereGeometry(.0595, 6, 4), this.materials.node, GRAPH.nodes.length);
    this.cores = new T.InstancedMesh(new T.SphereGeometry(.0175, 4, 3), this.materials.core, GRAPH.nodes.length);
    this.cores.count = this.quality.lightweight ? 0 : GRAPH.nodes.length;
    this.beads.instanceMatrix.setUsage(T.DynamicDrawUsage); this.cores.instanceMatrix.setUsage(T.DynamicDrawUsage);
    GRAPH.nodes.forEach((node, index) => {
      this.dummy.position.set(...node.position); this.dummy.updateMatrix();
      this.beads.setMatrixAt(index, this.dummy.matrix); this.cores.setMatrixAt(index, this.dummy.matrix);
      this.beads.setColorAt(index, this.color.set(0xa5c2d8)); this.cores.setColorAt(index, this.color.set(0x062940));
    });
    this.machine.add(this.beads, this.cores);
    const segments=[];this.edgeOffsets=[];
    GRAPH.edges.forEach(edge=>{
      this.edgeOffsets.push(segments.length);
      const points=this.edgePoints(edge);
      for(let index=1;index<points.length;index++)segments.push(...points[index-1],...points[index]);
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
    this.machine.add(buildMachineHardware(this.T, this.materials, TOPOLOGY, layerX));
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
    if (this.disposed) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    // Physical phone caps, including S23 Ultra DPR 3+, preserve the full graph.
    const ratio = this.quality.lightweight ? .8 : (mobile() ? 1.1 : 1.25);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, ratio));
    this.renderer.transmissionResolutionScale = mobile() ? .4 : .5;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height;
    const tangent = Math.tan(14 * Math.PI / 180);
    this.distance = mobile() ? Math.max(9.3 / tangent, 2.9 / (tangent * this.camera.aspect))
      : Math.max(3.7 / tangent, 6.4 / (tangent * this.camera.aspect));
    this.camera.updateProjectionMatrix();
    this.poseCamera(mobile() ? -.15 : -.5, mobile() ? .38 : .1, 1, {x:0,y:0});
    const stage = this.canvas.parentElement;
    this.glass.instruments.layer.style.cssText = `width:${width}px;height:${height}px;top:${stage.offsetTop + stage.clientTop + this.canvas.offsetTop}px;left:${stage.offsetLeft + stage.clientLeft + this.canvas.offsetLeft}px`;
    this.glass.layout(this.camera, {width, height}, this.distance, mobile());
    this.machine.rotation.set(0, 0, mobile() ? -Math.PI / 2 : 0);
    this.machine.position.y = mobile() ? 2.5 : 0; this.machine.scale.setScalar(mobile() ? .85 : .9);
    this.updateCamera();
    this.render();
  }
  poseCamera(yaw, pitch, zoom, pan) {
    const distance = this.distance / zoom;
    this.camera.position.set(pan.x - Math.sin(yaw) * Math.cos(pitch) * distance, pan.y + Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
    this.camera.lookAt(pan.x, pan.y, 0); this.camera.updateMatrixWorld();
  }
  updateCamera() { this.poseCamera(this.yaw, this.pitch, this.zoom, this.pan); }
  setQuality(mode) {
    this.quality.set(mode); const low = this.quality.lightweight;
    this.beads.geometry.dispose();
    this.beads.geometry = low ? new this.T.OctahedronGeometry(.0595) : new this.T.SphereGeometry(.0595, 6, 4);
    this.cores.count = low ? 0 : GRAPH.nodes.length;
    this.glass.setQuality(this.quality.effective); this.glass.instruments.quality(this.quality.effective);
    this.resize(); if (this.snapshot) this.applyFrame(this.run, this.snapshot);
  }
  render() {
    if (this.disposed) return;
    this.glass?.sync(this.camera); this.renderer.info.reset(); this.metrics.begin();
    this.renderer.render(this.scene, this.camera); this.metrics.end();
  }
  refreshTheme() {
    this.dark = document.documentElement.dataset.theme === "dark";
    this.scene.background = new this.T.Color(this.dark ? 0x071b2b : 0xe6f1fa);
    this.materials.shell.color.set(this.dark ? 0x123b51 : 0x46768b);
    this.materials.ceramic.color.set(this.dark ? 0x799bad : 0xd4e8f4);
    this.materials.edge.opacity = this.dark ? .19 : .13;
    if (this.snapshot) this.applyFrame(this.run, this.snapshot); else this.render();
  }
  applyFrame(run, state) {
    if (this.disposed) return;
    const began = performance.now();
    this.run = run; this.snapshot = state;
    const T = this.T, base = new T.Color(this.dark ? 0x82a9c2 : 0x245679), active = new T.Color(0x39baff);
    GRAPH.nodes.forEach((node, index) => {
      const value = state.activations[index], selected = index === this.selected;
      const dim = this.focus === "consumer" && node.layer < 4 || this.focus === "representation" && node.layer > 3;
      this.color.copy(base).lerp(active, value); if (dim) this.color.multiplyScalar(.38);
      this.beads.setColorAt(index, this.color);
      this.cores.setColorAt(index, this.color.setRGB(.012 + value * .18, .04 + value * .7, .09 + value * 1.4));
      this.dummy.position.set(...node.position); this.dummy.scale.setScalar(1 + value * .25 + (selected ? .18 : 0)); this.dummy.updateMatrix();
      this.beads.setMatrixAt(index, this.dummy.matrix);
      this.dummy.position.z += .0686; this.dummy.updateMatrix(); this.cores.setMatrixAt(index, this.dummy.matrix);
    });
    this.dummy.scale.setScalar(1);
    this.beads.instanceColor.needsUpdate = true; this.cores.instanceColor.needsUpdate = true;
    this.beads.instanceMatrix.needsUpdate = true; this.cores.instanceMatrix.needsUpdate = true;
    GRAPH.edges.forEach((edge,index)=>{
      const value=Math.min(state.activations[edge.source],state.activations[edge.target]),intensity=.15+value*.85;
      for(let offset=this.edgeOffsets[index];offset<this.edgeOffsets[index+1];offset+=3) {
        this.edgeColors[offset]=intensity*.12;this.edgeColors[offset+1]=intensity*.55;this.edgeColors[offset+2]=intensity;
      }
    });
    this.edgeGeometry.attributes.color.needsUpdate = true;
    const light = sampleModelLight(run, state.frame);
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
      const edge = GRAPH.edges[edgeIndex]; const route=this.edgePoints(edge);for(let index=1;index<route.length;index++)points.push(new this.T.Vector3(...route[index-1]),new this.T.Vector3(...route[index]));
    }
    this.probe.geometry.dispose(); this.probe.geometry = new this.T.BufferGeometry().setFromPoints(points);
    if (this.snapshot) this.applyFrame(this.run, this.snapshot); else this.render();
  }
  setFocus(part) { this.focus = part; if (this.snapshot) this.applyFrame(this.run, this.snapshot); }
  orbit(dx, dy) { this.yaw = clamp(this.yaw + dx, -1.05, 1.05); this.pitch = clamp(this.pitch + dy, -.65, .65); this.updateCamera(); this.render(); }
  zoomBy(amount) { this.zoom = clamp(this.zoom + amount, .75, 1.8); this.updateCamera(); this.render(); }
  resetView() { this.yaw = mobile() ? -.15 : -.5; this.pitch = mobile() ? .38 : .1; this.zoom = 1; this.pan={x:0,y:0}; this.depthView = null; this.resize(); }
  panBy(dx,dy) { this.pan.x=clamp(this.pan.x+dx,-2,2);this.pan.y=clamp(this.pan.y+dy,-2,2);this.updateCamera(); this.render(); }
  toggleDepthView() {
    if (this.depthView) { const {yaw, pitch} = this.depthView; this.depthView = null; this.yaw = yaw; this.pitch = pitch; this.updateCamera(); this.render(); }
    else { this.depthView = {yaw:this.yaw, pitch:this.pitch}; this.orbit(-.05, .01); }
  }
  edgePoints(edge) {
    const a=edge.sourcePosition,b=edge.targetPosition;
    if(edge.kind.startsWith("shared block"))return [a,[a[0],3.05,-.3],[b[0],3.05,-.3],b];
    if(edge.kind.startsWith("residual"))return [a,[a[0],-2.85,-.2],[b[0],-2.85,-.2],b];
    return [a,b];
  }
  bindOrbit(selectNode,scrub) {
    this.abort=new AbortController();const options={signal:this.abort.signal};
    this.gestures=new ModelGestures({
      orbit:(dx,dy)=>this.orbit(dx*.007,dy*.005),
      zoom:ratio=>{this.zoom=clamp(this.zoom*ratio,.75,1.8);this.updateCamera();this.render();},
      pan:(dx,dy)=>this.panBy(-dx*.012,dy*.012),
      scrub:dx=>scrub(dx*360/Math.max(this.canvas.clientWidth,1)),
    });
    this.canvas.addEventListener("pointerdown",event=>{
      if(event.button!==0)return;
      this.gestures.down(event.pointerId,event.clientX,event.clientY);this.canvas.setPointerCapture(event.pointerId);
    },options);
    this.canvas.addEventListener("pointermove",event=>this.gestures.move(event.pointerId,event.clientX,event.clientY),options);
    this.canvas.addEventListener("pointerup",event=>{
      const select=this.gestures.up(event.pointerId);
      if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
      if(select) {
        const rect=this.canvas.getBoundingClientRect(),pointer=new this.T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
        const ray=new this.T.Raycaster();ray.setFromCamera(pointer,this.camera);
        const hit=ray.intersectObject(this.beads)[0];if(hit?.instanceId!==undefined)selectNode(hit.instanceId);
      }
    },options);
    for(const type of ["pointercancel","lostpointercapture"])this.canvas.addEventListener(type,event=>this.gestures.up(event.pointerId,true),options);
    window.addEventListener("blur",()=>this.gestures.clear(),options);
    window.visualViewport?.addEventListener('resize', () => this.render(), options);
    // No global touch listeners or gesture prevention: OS gestures remain OS-owned.
    // Native browser zoom is retained; camera zoom has pinch/buttons/keyboard alternatives.
  }
  graphOrigin() {
    const point = new this.T.Vector3().applyMatrix4(this.machine.matrixWorld).project(this.camera);
    return [(point.x + 1) * this.glass.viewport.width * .5, (1 - point.y) * this.glass.viewport.height * .5];
  }
  diagnostics() { return { nodes: this.beads.count, edges: GRAPH.edges.length, graphOrigin: this.graphOrigin(), quality:this.quality.snapshot(), drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, pixelRatio: this.renderer.getPixelRatio(), transmissionScale: this.renderer.transmissionResolutionScale, resources: {...this.renderer.info.memory}, glass: this.glass.diagnostics(), performance: this.metrics.snapshot(), frame: this.snapshot?.frame, camera: {yaw:this.yaw,pitch:this.pitch,zoom:this.zoom,pan:{...this.pan}}, pointers:this.gestures.points.size }; }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.gestures.clear(); this.abort.abort(); this.resizeObserver.disconnect(); this.themeObserver.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    this.glass.dispose(); this.metrics.dispose();
    const geometry = new Set(), materials = new Set();
    this.scene.traverse(object => { if (object.geometry) geometry.add(object.geometry); if (object.material) materials.add(object.material); });
    geometry.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); this.renderer.dispose();
  }
}
