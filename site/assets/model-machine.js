const THREE_URL = "https://unpkg.com/three@0.186.1/build/three.module.js";
const [reduceMotion, smallViewport] = [matchMedia("(prefers-reduced-motion: reduce)"), matchMedia("(max-width: 720px)")];

function tokenize(text) {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?|[^\s\p{L}\p{N}]/gu)?.slice(0, 12) || [];
}

function hashText(text) {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function continuationFor(text) {
  const choices = [
    ["the", "signal", "survives", "but", "the", "consumer", "changes", "what", "gets", "used", "."],
    ["a", "small", "intervention", "moves", "the", "same", "information", "through", "a", "different", "path", "."],
    ["the", "representation", "keeps", "more", "than", "the", "prediction", "step", "can", "recover", "."],
    ["the", "next", "test", "changes", "one", "mechanism", "and", "leaves", "the", "rest", "frozen", "."],
  ];
  return choices[hashText(text) % choices.length];
}

function cssColor(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function themeColors(THREE) {
  return {
    ink: new THREE.Color(cssColor("--ink", "#f4fbff")),
    line: new THREE.Color(cssColor("--accent", "#31a8ff")),
    depth: new THREE.Color(cssColor("--depth", "#001827")),
    signal: new THREE.Color(cssColor("--signal", "#29a7ff")),
  };
}

function renderTokens(container, tokens) {
  container.replaceChildren(...tokens.map((token) => {
    const span = document.createElement("span");
    span.textContent = token;
    return span;
  }));
}

function initFallback(root, reason = "") {
  root.dataset.render = "fallback";
  root.querySelector("[data-machine-fallback]")?.setAttribute("aria-hidden", "false");
  if (reason) root.dataset.fallbackReason = reason;
}

function createRenderer(THREE, canvas) {
  const options = { alpha: true, antialias: !smallViewport.matches, powerPreference: "high-performance" };
  const context = canvas.getContext("webgl2", options) || canvas.getContext("webgl", options);
  if (!context) throw new Error("WebGL unavailable");
  const renderer = new THREE.WebGLRenderer({ canvas, context, ...options });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, smallViewport.matches ? 1.35 : 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function createMaterials(THREE, colors) {
  return {
    frame: new THREE.MeshStandardMaterial({
      color: colors.depth, metalness: .78, roughness: .24,
      emissive: colors.line, emissiveIntensity: .035,
    }),
    node: new THREE.MeshStandardMaterial({
      color: colors.ink, metalness: .64, roughness: .22,
      emissive: colors.signal, emissiveIntensity: .08,
    }),
    signal: new THREE.MeshStandardMaterial({
      color: colors.signal, metalness: .05, roughness: .14,
      emissive: colors.signal, emissiveIntensity: 2.4,
    }),
    token: new THREE.MeshStandardMaterial({
      color: colors.ink, metalness: .68, roughness: .18,
      emissive: colors.signal, emissiveIntensity: .14,
    }),
    edge: new THREE.LineBasicMaterial({ color: colors.line, transparent: true, opacity: .18 }),
  };
}

function register(parts, object, part) {
  object.userData.part = part;
  if (!parts.has(part)) parts.set(part, []);
  parts.get(part).push(object);
  return object;
}

function addInputHardware(THREE, machine, materials, parts) {
  const railGeometry = new THREE.BoxGeometry(1.8, .07, .12);
  for (const y of [.55, -.55]) {
    const rail = register(parts, new THREE.Mesh(railGeometry, materials.frame), "tokenizer");
    rail.position.set(-4.35, y, 0);
    machine.add(rail);
  }
  for (let index = 0; index < 4; index++) {
    const gate = register(parts, new THREE.Mesh(new THREE.BoxGeometry(.14, 1.12, .34), materials.frame), "tokenizer");
    gate.position.set(-4.95 + index * .4, 0, 0);
    machine.add(gate);
  }
  const chute = register(parts, new THREE.Mesh(new THREE.CylinderGeometry(.34, .62, 1.05, 6), materials.frame), "input");
  chute.rotation.z = Math.PI / 2;
  chute.position.set(-3.25, 0, 0);
  machine.add(chute);
}

function addNetworkHardware(THREE, machine, materials, parts) {
  const nodes = [];
  const layerNodes = [];
  const xPositions = [-2.15, -1.1, 0, 1.1, 2.15];
  const yPositions = [-.92, -.3, .3, .92];
  const sphere = new THREE.SphereGeometry(.105, 14, 10);
  xPositions.forEach((x, layer) => {
    const current = yPositions.map((y, row) => {
      const part = layer < 3 ? "representation" : "consumer";
      const node = register(parts, new THREE.Mesh(sphere, materials.node), part);
      node.position.set(x, y, ((layer + row) % 3 - 1) * .16);
      machine.add(node);
      nodes.push(node);
      return node;
    });
    layerNodes.push(current);
  });
  addNetworkEdges(THREE, machine, materials, parts, layerNodes);
  return nodes;
}

function addNetworkEdges(THREE, machine, materials, parts, layers) {
  for (let layer = 0; layer < layers.length - 1; layer++) {
    for (let row = 0; row < layers[layer].length; row++) {
      for (const offset of [0, 1]) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          layers[layer][row].position,
          layers[layer + 1][(row + offset) % layers[layer].length].position,
        ]);
        const part = layer < 2 ? "representation" : "consumer";
        machine.add(register(parts, new THREE.Line(geometry, materials.edge), part));
      }
    }
  }
}

