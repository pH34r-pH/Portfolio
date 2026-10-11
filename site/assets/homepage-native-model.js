import { createRendering } from "./model-renderer.js";
import { MachineScene } from "./model-scene.js";
import { createInferenceRun, sampleReplay } from "./model-topology.js";
import { samplePresentation } from "./model-presentation-sampling.js";
import { EnergyArchitecture } from "./energy-architecture.js";
import { BACKGROUND_PLAYBACK_RATE } from "./homepage-motion.js";

async function recordedRun() {
  const response = await fetch(new URL("./homepage-model-trace.json", import.meta.url));
  if (!response.ok) throw new Error("Activation recording unavailable");
  const metadata = await response.json();
  const tensors = await fetch(new URL("./homepage-model-trace.f32", import.meta.url));
  if (!tensors.ok) throw new Error("Activation tensors unavailable");
  const buffer = await tensors.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)), (b) => b.toString(16).padStart(2, "0")).join("");
  if (metadata.schemaVersion !== 1 || buffer.byteLength !== metadata.bytes || hash !== metadata.sha256) throw new Error("Activation recording checksum mismatch");
  const values = new Float32Array(buffer),
    run = createInferenceRun(metadata.prompt);
  run.observations = metadata.observations.map((item) => {
    const tensor = values.slice(item.offset, item.offset + item.length);
    if (tensor.length !== item.length || tensor.some((x) => !Number.isFinite(x))) throw new Error("Invalid activation observation");
    return { ...item, values: Array.from(tensor) };
  });
  return { run, metadata };
}

export async function createNativeBackground(journey, fail, {current=()=>true}={}) {
  const surface = document.createElement("div");
  surface.className = "digital-native-model";
  surface.setAttribute("data-digital-home", "");
  surface.setAttribute("data-native-background", "");
  surface.innerHTML = "<canvas data-machine-canvas></canvas>";
  journey.querySelector(".digital-model-background").append(surface);
  let rendering, scene;
  const retain=()=>{if(!current())throw new Error("Homepage background creation retired");};
  try {
    const { run, metadata } = await recordedRun();
    retain();
    rendering = await createRendering(surface,{current});
    retain();
    const instruments = { root: surface, host: surface, layer: surface, quality: () => {}, setContext: () => {} };
    scene = new MachineScene(
      rendering.T,
      surface,
      () => {},
      reason=>{if(current())fail(reason);},
      () => {},
      instruments,
      { rendering },
    );
    scene.glass.architecture = new EnergyArchitecture(rendering.T, scene.scene, journey, surface);
    scene.render(true);
    await scene.renderer.compileAsync(scene.scene, scene.camera);
    retain();
    scene.selection.visible = scene.probe.visible = false;
    return new NativePlayback(scene, surface, run, metadata, journey);
  } catch (error) {
    scene?.dispose();
    if (!scene) rendering?.renderer.dispose();
    surface.remove();
    throw error;
  }
}

class NativePlayback {
  constructor(scene, surface, run, metadata, journey) {
    this.scene = scene;
    this.journey = journey;
    this.surface = surface;
    this.run = run;
    this.metadata = metadata;
    this.elapsed = metadata.loopStartSeconds;
    this.playbackRate = BACKGROUND_PLAYBACK_RATE;
    this.frames = 0;
    this.last = null;
    this.intervals = [];
    this.active = false;
    this.scene.applyFrame(run, sampleReplay(run, 0));
    this.relayout = () => {
      if (this.disposed || this.active || document.hidden) return;
      const rect = this.surface.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight) return;
      // Re-seat page furniture while retaining the paused activation frame.
      this.scene.render();
    };
    this.journey.addEventListener("portfolio:reading", this.relayout);
  }
  sync(active) {
    this.active = active;
    if (!active) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.last = null;
    } else if (!this.raf) this.raf = requestAnimationFrame((time) => this.tick(time));
  }
  tick(time) {
    this.raf = 0;
    if (!this.active) return;
    const delta = this.last === null ? 0 : time - this.last;
    this.last = time;
    if (delta > 0) {
      this.intervals.push(delta);
      if (this.intervals.length > 180) this.intervals.shift();
    }
    // A long frame should hold the ambient motion, never skip ahead and flash.
    this.elapsed += Math.min(delta, 100) / 1000 * this.playbackRate;
    const { durationSeconds: end, loopStartSeconds: start } = this.metadata;
    if (this.elapsed >= end) this.elapsed = start + ((this.elapsed - start) % (end - start));
    const position = Math.max(0, (this.elapsed - start) / (end - start)) * this.run.observations.length;
    this.scene.applyFrame(this.run, samplePresentation(this.run, position, { loop: true, smooth: true }));
    this.frames++;
    this.raf = requestAnimationFrame((next) => this.tick(next));
  }
  snapshot() {
    const sorted = [...this.intervals].sort((a, b) => a - b);
    return {
      kind: "recorded-tensors",
      trainedStateSha256: this.metadata.trainedStateSha256,
      frames: this.frames,
      time: this.elapsed,
      playbackRate: this.playbackRate,
      loopDurationSeconds: (this.metadata.durationSeconds - this.metadata.loopStartSeconds) / this.playbackRate,
      frameIntervalMs: { samples: sorted.length, p50: sorted[Math.floor(sorted.length * 0.5)] ?? null, p95: sorted[Math.floor(sorted.length * 0.95)] ?? null },
      ...this.scene.diagnostics(),
    };
  }
  dispose() {
    if(this.disposed)return;
    this.sync(false);
    this.disposed = true;
    this.journey.removeEventListener("portfolio:reading", this.relayout);
    this.scene.dispose();
    this.surface.remove();
  }
}
