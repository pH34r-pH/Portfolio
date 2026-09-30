const THREE_URL = "https://unpkg.com/three@0.186.1/build/three.module.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const smallViewport = matchMedia("(max-width: 720px)");

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
  const continuations = [
    ["the", "signal", "survives", "but", "the", "consumer", "changes", "what", "gets", "used", "."],
    ["a", "small", "intervention", "moves", "the", "same", "information", "through", "a", "different", "path", "."],
    ["the", "representation", "keeps", "more", "than", "the", "prediction", "step", "can", "recover", "."],
    ["the", "next", "test", "changes", "one", "mechanism", "and", "leaves", "the", "rest", "frozen", "."],
  ];
  return continuations[hashText(text) % continuations.length];
}

function cssColor(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
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
  const fallback = root.querySelector("[data-machine-fallback]");
  fallback?.setAttribute("aria-hidden", "false");
  if (reason) root.dataset.fallbackReason = reason;
}

function createScene(THREE, root) {
  const canvas = root.querySelector("[data-machine-canvas]");
  const context = canvas.getContext("webgl2", {
    alpha: true,
    antialias: !smallViewport.matches,
    powerPreference: "high-performance",
  }) || canvas.getContext("webgl", {
    alpha: true,
    antialias: !smallViewport.matches,
    powerPreference: "high-performance",
  });
  if (!context) throw new Error("WebGL unavailable");

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context,
    alpha: true,
    antialias: !smallViewport.matches,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, smallViewport.matches ? 1.35 : 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 40);
  camera.position.set(0, .15, smallViewport.matches ? 11.8 : 10.6);

  const machine = new THREE.Group();
  scene.add(machine);
  if (smallViewport.matches) machine.rotation.z = -Math.PI / 2;

  const ambient = new THREE.AmbientLight(0xffffff, 1.65);
  scene.add(ambient);
  const key = new THREE.PointLight(0x55bbff, 7.5, 22, 2);
  key.position.set(-2.5, 3.8, 5);
  scene.add(key);
  const rim = new THREE.PointLight(0x1489ff, 5, 18, 2);
  rim.position.set(4, -3, 3);
  scene.add(rim);

  const parts = new Map();
  const trackedMaterials = new Set();
  const nodes = [];
  const effectGroup = new THREE.Group();
  machine.add(effectGroup);

  function register(object, part) {
    object.userData.part = part;
    if (!parts.has(part)) parts.set(part, []);
    parts.get(part).push(object);
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => trackedMaterials.add(material));
    }
    return object;
  }

  function palette() {
    return {
      ink: new THREE.Color(cssColor("--ink", "#f4fbff")),
      muted: new THREE.Color(cssColor("--muted", "#9abbd1")),
      line: new THREE.Color(cssColor("--accent", "#31a8ff")),
      depth: new THREE.Color(cssColor("--depth", "#001827")),
      signal: new THREE.Color(cssColor("--signal", "#29a7ff")),
      bg: new THREE.Color(cssColor("--bg", "#00070d")),
    };
  }

  let colors = palette();
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: colors.depth,
    metalness: .78,
    roughness: .24,
    emissive: colors.line,
    emissiveIntensity: .035,
  });
  const nodeMaterial = new THREE.MeshStandardMaterial({
    color: colors.ink,
    metalness: .64,
    roughness: .22,
    emissive: colors.signal,
    emissiveIntensity: .08,
  });
  const signalMaterial = new THREE.MeshStandardMaterial({
    color: colors.signal,
    metalness: .05,
    roughness: .14,
    emissive: colors.signal,
    emissiveIntensity: 2.4,
  });
  const tokenMaterial = new THREE.MeshStandardMaterial({
    color: colors.ink,
    metalness: .68,
    roughness: .18,
    emissive: colors.signal,
    emissiveIntensity: .14,
  });
  [frameMaterial, nodeMaterial, signalMaterial, tokenMaterial].forEach((material) => trackedMaterials.add(material));

  const railGeometry = new THREE.BoxGeometry(1.8, .07, .12);
  const railTop = register(new THREE.Mesh(railGeometry, frameMaterial), "tokenizer");
  railTop.position.set(-4.35, .55, 0);
  machine.add(railTop);
  const railBottom = register(new THREE.Mesh(railGeometry, frameMaterial), "tokenizer");
  railBottom.position.set(-4.35, -.55, 0);
  machine.add(railBottom);

  for (let index = 0; index < 4; index++) {
    const gate = register(
      new THREE.Mesh(new THREE.BoxGeometry(.14, 1.12, .34), frameMaterial),
      "tokenizer",
    );
    gate.position.set(-4.95 + index * .4, 0, 0);
    machine.add(gate);
  }

  const chute = register(
    new THREE.Mesh(new THREE.CylinderGeometry(.34, .62, 1.05, 6, 1, false), frameMaterial),
    "input",
  );
  chute.rotation.z = Math.PI / 2;
  chute.position.set(-3.25, 0, 0);
  machine.add(chute);

  const layerX = [-2.15, -1.1, 0, 1.1, 2.15];
  const layerYs = [-.92, -.3, .3, .92];
  const sphere = new THREE.SphereGeometry(.105, 14, 10);

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: colors.line,
    transparent: true,
    opacity: .18,
  });
  trackedMaterials.add(edgeMaterial);

  const layerNodes = [];
  layerX.forEach((x, layer) => {
    const current = [];
    layerYs.forEach((y, row) => {
      const z = ((layer + row) % 3 - 1) * .16;
      const node = register(new THREE.Mesh(sphere, nodeMaterial), layer < 3 ? "representation" : "consumer");
      node.position.set(x, y, z);
      node.userData.baseEmissive = .08;
      machine.add(node);
      nodes.push(node);
      current.push(node);
    });
    layerNodes.push(current);
  });

  for (let layer = 0; layer < layerNodes.length - 1; layer++) {
    for (let row = 0; row < layerNodes[layer].length; row++) {
      for (const offset of [0, 1]) {
        const a = layerNodes[layer][row].position;
        const b = layerNodes[layer + 1][(row + offset) % layerYs.length].position;
        const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
        const line = register(new THREE.Line(geometry, edgeMaterial), layer < 2 ? "representation" : "consumer");
        machine.add(line);
      }
    }
  }

  const readoutFrame = register(
    new THREE.Mesh(new THREE.BoxGeometry(.8, 1.7, .24), frameMaterial),
    "consumer",
  );
  readoutFrame.position.set(2.75, 0, -.12);
  machine.add(readoutFrame);

  for (let index = 0; index < 3; index++) {
    const dropper = register(
      new THREE.Mesh(new THREE.CylinderGeometry(.13, .2, .55, 8), frameMaterial),
      "output",
    );
    dropper.rotation.z = Math.PI / 2;
    dropper.position.set(3.42, .42 - index * .42, 0);
    machine.add(dropper);
  }

  const conveyor = register(
    new THREE.Mesh(new THREE.BoxGeometry(2.1, .12, .58), frameMaterial),
    "output",
  );
  conveyor.position.set(4.35, -.78, 0);
  machine.add(conveyor);

  for (let index = 0; index < 5; index++) {
    const roller = register(
      new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .58, 12), frameMaterial),
      "output",
    );
    roller.rotation.x = Math.PI / 2;
    roller.position.set(3.55 + index * .42, -.7, 0);
    machine.add(roller);
  }

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.fov = smallViewport.matches ? 44 : 38;
    camera.updateProjectionMatrix();
    machine.rotation.z = smallViewport.matches ? -Math.PI / 2 : 0;
    render();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  let activeRun = null;
  let frame = 0;
  let visible = true;
  let focus = "all";

  function render() {
    renderer.render(scene, camera);
  }

  function clearEffects() {
    while (effectGroup.children.length) {
      const child = effectGroup.children.pop();
      child.geometry?.dispose?.();
      if (child.material && !trackedMaterials.has(child.material)) child.material.dispose?.();
    }
  }

  function makeBlock() {
    const block = new THREE.Mesh(new THREE.BoxGeometry(.34, .18, .22), tokenMaterial);
    effectGroup.add(block);
    return block;
  }

  function makePulse() {
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), signalMaterial);
    effectGroup.add(pulse);
    return pulse;
  }

  function routeFor(index, count) {
    const lane = count <= 1 ? 0 : (index / (count - 1) - .5) * 1.5;
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.05, 0, 0),
      new THREE.Vector3(-2.05, lane * .8, .08),
      new THREE.Vector3(-1.05, -lane * .45, -.08),
      new THREE.Vector3(.05, lane * .3, .16),
      new THREE.Vector3(1.1, -lane * .6, -.06),
      new THREE.Vector3(2.65, lane * .28, 0),
      new THREE.Vector3(3.12, 0, 0),
    ]);
  }

  function ease(t) {
    return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function setNodeActivity(x, strength = 1) {
    for (const node of nodes) {
      const distance = Math.abs(node.position.x - x);
      const amount = Math.max(0, 1 - distance / .72) * strength;
      node.material.emissiveIntensity = .08 + amount * 2.4;
      const scale = 1 + amount * .28;
      node.scale.setScalar(scale);
    }
  }

  function resetNodes() {
    for (const node of nodes) {
      node.material.emissiveIntensity = .08;
      node.scale.setScalar(1);
    }
  }

  function setFocus(part = "all") {
    focus = part;
    for (const [name, objects] of parts) {
      const selected = part === "all" || name === part;
      for (const object of objects) {
        if (!object.material) continue;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if ("opacity" in material) {
            material.transparent = !selected;
            material.opacity = selected ? 1 : .16;
          }
        }
      }
    }
    render();
  }

  function refreshTheme() {
    colors = palette();
    frameMaterial.color.copy(colors.depth);
    frameMaterial.emissive.copy(colors.line);
    nodeMaterial.color.copy(colors.ink);
    nodeMaterial.emissive.copy(colors.signal);
    signalMaterial.color.copy(colors.signal);
    signalMaterial.emissive.copy(colors.signal);
    tokenMaterial.color.copy(colors.ink);
    tokenMaterial.emissive.copy(colors.signal);
    edgeMaterial.color.copy(colors.line);
    key.color.copy(colors.signal);
    rim.color.copy(colors.line);
    render();
  }

  function animateRun(tokens, generated, onEmit, onStage, onComplete) {
    clearEffects();
    resetNodes();

    const now = performance.now();
    const input = tokens.map((token, index) => ({
      token,
      index,
      block: makeBlock(),
      pulse: makePulse(),
      route: routeFor(index, tokens.length),
      start: now + index * 115,
    }));
    input.forEach(({ block, pulse, index }) => {
      block.position.set(-5.25, (index - (input.length - 1) / 2) * .22, 0);
      pulse.visible = false;
    });

    const outputs = generated.map((token, index) => ({
      token,
      index,
      block: makeBlock(),
      start: now + 1750 + index * 145,
      emitted: false,
    }));
    outputs.forEach(({ block }) => {
      block.visible = false;
      block.position.set(3.26, -.78, 0);
    });

    activeRun = {
      now,
      input,
      outputs,
      onEmit,
      onStage,
      onComplete,
      completed: false,
      stage: "",
    };

    if (visible && !frame) frame = requestAnimationFrame(tick);
  }

  function tick(time) {
    frame = 0;
    if (!activeRun || !visible) return;

    let allInputDone = true;
    let activityX = null;
    let activityStrength = 0;

    for (const item of activeRun.input) {
      const elapsed = time - item.start;
      const p = Math.max(0, Math.min(1, elapsed / 1500));
      if (p < 1) allInputDone = false;

      if (p < .22) {
        item.block.visible = p >= 0;
        item.pulse.visible = false;
        const t = ease(p / .22);
        item.block.position.x = THREE.MathUtils.lerp(-5.25, -3.08, t);
        item.block.position.y *= .965;
        item.block.rotation.z = t * 1.8;
      } else if (p < .84) {
        item.block.visible = false;
        item.pulse.visible = true;
        const t = ease((p - .22) / .62);
        const point = item.route.getPoint(t);
        item.pulse.position.copy(point);
        activityX = point.x;
        activityStrength = 1;
      } else {
        item.block.visible = false;
        item.pulse.visible = false;
      }
    }

    if (activityX !== null) setNodeActivity(activityX, activityStrength);
    else resetNodes();

    const elapsedTotal = time - activeRun.now;
    const nextStage = elapsedTotal < 620 ? "tokenizing" : elapsedTotal < 1750 ? "activating" : "decoding";
    if (nextStage !== activeRun.stage) {
      activeRun.stage = nextStage;
      activeRun.onStage(nextStage);
    }

    let allOutputsDone = true;
    for (const item of activeRun.outputs) {
      const p = Math.max(0, Math.min(1, (time - item.start) / 520));
      if (p < 1) allOutputsDone = false;
      if (p > 0) {
        item.block.visible = true;
        const t = ease(p);
        item.block.position.x = THREE.MathUtils.lerp(3.26, 5.32, t);
        item.block.position.y = -.78 + Math.sin(t * Math.PI) * .22;
        item.block.rotation.z = t * .5;
      }
      if (p >= .92 && !item.emitted) {
        item.emitted = true;
        activeRun.onEmit(item.token);
      }
      if (p >= 1) item.block.visible = false;
    }

    render();

    if ((allInputDone && allOutputsDone) || elapsedTotal > 5200) {
      if (!activeRun.completed) {
        activeRun.completed = true;
        activeRun.onComplete();
      }
      activeRun = null;
      resetNodes();
      render();
      return;
    }

    frame = requestAnimationFrame(tick);
  }

  function setVisible(next) {
    visible = next;
    if (visible && activeRun && !frame) frame = requestAnimationFrame(tick);
    if (!visible && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  const themeObserver = new MutationObserver(refreshTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  resize();
  render();

  return {
    animateRun,
    setFocus,
    setVisible,
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
      clearEffects();
      renderer.dispose();
    },
  };
}

function initMachine(root) {
  const stage = root.querySelector("[data-machine-stage]");
  const form = root.querySelector("[data-machine-form]");
  const input = form?.querySelector("input");
  const tokenReadout = root.querySelector("[data-machine-token-readout]");
  const output = root.querySelector("[data-machine-output]");
  const status = root.querySelector("[data-machine-status]");
  if (!stage || !form || !input || !tokenReadout || !output || !status) return;

  let scene = null;
  let bootPromise = null;
  let visible = false;

  const setStatus = (text) => { status.textContent = text; };

  async function boot() {
    if (scene) return scene;
    if (bootPromise) return bootPromise;
    if (reduceMotion.matches) {
      initFallback(root, "reduced-motion");
      setStatus("machine ready / reduced motion");
      return null;
    }

    root.dataset.render = "loading";
    setStatus("initializing model space");

    bootPromise = import(THREE_URL)
      .then((THREE) => {
        scene = createScene(THREE, root);
        scene.setVisible(visible && !document.hidden);
        root.dataset.render = "webgl";
        root.querySelector("[data-machine-fallback]")?.setAttribute("aria-hidden", "true");
        setStatus("machine ready");
        return scene;
      })
      .catch((error) => {
        initFallback(root, "webgl-load");
        setStatus("machine ready / static view");
        console.warn("Portfolio model machine fell back to static rendering.", error);
        return null;
      });

    return bootPromise;
  }

  function immediateRun(text) {
    const generated = continuationFor(text);
    output.textContent = generated.join(" ").replace(/\s+([.,!?;:])/g, "$1");
    setStatus("complete");
  }

  async function run(text = input.value) {
    const cleaned = text.trim() || "the model learned a useful distinction";
    input.value = cleaned;
    const tokens = tokenize(cleaned);
    renderTokens(tokenReadout, tokens);
    output.textContent = "";
    setStatus("tokenizing input");

    const current = await boot();
    if (!current || reduceMotion.matches) {
      immediateRun(cleaned);
      return;
    }

    const generated = continuationFor(cleaned);
    let emitted = [];

    current.animateRun(
      tokens,
      generated,
      (token) => {
        emitted.push(token);
        output.textContent = emitted.join(" ").replace(/\s+([.,!?;:])/g, "$1");
      },
      (name) => {
        setStatus(name === "tokenizing" ? "tokenizing input" : name === "activating" ? "activation moving through model" : "decoding output");
      },
      () => setStatus("complete"),
    );
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run();
  });

  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= .15);
    scene?.setVisible(visible && !document.hidden);
    if (visible) boot();
  }, { threshold: [.15] });
  observer.observe(stage);

  document.addEventListener("visibilitychange", () => {
    scene?.setVisible(visible && !document.hidden);
  });

  renderTokens(tokenReadout, tokenize(input.value));

  root.addEventListener("portfolio:model-focus", (event) => {
    scene?.setFocus(event.detail?.part || "all");
  });

  root.machine = {
    run,
    focus(part) { scene?.setFocus(part || "all"); },
  };

  if (!window.PortfolioModelMachine) window.PortfolioModelMachine = root.machine;
}

document.querySelectorAll("[data-model-machine]").forEach(initMachine);