function addOutputHardware(THREE, machine, materials, parts) {
  const frame = register(parts, new THREE.Mesh(new THREE.BoxGeometry(.8, 1.7, .24), materials.frame), "consumer");
  frame.position.set(2.75, 0, -.12);
  machine.add(frame);
  for (let index = 0; index < 3; index++) {
    const dropper = register(parts, new THREE.Mesh(new THREE.CylinderGeometry(.13, .2, .55, 8), materials.frame), "output");
    dropper.rotation.z = Math.PI / 2;
    dropper.position.set(3.42, .42 - index * .42, 0);
    machine.add(dropper);
  }
  const conveyor = register(parts, new THREE.Mesh(new THREE.BoxGeometry(2.1, .12, .58), materials.frame), "output");
  conveyor.position.set(4.35, -.78, 0);
  machine.add(conveyor);
  for (let index = 0; index < 5; index++) {
    const roller = register(parts, new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .58, 12), materials.frame), "output");
    roller.rotation.x = Math.PI / 2;
    roller.position.set(3.55 + index * .42, -.7, 0);
    machine.add(roller);
  }
}

function ease(t) {
  return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

class MachineScene {
  constructor(THREE, root) {
    this.THREE = THREE;
    this.root = root;
    this.canvas = root.querySelector("[data-machine-canvas]");
    this.renderer = createRenderer(THREE, this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 40);
    this.camera.position.set(0, .15, smallViewport.matches ? 11.8 : 10.6);
    this.machine = new THREE.Group();
    this.scene.add(this.machine);
    this.parts = new Map();
    this.colors = themeColors(THREE); this.materials = createMaterials(THREE, this.colors);
    this.nodes = this.buildHardware();
    this.effectGroup = new THREE.Group();
    this.machine.add(this.effectGroup);
    this.addLights();
    this.activeRun = null; this.frame = 0; this.visible = true;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.themeObserver = new MutationObserver(() => this.refreshTheme());
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    this.resize();
  }

  buildHardware() {
    addInputHardware(this.THREE, this.machine, this.materials, this.parts);
    const nodes = addNetworkHardware(this.THREE, this.machine, this.materials, this.parts);
    addOutputHardware(this.THREE, this.machine, this.materials, this.parts);
    return nodes;
  }

  addLights() {
    this.scene.add(new this.THREE.AmbientLight(0xffffff, 1.65));
    this.key = new this.THREE.PointLight(0x55bbff, 7.5, 22, 2);
    this.key.position.set(-2.5, 3.8, 5);
    this.scene.add(this.key);
    this.rim = new this.THREE.PointLight(0x1489ff, 5, 18, 2);
    this.rim.position.set(4, -3, 3);
    this.scene.add(this.rim);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.fov = smallViewport.matches ? 44 : 38;
    this.camera.updateProjectionMatrix();
    this.machine.rotation.z = smallViewport.matches ? -Math.PI / 2 : 0;
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  clearEffects() {
    while (this.effectGroup.children.length) {
      const child = this.effectGroup.children.pop();
      child.geometry?.dispose?.();
    }
  }

  makeBlock() {
    const block = new this.THREE.Mesh(new this.THREE.BoxGeometry(.34, .18, .22), this.materials.token);
    this.effectGroup.add(block);
    return block;
  }

  makePulse() {
    const pulse = new this.THREE.Mesh(new this.THREE.SphereGeometry(.09, 12, 8), this.materials.signal);
    this.effectGroup.add(pulse);
    return pulse;
  }

  routeFor(index, count) {
    const lane = count <= 1 ? 0 : (index / (count - 1) - .5) * 1.5;
    const V = this.THREE.Vector3;
    return new this.THREE.CatmullRomCurve3([
      new V(-3.05, 0, 0), new V(-2.05, lane * .8, .08), new V(-1.05, -lane * .45, -.08),
      new V(.05, lane * .3, .16), new V(1.1, -lane * .6, -.06), new V(2.65, lane * .28, 0),
      new V(3.12, 0, 0),
    ]);
  }

  createInput(tokens, now) {
    return tokens.map((token, index) => {
      const block = this.makeBlock();
      const pulse = this.makePulse();
      block.position.set(-5.25, (index - (tokens.length - 1) / 2) * .22, 0);
      pulse.visible = false;
      return { token, block, pulse, route: this.routeFor(index, tokens.length), start: now + index * 115 };
    });
  }

  createOutputs(tokens, now) {
    return tokens.map((token, index) => {
      const block = this.makeBlock();
      block.visible = false;
      block.position.set(3.26, -.78, 0);
      return { token, block, start: now + 1750 + index * 145, emitted: false };
    });
  }

  animateRun(tokens, generated, callbacks) {
    this.clearEffects();
    this.resetNodes();
    const now = performance.now();
    this.activeRun = {
      now,
      input: this.createInput(tokens, now),
      outputs: this.createOutputs(generated, now),
      stage: "",
      completed: false,
      ...callbacks,
    };
    if (this.visible && !this.frame) this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  updateInputItem(item, time) {
    const p = Math.max(0, Math.min(1, (time - item.start) / 1500));
    if (p < .22) {
      item.block.visible = p >= 0;
      item.pulse.visible = false;
      const t = ease(p / .22);
      item.block.position.x = this.THREE.MathUtils.lerp(-5.25, -3.08, t);
      item.block.position.y *= .965;
      item.block.rotation.z = t * 1.8;
      return { done: false, x: null };
    }
    item.block.visible = false;
    if (p < .84) {
      item.pulse.visible = true;
      const point = item.route.getPoint(ease((p - .22) / .62));
      item.pulse.position.copy(point);
      return { done: false, x: point.x };
    }
    item.pulse.visible = false;
    return { done: p >= 1, x: null };
  }

  updateInput(time) {
    let allDone = true;
    let activityX = null;
    for (const item of this.activeRun.input) {
      const state = this.updateInputItem(item, time);
      allDone = allDone && state.done;
      if (state.x !== null) activityX = state.x;
    }
    if (activityX === null) this.resetNodes();
    else this.setNodeActivity(activityX);
    return allDone;
  }

  updateOutputItem(item, time) {
    const p = Math.max(0, Math.min(1, (time - item.start) / 520));
    if (p > 0) {
      item.block.visible = true;
      const t = ease(p);
      item.block.position.x = this.THREE.MathUtils.lerp(3.26, 5.32, t);
      item.block.position.y = -.78 + Math.sin(t * Math.PI) * .22;
      item.block.rotation.z = t * .5;
    }
    if (p >= .92 && !item.emitted) {
      item.emitted = true;
      this.activeRun.onEmit(item.token);
    }
    if (p >= 1) item.block.visible = false;
    return p >= 1;
  }

  updateOutputs(time) {
    let allDone = true;
    for (const item of this.activeRun.outputs) allDone = this.updateOutputItem(item, time) && allDone;
    return allDone;
  }

  updateStage(time) {
    const elapsed = time - this.activeRun.now;
    const next = elapsed < 620 ? "tokenizing" : elapsed < 1750 ? "activating" : "decoding";
    if (next === this.activeRun.stage) return;
    this.activeRun.stage = next;
    this.activeRun.onStage(next);
  }

  tick(time) {
    this.frame = 0;
    if (!this.activeRun || !this.visible) return;
    const inputDone = this.updateInput(time);
    this.updateStage(time);
    const outputDone = this.updateOutputs(time);
    this.render();
    const timedOut = time - this.activeRun.now > 5200;
    if (inputDone && outputDone || timedOut) {
      this.finishRun();
      return;
    }
    this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  finishRun() {
    if (!this.activeRun.completed) this.activeRun.onComplete();
    this.activeRun = null;
    this.resetNodes();
    this.render();
  }

  setNodeActivity(x) {
    for (const node of this.nodes) {
      const amount = Math.max(0, 1 - Math.abs(node.position.x - x) / .72);
      node.material.emissiveIntensity = .08 + amount * 2.4;
      node.scale.setScalar(1 + amount * .28);
    }
  }

  resetNodes() {
    for (const node of this.nodes) {
      node.material.emissiveIntensity = .08;
      node.scale.setScalar(1);
    }
  }

  setFocus(part = "all") {
    for (const [name, objects] of this.parts) {
      const selected = part === "all" || name === part;
      for (const object of objects) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material || !("opacity" in material)) continue;
          material.transparent = !selected;
          material.opacity = selected ? 1 : .16;
        }
      }
    }
    this.render();
  }

  refreshTheme() {
    this.colors = themeColors(this.THREE);
    this.materials.frame.color.copy(this.colors.depth);
    this.materials.frame.emissive.copy(this.colors.line);
    this.materials.node.color.copy(this.colors.ink);
    this.materials.node.emissive.copy(this.colors.signal);
    this.materials.signal.color.copy(this.colors.signal);
    this.materials.signal.emissive.copy(this.colors.signal);
    this.materials.token.color.copy(this.colors.ink);
    this.materials.token.emissive.copy(this.colors.signal);
    this.materials.edge.color.copy(this.colors.line);
    this.key.color.copy(this.colors.signal);
    this.rim.color.copy(this.colors.line);
    this.render();
  }

  setVisible(next) {
    this.visible = next;
    if (next && this.activeRun && !this.frame) this.frame = requestAnimationFrame((time) => this.tick(time));
    if (!next && this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  dispose() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.themeObserver.disconnect();
    this.clearEffects();
    this.renderer.dispose();
  }
}

function machineStatusLabel(name) {
  if (name === "tokenizing") return "tokenizing input";
  if (name === "activating") return "activation moving through model";
  return "decoding output";
}

class MachineController {
  constructor(root) {
    this.root = root;
    this.stage = root.querySelector("[data-machine-stage]");
    this.form = root.querySelector("[data-machine-form]");
    this.input = this.form?.querySelector("input");
    this.tokenReadout = root.querySelector("[data-machine-token-readout]");
    this.output = root.querySelector("[data-machine-output]");
    this.status = root.querySelector("[data-machine-status]");
    this.scene = null;
    this.bootPromise = null;
    this.visible = false;
    if (!this.stage || !this.form || !this.input || !this.tokenReadout || !this.output || !this.status) return;
    this.form.addEventListener("submit", (event) => this.submit(event));
    this.observe();
    renderTokens(this.tokenReadout, tokenize(this.input.value));
    root.addEventListener("portfolio:model-focus", (event) => this.scene?.setFocus(event.detail?.part || "all"));
    this.publicApi = { run: (text) => this.run(text), focus: (part) => this.scene?.setFocus(part || "all") };
    root.machine = this.publicApi;
    window.PortfolioModelMachine ??= this.publicApi;
  }

  observe() {
    this.observer = new IntersectionObserver((entries) => {
      this.visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= .15);
      this.scene?.setVisible(this.visible && !document.hidden);
      if (this.visible) this.boot();
    }, { threshold: [.15] });
    this.observer.observe(this.stage);
    document.addEventListener("visibilitychange", () => {
      this.scene?.setVisible(this.visible && !document.hidden);
    });
  }

  async boot() {
    if (this.scene) return this.scene;
    if (this.bootPromise) return this.bootPromise;
    if (reduceMotion.matches) {
      initFallback(this.root, "reduced-motion");
      this.setStatus("machine ready / reduced motion");
      return null;
    }
    this.root.dataset.render = "loading";
    this.setStatus("initializing model space");
    this.bootPromise = import(THREE_URL).then((THREE) => this.finishBoot(THREE)).catch((error) => this.failBoot(error));
    return this.bootPromise;
  }

  finishBoot(THREE) {
    this.scene = new MachineScene(THREE, this.root);
    this.scene.setVisible(this.visible && !document.hidden);
    this.scene.setFocus(this.root.dataset.modelFocus || "all");
    this.root.dataset.render = "webgl";
    this.root.querySelector("[data-machine-fallback]")?.setAttribute("aria-hidden", "true");
    this.setStatus("machine ready");
    return this.scene;
  }

  failBoot(error) {
    initFallback(this.root, "webgl-load");
    this.setStatus("machine ready / static view");
    console.warn("Portfolio model machine fell back to static rendering.", error);
    return null;
  }

  submit(event) {
    event.preventDefault();
    this.run(this.input.value);
  }

  setStatus(text) {
    this.status.textContent = text;
  }

  immediateRun(text) {
    this.output.textContent = continuationFor(text).join(" ").replace(/\s+([.,!?;:])/g, "$1");
    this.setStatus("complete");
  }

  async run(text = this.input.value) {
    const cleaned = text.trim() || "the model learned a useful distinction";
    this.input.value = cleaned;
    const tokens = tokenize(cleaned);
    renderTokens(this.tokenReadout, tokens);
    this.output.textContent = "";
    this.setStatus("tokenizing input");
    const current = await this.boot();
    if (!current || reduceMotion.matches) return this.immediateRun(cleaned);
    const emitted = [];
    current.animateRun(tokens, continuationFor(cleaned), {
      onEmit: (token) => {
        emitted.push(token);
        this.output.textContent = emitted.join(" ").replace(/\s+([.,!?;:])/g, "$1");
      },
      onStage: (name) => this.setStatus(machineStatusLabel(name)),
      onComplete: () => this.setStatus("complete"),
    });
  }
}

document.querySelectorAll("[data-model-machine]").forEach((root) => new MachineController(root));
