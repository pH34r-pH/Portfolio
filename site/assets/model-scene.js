import { sampleModelLight } from "./model-light.js";
import { GRAPH, TOPOLOGY, clamp, hashText } from "./model-topology.js";
const mobile = () => matchMedia("(max-width:720px)").matches;

export class MachineScene {
  constructor(T, root, selectNode, fail) {
    this.T = T; this.root = root; this.canvas = root.querySelector("[data-machine-canvas]");
    const options = { alpha: true, antialias: !mobile(), powerPreference: "low-power" };
    const context = this.canvas.getContext("webgl2", options);
    if (!context) throw new Error("WebGL2 unavailable");
    this.renderer = new T.WebGLRenderer({ canvas: this.canvas, context, ...options });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(28, 1, .1, 80);
    this.machine = new T.Group(); this.scene.add(this.machine);
    this.yaw = mobile() ? -.15 : -.5; this.pitch = mobile() ? .38 : .1; this.zoom = 1; this.selected = GRAPH.layers[3][0]; this.focus = "all";
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
    this.bindOrbit(selectNode);
    this.contextLost = event => { event.preventDefault(); fail("webgl-context-lost"); };
    this.canvas.addEventListener("webglcontextlost", this.contextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.canvas);
    this.themeObserver = new MutationObserver(() => this.refreshTheme());
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    this.refreshTheme(); this.resize();
  }
  buildGraph() {
    const T = this.T;
    this.beads = new T.InstancedMesh(new T.SphereGeometry(.085, 16, 12), this.materials.node, GRAPH.nodes.length);
    this.cores = new T.InstancedMesh(new T.SphereGeometry(.025, 10, 8), this.materials.core, GRAPH.nodes.length);
    this.beads.instanceMatrix.setUsage(T.DynamicDrawUsage); this.cores.instanceMatrix.setUsage(T.DynamicDrawUsage);
    GRAPH.nodes.forEach((node, index) => {
      this.dummy.position.set(...node.position); this.dummy.updateMatrix();
      this.beads.setMatrixAt(index, this.dummy.matrix); this.cores.setMatrixAt(index, this.dummy.matrix);
      this.beads.setColorAt(index, this.color.set(0xa5c2d8)); this.cores.setColorAt(index, this.color.set(0x062940));
    });
    this.machine.add(this.beads, this.cores);
    const positions = new Float32Array(GRAPH.edges.length * 6);
    GRAPH.edges.forEach((edge, index) => {
      positions.set(GRAPH.nodes[edge.source].position, index * 6);
      positions.set(GRAPH.nodes[edge.target].position, index * 6 + 3);
    });
    this.edgeColors = new Float32Array(positions.length);
    this.edgeGeometry = new T.BufferGeometry();
    this.edgeGeometry.setAttribute("position", new T.BufferAttribute(positions, 3));
    this.edgeGeometry.setAttribute("color", new T.BufferAttribute(this.edgeColors, 3).setUsage(T.DynamicDrawUsage));
    this.edges = new T.LineSegments(this.edgeGeometry, this.materials.edge); this.machine.add(this.edges);
    this.probe = new T.LineSegments(new T.BufferGeometry(), this.materials.probe); this.machine.add(this.probe);
    this.selection = new T.Mesh(new T.TorusGeometry(.145, .016, 6, 32), this.materials.signal);
    this.machine.add(this.selection);
    this.pulses = new T.InstancedMesh(new T.SphereGeometry(.065, 10, 8), this.materials.signal, 12);
    this.tokens = new T.InstancedMesh(new T.BoxGeometry(.21, .15, .22), this.materials.ceramic, 12);
    this.machine.add(this.pulses, this.tokens);
    this.select(this.selected);
  }
  buildHardware() {
    const T = this.T;
    this.frames = [];
    const boltGeometry = new T.CylinderGeometry(.035, .035, .11, 6);
    const bolts = new T.InstancedMesh(boltGeometry, this.materials.ceramic, 56);
    TOPOLOGY.radii.forEach((radius, layer) => {
      const x = (layer - 3) * 1.48, outer = radius + .2;
      const rim = new T.Mesh(new T.TorusGeometry(outer, .038, 8, 72), this.materials.shell);
      rim.rotation.y = Math.PI / 2; rim.position.x = x; this.machine.add(rim); this.frames.push(rim);
      const trim = new T.Mesh(new T.TorusGeometry(outer + .065, .008, 4, 72), this.materials.ceramic);
      trim.rotation.y = Math.PI / 2; trim.position.x = x - .055; this.machine.add(trim);
      for (let index = 0; index < 8; index++) {
        const angle = index * Math.PI / 4;
        this.dummy.position.set(x, Math.cos(angle) * outer, Math.sin(angle) * outer);
        this.dummy.rotation.set(0, 0, Math.PI / 2); this.dummy.updateMatrix();
        bolts.setMatrixAt(layer * 8 + index, this.dummy.matrix);
      }
    });
    this.dummy.rotation.set(0, 0, 0); this.machine.add(bolts);
    for (const side of [-1, 1]) {
      const housing = new T.Mesh(new T.BoxGeometry(.34, 1.35, 1.05), this.materials.shell);
      housing.position.set(side * 5.3, 0, 0); this.machine.add(housing);
      for (let index = 0; index < 5; index++) {
        const fin = new T.Mesh(new T.BoxGeometry(.05, 1.38, 1.08), this.materials.ceramic);
        fin.position.set(side * (5.12 + index * .09), 0, 0); this.machine.add(fin);
      }
    }
    // Sparse chassis lines sit behind the complete graph; never encode data.
    const chassis = [];
    for (const z of [-2.5, 2.5]) {
      chassis.push(new T.Vector3(-4.6, -2.55, z), new T.Vector3(4.6, -2.55, z));
    }
    this.machine.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(chassis), this.materials.probe));
  }
  addLights() {
    const T = this.T;
    this.scene.add(new T.HemisphereLight(0xd6efff, 0x041225, 1.25));
    const key = new T.DirectionalLight(0xe9f5ff, 3.4); key.position.set(-3, 5, 6); this.scene.add(key);
    const rim = new T.DirectionalLight(0x1789f5, 4.5); rim.position.set(3, -1, -5); this.scene.add(rim);
    const fill = new T.DirectionalLight(0x5ecfff, 1.8); fill.position.set(1, -4, 3); this.scene.add(fill);
    this.replayLight = new T.PointLight(0x39baff, 0, 7, 2); this.machine.add(this.replayLight);
  }
  resize() {
    if (this.disposed) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    // Physical phone caps, including S23 Ultra DPR 3+, preserve the full graph.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile() ? 1.25 : 1.65));
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height;
    const tangent = Math.tan(14 * Math.PI / 180);
    const distance = mobile() ? Math.max(6.5 / tangent, 2.9 / (tangent * this.camera.aspect))
      : Math.max(3.7 / tangent, 6.4 / (tangent * this.camera.aspect));
    this.camera.position.set(0, mobile() ? .35 : 1.7, distance / this.zoom);
    this.camera.lookAt(0, 0, 0); this.camera.updateProjectionMatrix();
    this.machine.rotation.set(this.pitch, this.yaw, mobile() ? -Math.PI / 2 : 0);
    this.render();
  }
  render() { if (!this.disposed) this.renderer.render(this.scene, this.camera); }
  refreshTheme() {
    this.dark = document.documentElement.dataset.theme === "dark";
    this.materials.shell.color.set(this.dark ? 0x123b51 : 0x46768b);
    this.materials.ceramic.color.set(this.dark ? 0x799bad : 0xd4e8f4);
    this.materials.edge.opacity = this.dark ? .19 : .13;
    if (this.snapshot) this.applyFrame(this.run, this.snapshot); else this.render();
  }
  applyFrame(run, state) {
    if (this.disposed) return;
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
      this.dummy.position.z += .098; this.dummy.updateMatrix(); this.cores.setMatrixAt(index, this.dummy.matrix);
    });
    this.dummy.scale.setScalar(1);
    this.beads.instanceColor.needsUpdate = true; this.cores.instanceColor.needsUpdate = true;
    this.beads.instanceMatrix.needsUpdate = true; this.cores.instanceMatrix.needsUpdate = true;
    GRAPH.edges.forEach((edge, index) => {
      const value = Math.min(state.activations[edge.source], state.activations[edge.target]);
      const intensity = .15 + value * .85;
      for (let end = 0; end < 2; end++) {
        const offset = index * 6 + end * 3;
        this.edgeColors[offset] = intensity * .12;
        this.edgeColors[offset + 1] = intensity * .55;
        this.edgeColors[offset + 2] = intensity;
      }
    });
    this.edgeGeometry.attributes.color.needsUpdate = true;
    const light = sampleModelLight(run, state.frame);
    this.replayLight.position.set((light.x - .5) * 8.88, 1.6, 3);
    this.replayLight.intensity = light.energy * 14;
    this.updateCarriers(run, state.frame); this.render();
  }
  updateCarriers(run, frame) {
    const T = this.T;
    this.pulses.count = run.tokens.length; this.tokens.count = run.tokens.length;
    run.tokens.forEach((token, index) => {
      const delay = index * 2;
      const progress = (frame - 54 - delay) / 29;
      const layer = clamp(Math.floor(progress), 0, 5), amount = clamp(progress - layer, 0, 1);
      const pathNode = depth => GRAPH.nodes[GRAPH.layers[depth][hashText(`${run.seed}:${index}:${depth}`) % TOPOLOGY.widths[depth]]];
      const a = pathNode(layer).position, b = pathNode(layer + 1).position;
      this.dummy.position.set(...a).lerp(new T.Vector3(...b), amount);
      this.dummy.scale.setScalar(progress >= 0 && progress < 6 ? 1 : 0); this.dummy.updateMatrix();
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
      const edge = GRAPH.edges[edgeIndex]; points.push(new this.T.Vector3(...GRAPH.nodes[edge.source].position), new this.T.Vector3(...GRAPH.nodes[edge.target].position));
    }
    this.probe.geometry.dispose(); this.probe.geometry = new this.T.BufferGeometry().setFromPoints(points);
    if (this.snapshot) this.applyFrame(this.run, this.snapshot); else this.render();
  }
  setFocus(part) { this.focus = part; if (this.snapshot) this.applyFrame(this.run, this.snapshot); }
  orbit(dx, dy) { this.yaw = clamp(this.yaw + dx, -1.05, 1.05); this.pitch = clamp(this.pitch + dy, -.65, .65); this.resize(); }
  zoomBy(amount) { this.zoom = clamp(this.zoom + amount, .75, 1.8); this.resize(); }
  resetView() { this.yaw = mobile() ? -.15 : -.5; this.pitch = mobile() ? .38 : .1; this.zoom = 1; this.resize(); }
  bindOrbit(selectNode) {
    this.abort = new AbortController(); const options = { signal: this.abort.signal };
    let drag;
    this.canvas.addEventListener("pointerdown", event => { drag = { x: event.clientX, y: event.clientY, moved: 0 }; this.canvas.setPointerCapture(event.pointerId); }, options);
    this.canvas.addEventListener("pointermove", event => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy);
      // Touch leaves vertical document scrolling intact; horizontal drag orbits.
      this.orbit(dx * .007, event.pointerType === "touch" ? 0 : dy * .005);
      drag.x = event.clientX; drag.y = event.clientY;
    }, options);
    this.canvas.addEventListener("pointerup", event => {
      if (drag && drag.moved < 8) {
        const rect = this.canvas.getBoundingClientRect(), pointer = new this.T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        const ray = new this.T.Raycaster(); ray.setFromCamera(pointer, this.camera);
        const hit = ray.intersectObject(this.beads)[0]; if (hit?.instanceId !== undefined) selectNode(hit.instanceId);
      }
      drag = null;
    }, options);
    this.canvas.addEventListener("pointercancel", () => { drag = null; }, options);
    this.canvas.addEventListener("wheel", event => { if (event.ctrlKey) { event.preventDefault(); this.zoomBy(-event.deltaY * .002); } }, { ...options, passive: false });
  }
  diagnostics() { return { nodes: this.beads.count, edges: GRAPH.edges.length, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, pixelRatio: this.renderer.getPixelRatio(), frame: this.snapshot?.frame }; }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.abort.abort(); this.resizeObserver.disconnect(); this.themeObserver.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    const geometry = new Set(), materials = new Set();
    this.scene.traverse(object => { if (object.geometry) geometry.add(object.geometry); if (object.material) materials.add(object.material); });
    geometry.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); this.renderer.dispose();
  }
}
