const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COARSE = matchMedia("(pointer: coarse)").matches;
const DEFAULT_TEXT = "A model can store a signal without using it.";

function splitTokens(text) {
  return (text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || []).slice(0, 18);
}

function hashText(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  }
  return value >>> 0;
}

function deterministicUnit(seed) {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4294967295;
}

function toyCompletion(text, count = 8) {
  const words = [
    "system", "state", "signal", "context", "maps", "through", "the", "next",
    "layer", "into", "a", "usable", "prediction", "path", "while", "structure",
    "remains", "visible",
  ];
  let seed = hashText(text || "research");
  const output = [];
  for (let i = 0; i < count; i += 1) {
    seed = hashText(String(seed));
    output.push(words[seed % words.length]);
  }
  return output;
}

function disposeMesh(mesh) {
  mesh.geometry?.dispose();
  mesh.material?.dispose();
  mesh.removeFromParent();
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
    this.pulses = [];
    this.tokenMeshes = [];
    this.outputBlocks = [];
    this.nodes = [];
    this.layers = [];
    this.tick = this.animate.bind(this);
    this.bind();
    this.bindArticleDock();
    this.observe();
  }

  bind() {
    this.runButton?.addEventListener("click", () => this.run());
    this.input?.addEventListener("keydown", event => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") this.run();
    });
    for (const button of this.stageButtons) {
      button.addEventListener("click", () => this.focus(button.dataset.machineStageButton));
    }
  }

  bindArticleDock() {
    if (!this.root.classList.contains("article-machine-dock") || REDUCED) return;
    const placeholder = document.createElement("div");
    placeholder.className = "article-machine-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    this.root.before(placeholder);
    this.dockPlaceholder = placeholder;
    const update = () => {
      const sentinelTop = placeholder.getBoundingClientRect().top;
      const articleBottom = document.querySelector(".myst-reader")?.getBoundingClientRect().bottom ?? 0;
      const dock = sentinelTop < 54 && articleBottom > 150;
      if (dock && !this.root.classList.contains("is-docked")) {
        placeholder.style.height = this.root.offsetHeight + "px";
        placeholder.dataset.active = "true";
      }
      if (!dock) {
        placeholder.dataset.active = "false";
        placeholder.style.height = "0px";
      }
      this.root.classList.toggle("is-docked", dock);
      document.body.classList.toggle("machine-docked", dock);
      if (dock) this.resize();
    };
    document.addEventListener("scroll", update, {passive: true});
    addEventListener("resize", update);
    update();
  }

  observe() {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      this.init();
    }, {rootMargin: "0px"});
    observer.observe(this.root);
  }

  async init() {
    if (this.ready || REDUCED) return;
    try {
      this.THREE = await import("/assets/vendor/three.module.min.js");
      this.createScene();
      this.createMachinery();
      this.createNetwork();
      this.resize();
      new ResizeObserver(() => this.resize()).observe(this.viewport);
      this.ready = true;
      this.root.dataset.ready = "true";
      this.status.textContent = "READY / ENTER TEXT";
      requestAnimationFrame(this.tick);
      this.run();
    } catch {
      this.status.textContent = "STATIC PATH";
    }
  }

  createScene() {
    const {Scene, PerspectiveCamera, WebGLRenderer, Color, Group} = this.THREE;
    this.scene = new Scene();
    this.scene.background = new Color(0x020b13);
    this.camera = new PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 4.7, 15.2);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.5 : 2));
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.viewport.append(this.renderer.domElement);
    this.tokenGroup = new Group();
    this.nodeGroup = new Group();
    this.machineGroup = new Group();
    this.outputGroup = new Group();
    this.scene.add(this.machineGroup, this.tokenGroup, this.nodeGroup, this.outputGroup);
  }

  createBox(options) {
    const {width, height, depth, x, y, z, color = 0x0a395c, opacity = 0.55} = options;
    const {BoxGeometry, MeshBasicMaterial, Mesh} = this.THREE;
    const mesh = new Mesh(
      new BoxGeometry(width, height, depth),
      new MeshBasicMaterial({color, transparent: true, opacity}),
    );
    mesh.position.set(x, y, z);
    this.machineGroup.add(mesh);
    return mesh;
  }

  createMachinery() {
    const {CylinderGeometry, MeshBasicMaterial, Mesh} = this.THREE;
    this.createBox({width: 1.5, height: 3.8, depth: 1.2, x: -5.55, y: 0, z: 0, color: 0x062238, opacity: 0.92});
    this.createBox({width: 1.05, height: 0.2, depth: 0.86, x: -6.45, y: 0, z: 0, color: 0x168fd7, opacity: 0.42});
    this.createBox({width: 2.25, height: 0.16, depth: 0.8, x: 5.45, y: -1.5, z: 0, color: 0x0b527f, opacity: 0.48});
    this.createBox({width: 0.62, height: 1.7, depth: 0.92, x: 4.55, y: -0.55, z: 0, color: 0x07304d, opacity: 0.92});
    this.createBox({width: 0.62, height: 1.7, depth: 0.92, x: 5.35, y: -0.55, z: 0, color: 0x07304d, opacity: 0.92});
    this.createBox({width: 0.62, height: 1.7, depth: 0.92, x: 6.15, y: -0.55, z: 0, color: 0x07304d, opacity: 0.92});

    const rollerMaterial = new MeshBasicMaterial({color: 0x1b9cff, transparent: true, opacity: 0.68});
    this.rollers = [-0.42, 0.42].map(y => {
      const roller = new Mesh(new CylinderGeometry(0.32, 0.32, 1.05, 18), rollerMaterial.clone());
      roller.rotation.z = Math.PI / 2;
      roller.position.set(-5.55, y, 0);
      this.machineGroup.add(roller);
      return roller;
    });
  }

  createNetwork() {
    const {
      SphereGeometry, MeshBasicMaterial, Mesh, Group, Vector3,
      BufferGeometry, Line, LineBasicMaterial,
    } = this.THREE;
    const layerX = [-4.25, -1.45, 1.35, 3.85];
    const counts = [4, 7, 6, 4];

    layerX.forEach((x, layerIndex) => {
      const layer = new Group();
      for (let i = 0; i < counts[layerIndex]; i += 1) {
        const y = (i - (counts[layerIndex] - 1) / 2) * 0.82;
        const node = new Mesh(
          new SphereGeometry(0.105, 16, 12),
          new MeshBasicMaterial({
            color: layerIndex === 3 ? 0x67c9ff : 0x1b9cff,
            transparent: true,
            opacity: 0.42,
          }),
        );
        node.position.set(x, y, (i % 2) * 0.55 - 0.27);
        layer.add(node);
        this.nodes.push({
          mesh: node,
          layer: layerIndex,
          base: node.position.clone(),
          target: node.position.clone(),
        });
      }
      this.nodeGroup.add(layer);
      this.layers.push(layer);
    });

    for (let layerIndex = 0; layerIndex < this.layers.length - 1; layerIndex += 1) {
      const left = this.layers[layerIndex].children;
      const right = this.layers[layerIndex + 1].children;
      left.forEach((from, fromIndex) => {
        right.forEach((to, toIndex) => {
          if ((fromIndex + toIndex) % 2) return;
          const points = [from.getWorldPosition(new Vector3()), to.getWorldPosition(new Vector3())];
          const geometry = new BufferGeometry().setFromPoints(points);
          const material = new LineBasicMaterial({color: 0x0b5d92, transparent: true, opacity: 0.13});
          this.scene.add(new Line(geometry, material));
        });
      });
    }
  }

  resize() {
    if (!this.renderer) return;
    const rect = this.viewport.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    this.camera.aspect = rect.width / Math.max(rect.height, 1);
    this.camera.updateProjectionMatrix();
  }

  clearTransientMeshes() {
    for (const item of this.tokenMeshes) disposeMesh(item.mesh);
    for (const item of this.pulses) disposeMesh(item.mesh);
    for (const item of this.outputBlocks) disposeMesh(item.mesh);
    this.tokenMeshes = [];
    this.pulses = [];
    this.outputBlocks = [];
  }

  makeTokenBlock(token, index) {
    const {BoxGeometry, MeshBasicMaterial, Mesh, Vector3} = this.THREE;
    const strength = 0.45 + deterministicUnit(hashText(token + index)) * 0.55;
    const mesh = new Mesh(
      new BoxGeometry(0.34, 0.22, 0.22),
      new MeshBasicMaterial({
        color: index % 3 === 0 ? 0x67c9ff : 0x118ff0,
        transparent: true,
        opacity: 0.55 + strength * 0.42,
      }),
    );
    mesh.position.set(-7.1 - (index % 4) * 0.12, 2.25 - (index % 7) * 0.34, (index % 3) * 0.24 - 0.24);
    mesh.scale.x = Math.min(1.9, 0.65 + token.length * 0.09);
    this.tokenGroup.add(mesh);
    return {
      mesh,
      delay: index * 0.075,
      time: 0,
      start: mesh.position.clone(),
      target: new Vector3(-5.08, (index % 4 - 1.5) * 0.7, 0),
      strength,
      index,
    };
  }

  run() {
    const text = (this.input?.value || "").trim() || DEFAULT_TEXT;
    if (this.input && !this.input.value.trim()) this.input.value = text;
    const tokens = splitTokens(text);
    this.output.textContent = "";

    if (!this.ready || REDUCED) {
      this.output.textContent = toyCompletion(text).join(" ");
      this.status.textContent = `${tokens.length} TOKENS / PATH COMPLETE`;
      return;
    }

    this.clearTransientMeshes();
    this.tokenMeshes = tokens.map((token, index) => this.makeTokenBlock(token, index));
    this.completion = toyCompletion(text);
    this.running = true;
    this.cascadeStarted = false;
    this.outputStarted = false;
    this.started = performance.now() / 1000;
    this.status.textContent = `TOKENIZED / ${tokens.length} BLOCKS`;
  }

  emitPulse(from, to, strength, delay = 0) {
    const {SphereGeometry, MeshBasicMaterial, Mesh} = this.THREE;
    const mesh = new Mesh(
      new SphereGeometry(0.055 + strength * 0.065, 12, 8),
      new MeshBasicMaterial({
        color: strength > 0.72 ? 0xc8f3ff : 0x55c7ff,
        transparent: true,
        opacity: 0.42 + strength * 0.58,
      }),
    );
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.pulses.push({
      mesh,
      from: from.clone(),
      to: to.clone(),
      time: -delay,
      speed: 1.8 + strength * 0.9,
      strength,
    });
  }

  emitOutputBlock(word, index) {
    const {BoxGeometry, MeshBasicMaterial, Mesh} = this.THREE;
    const strength = 0.55 + deterministicUnit(hashText(word + index)) * 0.45;
    const mesh = new Mesh(
      new BoxGeometry(Math.min(0.82, 0.26 + word.length * 0.055), 0.2, 0.36),
      new MeshBasicMaterial({color: 0x67c9ff, transparent: true, opacity: 0.58 + strength * 0.4}),
    );
    mesh.position.set(4.55 + (index % 3) * 0.8, -1.15, 0);
    this.outputGroup.add(mesh);
    this.outputBlocks.push({mesh, speed: 1.25 + strength * 0.55});
  }

  applyVariant(variant = "baseline") {
    this.variant = variant;
    for (const node of this.nodes) node.target.copy(node.base);
    const stateNodes = this.nodes.filter(node => node.layer === 1);
    const consumerNodes = this.nodes.filter(node => node.layer === 2);

    if (variant === "hypersphere") {
      stateNodes.forEach((node, index) => {
        const angle = (index / stateNodes.length) * Math.PI * 2;
        node.target.y = Math.sin(angle) * 1.8;
        node.target.z = Math.cos(angle) * 1.8;
      });
    }
    if (variant === "dual-consumer") {
      consumerNodes.forEach((node, index) => {
        node.target.z = index % 2 ? 0.95 : -0.95;
        node.target.y *= 0.78;
      });
    }
    if (variant === "phase") {
      stateNodes.forEach((node, index) => {
        const sign = index % 2 ? 1 : -1;
        node.target.z = sign * (0.45 + index * 0.09);
        node.target.y *= 0.82;
      });
    }
    if (variant === "quotient") {
      stateNodes.forEach((node, index) => {
        const band = Math.floor(index / 2) - 1;
        node.target.y = band * 1.05;
        node.target.z = (index % 2 ? 1 : -1) * 0.18;
      });
    }
    if (variant !== "baseline") {
      this.status.textContent = "ARCHITECTURE / " + variant.toUpperCase().replace("-", " ");
    }
  }

  focus(stage) {
    this.stage = stage;
    const map = {input: 0, state: 1, consumer: 2, output: 3};
    for (const button of this.stageButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.machineStageButton === stage));
    }
    for (const {mesh, layer} of this.nodes) {
      const active = stage === "all" || map[stage] === layer;
      mesh.material.opacity = active ? 0.88 : 0.13;
      mesh.scale.setScalar(active ? 1.18 : 0.88);
    }
    const targetX = {input: -2.6, state: -0.8, consumer: 1.2, output: 2.6}[stage] || 0;
    this.nodeGroup.position.x += (targetX - this.nodeGroup.position.x) * 0.55;
  }

  advanceInput(dt) {
    let settled = 0;
    for (const item of this.tokenMeshes) {
      item.time += dt;
      const progress = Math.max(0, Math.min(1, (item.time - item.delay) * 1.8));
      const eased = 1 - Math.pow(1 - progress, 4);
      item.mesh.position.lerpVectors(item.start, item.target, eased);
      item.mesh.rotation.z += dt * (2.1 + item.strength * 2.2);
      item.mesh.rotation.x += dt * 0.7;
      if (progress < 1) continue;
      settled += 1;
      if (item.fired) continue;
      item.fired = true;
      const from = this.layers[0].children[item.index % this.layers[0].children.length];
      const to = this.layers[1].children[item.index % this.layers[1].children.length];
      this.emitPulse(from.getWorldPosition(new this.THREE.Vector3()), to.getWorldPosition(new this.THREE.Vector3()), item.strength, item.index * 0.018);
      item.mesh.material.opacity = 0.08;
    }
    return settled;
  }

  startCascade() {
    this.cascadeStarted = true;
    this.status.textContent = "PROPAGATING / ACTIVATION";
    for (let layerIndex = 1; layerIndex < this.layers.length - 1; layerIndex += 1) {
      this.layers[layerIndex].children.forEach((node, index) => {
        const target = this.layers[layerIndex + 1].children[index % this.layers[layerIndex + 1].children.length];
        const strength = 0.35 + deterministicUnit(hashText(String(layerIndex) + ":" + String(index))) * 0.65;
        this.emitPulse(
          node.getWorldPosition(new this.THREE.Vector3()),
          target.getWorldPosition(new this.THREE.Vector3()),
          strength,
          layerIndex * 0.16 + index * 0.022,
        );
      });
    }
  }

  startOutput() {
    this.outputStarted = true;
    this.status.textContent = "READOUT / EMITTING TOKENS";
    let index = 0;
    this.outputTimer = setInterval(() => {
      if (index >= this.completion.length) {
        clearInterval(this.outputTimer);
        this.outputTimer = null;
        this.status.textContent = "PATH COMPLETE";
        this.running = false;
        return;
      }
      const word = this.completion[index];
      this.output.textContent += (index ? " " : "") + word;
      this.emitOutputBlock(word, index);
      index += 1;
    }, 95);
  }

  updatePulses(dt) {
    for (const pulse of this.pulses) {
      pulse.time += dt * pulse.speed;
      if (pulse.time < 0) continue;
      const x = Math.min(1, pulse.time);
      const eased = x * x * (3 - 2 * x);
      pulse.mesh.position.lerpVectors(pulse.from, pulse.to, eased);
      pulse.mesh.material.opacity = (0.42 + pulse.strength * 0.58) * (1 - Math.max(0, (x - 0.72) / 0.28));
    }
    this.pulses = this.pulses.filter(pulse => {
      if (pulse.time <= 1) return true;
      disposeMesh(pulse.mesh);
      return false;
    });
  }

  updateOutputBlocks(dt) {
    for (const item of this.outputBlocks) {
      item.mesh.position.x += dt * item.speed;
      item.mesh.rotation.y += dt * 0.9;
      if (item.mesh.position.x > 7.2) item.mesh.material.opacity *= 0.82;
    }
    this.outputBlocks = this.outputBlocks.filter(item => {
      if (item.mesh.position.x <= 7.8) return true;
      disposeMesh(item.mesh);
      return false;
    });
  }

  animate(timeMs) {
    if (!this.renderer) return;
    const now = timeMs / 1000;
    const dt = Math.min(0.034, now - (this.last || now));
    this.last = now;

    for (const roller of this.rollers) roller.rotation.x += dt * 5.5;

    if (this.running) {
      const settled = this.advanceInput(dt);
      if (settled === this.tokenMeshes.length && !this.cascadeStarted) this.startCascade();
      if (this.cascadeStarted && now - this.started > 2.15 && !this.outputStarted) this.startOutput();
    }

    this.updatePulses(dt);
    this.updateOutputBlocks(dt);
    for (const node of this.nodes) node.mesh.position.lerp(node.target, Math.min(1, dt * 6.5));
    const breathe = 0.74 + 0.12 * Math.sin(now * 2.4);
    if (this.stage === "all") {
      for (const {mesh} of this.nodes) {
        mesh.material.opacity = Math.max(mesh.material.opacity * 0.985, breathe * 0.42);
      }
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.tick);
  }
}

