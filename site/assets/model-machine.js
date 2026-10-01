import { GRAPH, TOPOLOGY, LAST_FRAME, FPS, clamp, createReplay, sampleReplay, joinTokens } from "./model-topology.js";
import { ModelLightPublisher } from "./model-light.js";
import { ModelInstruments } from "./model-instruments.js";
import { HomepageInstruments } from "./homepage-instruments.js";
const THREE_URL = "/assets/vendor/three@0.186.1/three.module.js";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const forcedColors = matchMedia("(forced-colors: active)");
if (!document.querySelector('link[data-machine-style]')) {
  const style = document.createElement("link"); style.rel = "stylesheet"; style.href = "/assets/model-machine.css";
  style.dataset.machineStyle = ""; document.head.append(style);
  const glass = document.createElement('link'); glass.rel = 'stylesheet'; glass.href = '/assets/model-glass.css';
  document.head.append(glass);
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
    this.scene = null; this.frame = 0; this.raf = 0; this.playing = false; this.visible = false; this.clockTicks = 0;
    this.viewport = matchMedia("(max-width:720px)");
    this.selected = GRAPH.layers[6][0]; this.runData = createReplay(this.input.value);
    this.focus = root.dataset.modelFocus || "all"; this.light = new ModelLightPublisher(root);
    this.buildControls(); this.bindControls(); this.observe(); this.draw();
    const api = {
      run: text => this.run(text), focus: part => this.setFocus(part || "all"),
      seek: frame => this.seek(frame), pause: () => this.pause(), play: () => this.play(),
      inspect: id => { const index = GRAPH.nodes.findIndex(node => node.id === id); if (index >= 0) this.select(index); },
      snapshot: () => ({ ...sampleReplay(this.runData, this.frame), selected: GRAPH.nodes[this.selected].id, playing: this.playing, rendering: root.dataset.render }),
      light: () => window.PortfolioModelLight,
      clock: () => ({ playing: this.playing, visible: this.visible, hidden: document.hidden, scheduled: Boolean(this.raf), ticks: this.clockTicks, lastTime: this.lastTime ?? null }),
      diagnostics: () => this.scene?.diagnostics() || { nodes: GRAPH.nodes.length, edges: GRAPH.edges.length, frame: this.frame, rendering: "fallback" },
    };
    root.machine = api; window.PortfolioModelMachine ??= api;
    root.addEventListener("portfolio:model-focus", event => this.setFocus(event.detail?.part || "all"));
    root.addEventListener("portfolio:reading", event => this.scene?.reading(event.detail));
  }
  buildControls() {
    this.root.classList.add("model-machine-replay");
    const heading=this.root.querySelector(".machine-heading h2"),intro=this.root.querySelector(".machine-heading > p");
    if(heading)heading.textContent="A shared block. Three passes.";
    if(intro)intro.textContent="Inspect the source-bound unit-hypersphere architecture used in the research. Replay a scripted signal, scrub any frame, and inspect its coordinates. The animation illustrates the structure; it does not run the trained model.";
    const submit=this.form.querySelector("button[type=submit]");if(submit)submit.textContent="Replay";
    this.stage.tabIndex = 0; this.stage.setAttribute("role", "group");
    this.stage.setAttribute("aria-label", "Source-bound unit-hypersphere shared-block architecture. Space plays or pauses. Arrow keys inspect replay frames. W A S D orbit. Plus and minus zoom.");
    this.stage.append(element("div", "machine-legend"));
    this.stage.querySelector(".machine-legend").innerHTML = '<div>UNIT HYPERSPHERE / DEPTH 3<span>128 wide · 4 heads · one shared block ×3</span></div><div>SOURCE-BOUND ARCHITECTURE<span>1,664 coordinates + 4 operators<br>Dense edges bundled / illustrative signals</span></div>';
    const axes = element("div", "machine-axis-labels");
    for (const label of ["128 STATE", "SHARED BLOCK ×3", "256 BYTE HEAD"]) axes.append(element("span", "", label));
    axes.setAttribute("aria-hidden", "true"); this.stage.append(axes);
    const io = element("div", "machine-io"); this.stage.after(io);
    io.append(this.form, this.root.querySelector(".machine-output"));
    this.root.querySelector(".machine-console-label").textContent = "Scripted byte echo / first 12 bytes";
    this.output.removeAttribute("aria-live");
    const replay = element("div", "machine-replay"); io.before(replay);
    replay.innerHTML = `<div class="machine-transport" role="group" aria-label="Replay controls">
      <button type="button" data-replay-rewind>Rewind</button><button type="button" data-replay-play>Play</button>
      <label class="machine-timeline">Frame<input data-replay-timeline type="range" min="0" max="${LAST_FRAME}" step="1" value="0" aria-label="Replay frame"><output data-replay-frame>000 / ${LAST_FRAME}</output></label>
    </div><details class="machine-settings" data-machine-settings><summary><span aria-hidden="true">⚙</span> Settings</summary>
    <div class="machine-settings-content"><div class="machine-transport" role="group" aria-label="Frame steps"><button type="button" data-replay-step="-1" aria-label="Previous frame">−1 frame</button><button type="button" data-replay-step="1" aria-label="Next frame">+1 frame</button></div>
    <div class="machine-inspection"><label>Stage<select data-probe-layer aria-label="Inspect layer"></select></label>
      <label>Coordinate / operator<select data-probe-node aria-label="Inspect node"></select></label><p class="machine-probe" data-probe-readout></p></div>
    <div class="machine-transport" role="group" aria-label="Camera controls">
      <button type="button" data-camera="left" aria-label="Orbit left">Orbit ←</button><button type="button" data-camera="right" aria-label="Orbit right">Orbit →</button><button type="button" data-camera="up" aria-label="Orbit up">Orbit ↑</button><button type="button" data-camera="down" aria-label="Orbit down">Orbit ↓</button>
      <button type="button" data-camera="in" aria-label="Zoom in">Zoom +</button><button type="button" data-camera="out" aria-label="Zoom out">Zoom −</button>
      <button type="button" data-camera="pan-left" aria-label="Pan left">Pan ←</button><button type="button" data-camera="pan-right" aria-label="Pan right">Pan →</button><button type="button" data-camera="pan-up" aria-label="Pan up">Pan ↑</button><button type="button" data-camera="pan-down" aria-label="Pan down">Pan ↓</button><button type="button" data-camera="reset">Reset view</button>
    </div></div></details>`;
    replay.append(this.status);
    this.timeline = replay.querySelector("[data-replay-timeline]"); this.counter = replay.querySelector("[data-replay-frame]");
    this.playButton = replay.querySelector("[data-replay-play]"); this.layerSelect = replay.querySelector("[data-probe-layer]");
    this.nodeSelect = replay.querySelector("[data-probe-node]"); this.probe = replay.querySelector("[data-probe-readout]");
    populate(this.layerSelect, TOPOLOGY.names.map((name, index) => [index, `${name} · ${TOPOLOGY.widths[index]}`]));
    this.layerSelect.value = 6; this.populateNodes();
    const disclosure=element("p", "machine-disclosure", "TopologyTransformer · unit_hypersphere_depth3. One 128-wide phase-attention block (4 heads, 512-wide ReLU FFN) is reused three times, then a 256-byte head. Shown coordinate nodes are 1:1 for one time slice; four attention operators with folded 32-wide contexts, causal time matrices, residual/norm and sphere operations are folded. Dense links are 8×8 bundles (head output bundles: 32×8), not individual weights. ");
    const source=element("a","","Public source closure / DSL 82a96cbc");source.href=TOPOLOGY.sourceUrl;disclosure.append(source);
    const identity=element("a","","Architecture identity / aggregation map");identity.href="/assets/model-architecture.json";disclosure.append(document.createTextNode(" · "),identity);
    disclosure.append(document.createTextNode(". Replay signals and byte echo are deterministic illustrations, not trained activations, predictions or experimental measurements. No optimizer run is performed."));this.root.append(disclosure);
    this.root.append(element("p", "machine-help", "Inside the viewer: one finger orbits; two pinch-zoom and pan; three scrub replay horizontally when the browser supplies those pointers. Scroll normally outside it. Settings exposes camera, frame-step and inspection alternatives. Focus the graph: Space/K plays or pauses, ←/→ steps (Shift: 10), Home/End seeks, W/A/S/D orbits, I/J/L/U pans, +/− zooms. OS accessibility gestures remain system-owned."));
    const Instruments = this.root.hasAttribute('data-digital-home') ? HomepageInstruments : ModelInstruments;
    this.instruments = new Instruments(this.root, this.stage, io,
      () => { const settings = this.root.querySelector('[data-machine-settings]'); settings.open = true; this.layerSelect.focus(); },
      () => { this.scene?.toggleDepthView(); this.instruments.viewButton.setAttribute('aria-pressed', String(Boolean(this.scene?.depthView))); this.instruments.viewButton.textContent = this.scene?.depthView ? 'Return view' : 'View depth'; });
    this.instruments.changed = () => this.scene?.resize();
    const quality = element('label', 'machine-quality', 'Glass quality');
    const choice = element('select', ''); choice.dataset.glassQuality = '';
    choice.setAttribute('aria-label', 'Glass quality'); populate(choice, [['auto','Automatic'], ['refraction','Clear refraction'], ['lightweight','Lightweight']]);
    choice.addEventListener('change', () => this.scene?.setQuality(choice.value)); quality.append(choice);
    this.root.querySelector('.machine-settings-content').append(quality);
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
    const settings=this.root.querySelector("[data-machine-settings]");settings.addEventListener("keydown",event=>{if(event.key==="Escape"){settings.open=false;settings.querySelector("summary").focus();}});
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
    const layer = { tokenizer: 0, input: 0, representation: 6, consumer: 7, output: 7 }[part];
    if (layer !== undefined) this.select(GRAPH.layers[layer][0]);
  }
  keydown(event) {
    const step = event.shiftKey ? 10 : 1, key = event.key.toLowerCase();
    const actions = { " ": () => this.playing ? this.pause() : this.play(), k: () => this.playing ? this.pause() : this.play(),
      arrowleft: () => this.seek(this.frame - step), arrowright: () => this.seek(this.frame + step),
      home: () => this.seek(0), end: () => this.seek(LAST_FRAME),
      a: () => this.cameraAction("left"), d: () => this.cameraAction("right"), w: () => this.scene?.orbit(0, -.12), s: () => this.scene?.orbit(0, .12),
      j: () => this.scene?.panBy(-.15,0), l: () => this.scene?.panBy(.15,0), i: () => this.scene?.panBy(0,.15), u: () => this.scene?.panBy(0,-.15),
      "+": () => this.cameraAction("in"), "=": () => this.cameraAction("in"), "-": () => this.cameraAction("out") };
    if (actions[key]) { event.preventDefault(); actions[key](); }
  }
  cameraAction(action) {
    if (!this.scene) return;
    if (action === "left" || action === "right") this.scene.orbit(action === "left" ? -.15 : .15, 0);
    else if (action === "up" || action === "down") this.scene.orbit(0,action === "up" ? -.12 : .12);
    else if (action.startsWith("pan-")) { const vectors={"pan-left":[-.15,0],"pan-right":[.15,0],"pan-up":[0,.15],"pan-down":[0,-.15]};this.scene.panBy(...vectors[action]); }
    else if (action === "reset") this.scene.resetView();
    else this.scene.zoomBy(action === "in" ? .15 : -.15);
  }
  observe() {
    const visibility = new Map();
    this.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => visibility.set(entry.target, entry.isIntersecting && entry.intersectionRatio >= .15));
      this.visible = [...visibility.values()].some(Boolean);
      if (this.visible) this.boot(); this.syncClock(); this.publishLight(true);
    }, { threshold: [.15] }); this.observer.observe(this.stage);
    if (this.root.hasAttribute('data-digital-home')) this.observer.observe(this.root.querySelector('#model-chapter'));
    document.addEventListener("visibilitychange", () => { this.syncClock(); this.publishLight(true); });
    window.addEventListener("pagehide", () => { this.visible = false; this.pause(); this.scene?.dispose(); this.scene = null; this.bootPromise = null; this.publishLight(true); });
    window.addEventListener("pageshow", event => { if (event.persisted && this.visible) this.boot(); });
    reduceMotion.addEventListener("change", () => { this.pause(); if (reduceMotion.matches) this.fallback("reduced-motion"); else { this.bootPromise = null; this.boot(); } });
    this.viewport.addEventListener("change", () => { if (this.root.dataset.render === "fallback") { this.fallbackNodes = null; this.buildFallback(this.root.querySelector("[data-machine-fallback]")); this.draw(); } });
    forcedColors.addEventListener("change", () => { this.pause(); if (forcedColors.matches) this.fallback("forced-colors"); else { this.bootPromise = null; this.boot(); } });
  }
  async boot() {
    if (this.scene) return this.scene;
    if (reduceMotion.matches || forcedColors.matches) { this.fallback(reduceMotion.matches ? "reduced-motion" : "forced-colors"); return null; }
    if (this.bootPromise) return this.bootPromise;
    this.root.dataset.render = "loading";
    this.bootPromise = Promise.all([import(THREE_URL), import("./model-scene.js")]).then(([T, { MachineScene }]) => {
      if (reduceMotion.matches || forcedColors.matches) { this.fallback("motion-or-colors"); return null; }
      this.scene = new MachineScene(T, this.root, index => this.select(index), reason => this.fallback(reason), delta => this.seek(this.frame+delta), this.instruments);
      this.root.dataset.render = "webgl"; this.root.querySelector("[data-machine-fallback]").setAttribute("aria-hidden", "true");
      this.setCameraEnabled(true); this.setFocus(this.focus); this.draw(); return this.scene;
    }).catch(error => { this.fallback("webgl-unavailable"); console.warn("Architecture viewer uses static fallback:", error.message); return null; });
    return this.bootPromise;
  }
  setCameraEnabled(enabled) {
    this.root.querySelectorAll("[data-camera],[data-glass-quality]").forEach(button => { button.disabled = !enabled; });
  }
  fallback(reason) {
    this.scene?.dispose(); this.scene = null; this.root.dataset.render = "fallback"; this.root.dataset.fallbackReason = reason;
    this.instruments.setMode('flow', this.viewport.matches);
    this.instruments.quality('fallback');
    this.setCameraEnabled(false); const fallback = this.root.querySelector("[data-machine-fallback]");
    fallback.setAttribute("aria-hidden", "false");
    if (!this.fallbackNodes) this.buildFallback(fallback);
    this.draw();
  }
  buildFallback(fallback) {
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    const phone = matchMedia("(max-width:720px)").matches;
    svg.setAttribute("viewBox", phone ? "0 0 550 1200" : "0 0 1200 550"); svg.setAttribute("aria-hidden", "true");
    const position = node => { const x = 600 + node.position[0] * 112, y = 275 + (node.position[1] + node.position[2] * .28) * 80; return phone ? [y, x] : [x, y]; };
    const paths = Array.from({ length: TOPOLOGY.widths.length }, () => "");
    GRAPH.edges.forEach(edge => { paths[edge.layer] += `M${position({position:edge.sourcePosition}).join(",")}L${position({position:edge.targetPosition}).join(",")}`; });
    paths.forEach(data => { const path = document.createElementNS(ns, "path"); path.setAttribute("d", data); path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor"); path.setAttribute("stroke-width", ".6"); path.setAttribute("opacity", ".13"); svg.append(path); });
    this.fallbackNodes = GRAPH.nodes.map(node => {
      const circle = document.createElementNS(ns, "circle"), [x, y] = position(node);
      circle.setAttribute("cx", x); circle.setAttribute("cy", y); circle.setAttribute("r", 2.8); svg.append(circle); return circle;
    });
    fallback.replaceChildren(svg, element("p", "", "Static graph / same topology and replay frames"));
  }
  async run(text = this.input.value) {
    this.pause(); this.runData = createReplay(text); this.input.value = this.runData.text; this.frame = 0;
    renderTokens(this.tokenReadout, this.runData.tokens); this.draw(); this.publishLight(true); await this.boot();
    if (!reduceMotion.matches) this.play(); else this.status.textContent = "Paused / reduced motion. Scrub or step to inspect.";
  }
  seek(frame) { this.pause(false); this.frame = clamp(Math.round(frame), 0, LAST_FRAME); this.draw(); this.publishLight(true); }
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
    this.raf = 0; this.clockTicks += 1;
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
  publishLight(immediate = false) {
    this.light.publish(this.runData, this.frame, { active: this.visible && !document.hidden && Boolean(this.scene), reducedMotion: reduceMotion.matches, vertical: this.viewport.matches, immediate });
  }
  draw() {
    const state = sampleReplay(this.runData, this.frame), node = GRAPH.nodes[this.selected];
    if (this.instruments.update(node)) this.scene?.resize();
    this.root.dataset.replayFrame = this.frame; this.timeline.value = this.frame;
    this.timeline.setAttribute("aria-valuetext", `Frame ${this.frame} of ${LAST_FRAME}, ${state.stage}`);
    this.counter.textContent = `${String(this.frame).padStart(3, "0")} / ${LAST_FRAME}`;
    this.playButton.textContent = this.playing ? "Pause" : "Play";
    const status = `${this.playing ? "Playing" : "Paused"} / ${state.stage}${this.root.dataset.render === "fallback" ? " / static graph" : ""}`;
    if (this.status.textContent !== status) this.status.textContent = status;
    this.output.textContent = state.emitted.length ? joinTokens(state.emitted) : "Waiting for scripted echo (frame 252).";
    this.probe.replaceChildren(document.createTextNode(`${node.id} · ${node.label} · synthetic signal ${state.activations[this.selected].toFixed(3)}`), element("span", "", `${node.incoming.length} incoming / ${node.outgoing.length} outgoing display routes (bundled) · frame ${this.frame}`));
    if (!this.tokenReadout.childElementCount) renderTokens(this.tokenReadout, this.runData.tokens);
    this.scene?.applyFrame(this.runData, state); this.publishLight();
    this.fallbackNodes?.forEach((circle, index) => { circle.classList.toggle("is-active", state.activations[index] > .15); circle.setAttribute("r", index === this.selected ? 4.9 : 2.8); });
  }
}
document.querySelectorAll("[data-model-machine]").forEach(root => new MachineController(root));
