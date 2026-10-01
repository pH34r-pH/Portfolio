import { GRAPH, TOPOLOGY, LAST_FRAME, FPS, clamp, createReplay, sampleReplay, joinTokens } from "./model-topology.js";
const THREE_URL = "/assets/vendor/three@0.186.1/three.module.js";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const forcedColors = matchMedia("(forced-colors: active)");
if (!document.querySelector('link[data-machine-style]')) {
  const style = document.createElement("link"); style.rel = "stylesheet"; style.href = "/assets/model-machine.css";
  style.dataset.machineStyle = ""; document.head.append(style);
}
function element(tag, className, text) {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function populate(select, entries) {
  select.replaceChildren(...entries.map(([value, label]) => {
    const option = document.createElement("option"); option.value = value; option.textContent = label; return option;
  }));
}
function renderTokens(container, tokens) {
  container.replaceChildren(...tokens.map(token => element("span", "", token)));
}

class MachineController {
  constructor(root) {
    this.root = root; this.stage = root.querySelector("[data-machine-stage]");
    this.form = root.querySelector("[data-machine-form]"); this.input = this.form?.querySelector("input");
    this.tokenReadout = root.querySelector("[data-machine-token-readout]");
    this.output = root.querySelector("[data-machine-output]"); this.status = root.querySelector("[data-machine-status]");
    if (!this.stage || !this.input || !this.output || !this.status) return;
    this.scene = null; this.frame = 0; this.raf = 0; this.playing = false; this.visible = false;
    this.selected = GRAPH.layers[3][0]; this.runData = createReplay(this.input.value);
    this.focus = root.dataset.modelFocus || "all";
    this.buildControls(); this.bindControls(); this.observe(); this.draw();
    const api = {
      run: text => this.run(text), focus: part => this.setFocus(part || "all"),
      seek: frame => this.seek(frame), pause: () => this.pause(), play: () => this.play(),
      inspect: id => { const index = GRAPH.nodes.findIndex(node => node.id === id); if (index >= 0) this.select(index); },
      snapshot: () => ({ ...sampleReplay(this.runData, this.frame), selected: GRAPH.nodes[this.selected].id, playing: this.playing, rendering: root.dataset.render }),
      diagnostics: () => this.scene?.diagnostics() || { nodes: GRAPH.nodes.length, edges: GRAPH.edges.length, frame: this.frame, rendering: "fallback" },
    };
    root.machine = api; window.PortfolioModelMachine ??= api;
    root.addEventListener("portfolio:model-focus", event => this.setFocus(event.detail?.part || "all"));
  }
  buildControls() {
    this.root.classList.add("model-machine-replay");
    this.stage.tabIndex = 0; this.stage.setAttribute("role", "group");
    this.stage.setAttribute("aria-label", "Autoencoder teaching graph. Space plays or pauses. Arrow keys inspect replay frames. W A S D orbit. Plus and minus zoom.");
    this.stage.append(element("div", "machine-legend"));
    this.stage.querySelector(".machine-legend").innerHTML = '<div>48 / 32 / 16 / 8 / 16 / 32 / 48<span>200 nodes · 4,352 edges · 1:1</span></div><div>TEACHING TOPOLOGY<span>Autoencoder / directed dense layers</span></div>';
    const axes = element("div", "machine-axis-labels");
    for (const label of ["ENCODER", "8-UNIT BOTTLENECK", "DECODER"]) axes.append(element("span", "", label));
    axes.setAttribute("aria-hidden", "true"); this.stage.append(axes);
    const io = element("div", "machine-io"); this.stage.after(io);
    io.append(this.form, this.root.querySelector(".machine-output"));
    this.root.querySelector(".machine-console-label").textContent = "Scripted reconstruction";
    this.output.removeAttribute("aria-live");
    const replay = element("div", "machine-replay"); io.before(replay);
    replay.innerHTML = `<div class="machine-transport" role="group" aria-label="Replay controls">
      <button type="button" data-replay-rewind>Rewind</button><button type="button" data-replay-play>Play</button>
      <button type="button" data-replay-step="-1" aria-label="Previous frame">−1</button><button type="button" data-replay-step="1" aria-label="Next frame">+1</button>
      <label class="machine-timeline">Frame<input data-replay-timeline type="range" min="0" max="${LAST_FRAME}" step="1" value="0" aria-label="Replay frame"><output data-replay-frame>000 / ${LAST_FRAME}</output></label>
    </div><div class="machine-inspection"><label>Layer<select data-probe-layer aria-label="Inspect layer"></select></label>
      <label>Node<select data-probe-node aria-label="Inspect node"></select></label><p class="machine-probe" data-probe-readout></p></div>
    <div class="machine-transport" role="group" aria-label="Camera controls"><button type="button" data-camera="left" aria-label="Orbit left">Orbit ←</button><button type="button" data-camera="right" aria-label="Orbit right">Orbit →</button><button type="button" data-camera="in" aria-label="Zoom in">Zoom +</button><button type="button" data-camera="out" aria-label="Zoom out">Zoom −</button><button type="button" data-camera="reset">Reset view</button></div>`;
    replay.append(this.status);
    this.timeline = replay.querySelector("[data-replay-timeline]"); this.counter = replay.querySelector("[data-replay-frame]");
    this.playButton = replay.querySelector("[data-replay-play]"); this.layerSelect = replay.querySelector("[data-probe-layer]");
    this.nodeSelect = replay.querySelector("[data-probe-node]"); this.probe = replay.querySelector("[data-probe-readout]");
    populate(this.layerSelect, TOPOLOGY.names.map((name, index) => [index, `${name} · ${TOPOLOGY.widths[index]}`]));
    this.layerSelect.value = 3; this.populateNodes();
    this.root.append(element("p", "machine-disclosure", "Authored autoencoder teaching topology: every node and directed edge is rendered individually. Replay signals and reconstruction are deterministic illustrations, not trained activations, learned weights, or experimental measurements. Input uses simple word/punctuation splitting, limited to 12 tokens."));
    this.root.append(element("p", "machine-help", "Drag to orbit; use camera buttons to zoom. Focus the graph: Space or K plays/pauses, ←/→ steps a frame (Shift: 10), Home/End seeks, W/A/S/D orbits, +/− zooms. The layer and node selectors inspect any frame, including the static fallback."));
    this.root.dataset.topology = TOPOLOGY.id;
  }
  bindControls() {
    this.form.addEventListener("submit", event => { event.preventDefault(); this.run(this.input.value); });
    this.playButton.addEventListener("click", () => this.playing ? this.pause() : this.play());
    this.root.querySelector("[data-replay-rewind]").addEventListener("click", () => this.seek(0));
    this.root.querySelectorAll("[data-replay-step]").forEach(button => button.addEventListener("click", () => this.seek(this.frame + Number(button.dataset.replayStep))));
    this.timeline.addEventListener("input", () => this.seek(Number(this.timeline.value)));
    this.layerSelect.addEventListener("change", () => { this.populateNodes(); this.select(GRAPH.layers[Number(this.layerSelect.value)][0]); });
    this.nodeSelect.addEventListener("change", () => this.select(Number(this.nodeSelect.value)));
    this.root.querySelectorAll("[data-camera]").forEach(button => button.addEventListener("click", () => this.cameraAction(button.dataset.camera)));
    this.stage.addEventListener("keydown", event => this.keydown(event));
  }
  populateNodes() {
    const layer = Number(this.layerSelect.value);
    populate(this.nodeSelect, GRAPH.layers[layer].map(index => [index, GRAPH.nodes[index].id]));
  }
  select(index) {
    this.selected = index; const node = GRAPH.nodes[index];
    this.layerSelect.value = node.layer; this.populateNodes(); this.nodeSelect.value = index;
    this.scene?.select(index); this.draw();
  }
  setFocus(part) {
    this.focus = part; this.scene?.setFocus(part);
    const layer = { tokenizer: 0, input: 0, representation: 3, consumer: 4, output: 6 }[part];
    if (layer !== undefined) this.select(GRAPH.layers[layer][0]);
  }
  keydown(event) {
    const step = event.shiftKey ? 10 : 1, key = event.key.toLowerCase();
    const actions = { " ": () => this.playing ? this.pause() : this.play(), k: () => this.playing ? this.pause() : this.play(),
      arrowleft: () => this.seek(this.frame - step), arrowright: () => this.seek(this.frame + step),
      home: () => this.seek(0), end: () => this.seek(LAST_FRAME),
      a: () => this.cameraAction("left"), d: () => this.cameraAction("right"), w: () => this.scene?.orbit(0, -.12), s: () => this.scene?.orbit(0, .12),
      "+": () => this.cameraAction("in"), "=": () => this.cameraAction("in"), "-": () => this.cameraAction("out") };
    if (actions[key]) { event.preventDefault(); actions[key](); }
  }
  cameraAction(action) {
    if (!this.scene) return;
    if (action === "left" || action === "right") this.scene.orbit(action === "left" ? -.15 : .15, 0);
    else if (action === "reset") this.scene.resetView();
    else this.scene.zoomBy(action === "in" ? .15 : -.15);
  }
  observe() {
    this.observer = new IntersectionObserver(entries => {
      this.visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .15);
      if (this.visible) this.boot(); this.syncClock();
    }, { threshold: [.15] }); this.observer.observe(this.stage);
    document.addEventListener("visibilitychange", () => this.syncClock());
    window.addEventListener("pagehide", () => { this.pause(); this.scene?.dispose(); this.scene = null; this.bootPromise = null; });
    window.addEventListener("pageshow", event => { if (event.persisted && this.visible) this.boot(); });
    reduceMotion.addEventListener("change", () => { this.pause(); if (reduceMotion.matches) this.fallback("reduced-motion"); else { this.bootPromise = null; this.boot(); } });
    forcedColors.addEventListener("change", () => { this.pause(); if (forcedColors.matches) this.fallback("forced-colors"); else { this.bootPromise = null; this.boot(); } });
  }
  async boot() {
    if (this.scene) return this.scene;
    if (reduceMotion.matches || forcedColors.matches) { this.fallback(reduceMotion.matches ? "reduced-motion" : "forced-colors"); return null; }
    if (this.bootPromise) return this.bootPromise;
    this.root.dataset.render = "loading";
    this.bootPromise = Promise.all([import(THREE_URL), import("./model-scene.js")]).then(([T, { MachineScene }]) => {
      if (reduceMotion.matches || forcedColors.matches) { this.fallback("motion-or-colors"); return null; }
      this.scene = new MachineScene(T, this.root, index => this.select(index), reason => this.fallback(reason));
      this.root.dataset.render = "webgl"; this.root.querySelector("[data-machine-fallback]").setAttribute("aria-hidden", "true");
      this.setCameraEnabled(true); this.setFocus(this.focus); this.draw(); return this.scene;
    }).catch(error => { this.fallback("webgl-unavailable"); console.warn("Teaching model uses static fallback:", error.message); return null; });
    return this.bootPromise;
  }
  setCameraEnabled(enabled) {
    this.root.querySelectorAll("[data-camera]").forEach(button => { button.disabled = !enabled; });
  }
  fallback(reason) {
    this.scene?.dispose(); this.scene = null; this.root.dataset.render = "fallback"; this.root.dataset.fallbackReason = reason;
    this.setCameraEnabled(false); const fallback = this.root.querySelector("[data-machine-fallback]");
    fallback.setAttribute("aria-hidden", "false");
    if (!this.fallbackNodes) this.buildFallback(fallback);
    this.draw();
  }
  buildFallback(fallback) {
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    const phone = matchMedia("(max-width:720px)").matches;
    svg.setAttribute("viewBox", phone ? "0 0 550 1200" : "0 0 1200 550"); svg.setAttribute("aria-hidden", "true");
    const position = node => { const x = 600 + node.position[0] * 112, y = 275 + (node.position[1] + node.position[2] * .28) * 90; return phone ? [y, x] : [x, y]; };
    const paths = Array.from({ length: 6 }, () => "");
    GRAPH.edges.forEach(edge => { paths[edge.layer] += `M${position(GRAPH.nodes[edge.source]).join(",")}L${position(GRAPH.nodes[edge.target]).join(",")}`; });
    paths.forEach(data => { const path = document.createElementNS(ns, "path"); path.setAttribute("d", data); path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor"); path.setAttribute("stroke-width", ".6"); path.setAttribute("opacity", ".13"); svg.append(path); });
    this.fallbackNodes = GRAPH.nodes.map(node => {
      const circle = document.createElementNS(ns, "circle"), [x, y] = position(node);
      circle.setAttribute("cx", x); circle.setAttribute("cy", y); circle.setAttribute("r", 4); svg.append(circle); return circle;
    });
    fallback.replaceChildren(svg, element("p", "", "Static graph / same topology and replay frames"));
  }
  async run(text = this.input.value) {
    this.pause(); this.runData = createReplay(text); this.input.value = this.runData.text; this.frame = 0;
    renderTokens(this.tokenReadout, this.runData.tokens); this.draw(); await this.boot();
    if (!reduceMotion.matches) this.play(); else this.status.textContent = "Paused / reduced motion. Scrub or step to inspect.";
  }
  seek(frame) { this.pause(false); this.frame = clamp(Math.round(frame), 0, LAST_FRAME); this.draw(); }
  pause(update = true) { this.playing = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.lastTime = null; this.fraction = 0; if (update) this.draw(); }
  play() {
    if (this.frame === LAST_FRAME) this.frame = 0;
    this.playing = true; this.lastTime = null; this.draw(); this.syncClock();
  }
  syncClock() {
    const allowed = this.playing && this.visible && !document.hidden;
    if (!allowed && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; this.lastTime = null; }
    if (allowed && !this.raf) this.raf = requestAnimationFrame(time => this.tick(time));
  }
  tick(time) {
    this.raf = 0;
    if (!this.playing || !this.visible || document.hidden) { this.lastTime = null; return; }
    if (this.lastTime === null) this.lastTime = time;
    const delta = time - this.lastTime;
    // Mobile renders at <=30fps; each displayed state still comes from the 60fps replay table.
    const interval = matchMedia("(max-width:720px)").matches ? 1000 / 30 : 1000 / FPS;
    if (delta >= interval - .5) {
      this.fraction = (this.fraction || 0) + delta * FPS / 1000;
      const advance = Math.floor(this.fraction); this.fraction -= advance;
      this.frame = Math.min(LAST_FRAME, this.frame + advance); this.lastTime = time;
      if (this.frame === LAST_FRAME) this.playing = false;
      this.draw();
    }
    this.syncClock();
  }
  draw() {
    const state = sampleReplay(this.runData, this.frame), node = GRAPH.nodes[this.selected];
    this.root.dataset.replayFrame = this.frame; this.timeline.value = this.frame;
    this.timeline.setAttribute("aria-valuetext", `Frame ${this.frame} of ${LAST_FRAME}, ${state.stage}`);
    this.counter.textContent = `${String(this.frame).padStart(3, "0")} / ${LAST_FRAME}`;
    this.playButton.textContent = this.playing ? "Pause" : "Play";
    const status = `${this.playing ? "Playing" : "Paused"} / ${state.stage}${this.root.dataset.render === "fallback" ? " / static graph" : ""}`;
    if (this.status.textContent !== status) this.status.textContent = status;
    this.output.textContent = state.emitted.length ? joinTokens(state.emitted) : "Waiting for reconstruction stage (frame 252).";
    this.probe.replaceChildren(document.createTextNode(`${node.id} · synthetic signal ${state.activations[this.selected].toFixed(3)}`), element("span", "", `${node.incoming.length} incoming / ${node.outgoing.length} outgoing · frame ${this.frame}`));
    if (!this.tokenReadout.childElementCount) renderTokens(this.tokenReadout, this.runData.tokens);
    this.scene?.applyFrame(this.runData, state);
    this.fallbackNodes?.forEach((circle, index) => { circle.classList.toggle("is-active", state.activations[index] > .15); circle.setAttribute("r", index === this.selected ? 7 : 4); });
  }
}
document.querySelectorAll("[data-model-machine]").forEach(root => new MachineController(root));