function inferredVariant(element) {
  const explicit = element.dataset.machineVariant;
  if (explicit) return explicit;
  const text = (element.textContent || "").toLowerCase();
  if (/hypersphere|normaliz|radial|tangent/.test(text)) return "hypersphere";
  if (/consumer|readout|probe|accessible|prediction layer/.test(text)) return "dual-consumer";
  if (/phase|spectral|frequency/.test(text)) return "phase";
  if (/quotient|invariance|equivalence/.test(text)) return "quotient";
  return "baseline";
}

function inferredStage(element) {
  if (element.dataset.machineStage) return element.dataset.machineStage;
  const text = (element.textContent || "").toLowerCase();
  if (/consumer|readout|probe|prediction|decoder/.test(text)) return "consumer";
  if (/output|generation|next[- ]?byte|next[- ]?token/.test(text)) return "output";
  if (/state|recurrent|hidden|memory|sphere|normaliz|representation/.test(text)) return "state";
  if (/token|input|encoding/.test(text)) return "input";
  return "all";
}

document.querySelectorAll("[data-model-machine]").forEach(root => new ModelMachine(root));

const sectionObserver = new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting);
  visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
  const active = visible[0];
  if (!active) return;
  const machine = document.querySelector("[data-model-machine]")?.machine;
  machine?.focus(inferredStage(active.target));
  machine?.applyVariant(inferredVariant(active.target));
}, {rootMargin: "-30% 0px -52% 0px", threshold: [0, 0.2, 0.5]});

document.querySelectorAll("[data-machine-stage], .myst-reader h2").forEach(element => {
  sectionObserver.observe(element);
});
