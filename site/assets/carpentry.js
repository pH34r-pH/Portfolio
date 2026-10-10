import { CarpentryRenderer } from "./carpentry-renderer.js";
import { CarpentrySurface } from "./carpentry-surface.js";

const controls =
  ".menu-toggle,.search-toggle,.appearance button,.actions a,.article-execution button,.synthetic-projection-control button,.article-model-toolbar button,.article-model-toolbar summary,.article-model-startup button,.machine-generation-settings button,[data-lm-stop],.machine-input button,.machine-instrument-nav button,.machine-depth-view,.digital-motion-control";
const frames = ".digital-pane,.card,.notebook-content,.article-model-machine[data-model-reader-layout=true] .machine-glass-panel";
const quiet = matchMedia("(prefers-reduced-motion:reduce)"),
  forced = matchMedia("(forced-colors:active)");
const surfaces = new Map();
let renderer,
  raf = 0,
  last = 0,
  scanNeeded = true,
  failed = false,
  failureReason = null;
const identity = (text) => {
  let result = 2166136261;
  for (const char of text) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return (result >>> 0) / 4294967296;
};
function wake() {
  if (!raf && !document.hidden && renderer && !failed) raf = requestAnimationFrame(draw);
}

function scan() {
  scanNeeded = false;
  [...document.querySelectorAll(controls), ...document.querySelectorAll(frames)].forEach((node, index) => {
    if (surfaces.has(node)) {
      surfaces.get(node).mount();
      return;
    }
    const seed = identity(`${node.id}:${node.getAttribute("aria-label") || node.textContent.trim().slice(0, 80)}:${index}`);
    const surface = new CarpentrySurface(node, node.matches(frames), seed);
    surface.wake = wake;
    surfaces.set(node, surface);
  });
  for (const [node, surface] of surfaces)
    if (!node.isConnected) {
      surface.dispose();
      surfaces.delete(node);
    }
}

function draw(time) {
  raf = 0;
  if (failed || forced.matches) return;
  if (scanNeeded) scan();
  const seconds = Math.min(0.035, last ? (time - last) / 1000 : 1 / 60);
  last = time;
  let moving = false;
  try {
    for (const surface of surfaces.values()) {
      if (!surface.dirty) continue;
      const active = surface.step(seconds, quiet.matches);
      if (surface.layout()) renderer.render(surface);
      surface.dirty = active;
      moving ||= active;
    }
  } catch (error) {
    disable(error);
    return;
  }
  if (moving) wake();
}

function disable(error) {
  failureReason = error?.message || failureReason;
  failed = true;
  cancelAnimationFrame(raf);
  raf = 0;
  for (const surface of surfaces.values()) surface.dispose();
  surfaces.clear();
  renderer?.dispose();
  delete document.body.dataset.carpentryReady;
}
function invalidate() {
  for (const surface of surfaces.values()) surface.dirty = true;
  wake();
}

function target(event) {
  const node = event.target.closest?.("[data-carpentry-control],[data-carpentry-frame]");
  return surfaces.get(node);
}
function point(event) {
  if (quiet.matches || forced.matches) return;
  const surface = target(event);
  if (!surface || surface.frame) return;
  const rect = surface.node.getBoundingClientRect();
  surface.light = { x: (event.clientX - rect.left) / rect.width - 0.5, y: (event.clientY - rect.top) / rect.height - 0.5 };
  surface.hover = true;
  surface.dirty = true;
  wake();
}
function press(event, value) {
  const surface = target(event);
  if (!surface || surface.frame || surface.node.disabled) return;
  surface.target = value;
  surface.dirty = true;
  wake();
}
document.addEventListener("pointermove", point, { passive: true });
document.addEventListener("pointerdown", (event) => press(event, 1), { passive: true });
function release() {
  for (const surface of surfaces.values())
    if (surface.target) {
      surface.target = 0;
      surface.dirty = true;
    }
  wake();
}
for (const type of ["pointerup", "pointercancel", "blur"]) addEventListener(type, release, { passive: true });
document.addEventListener(
  "pointerout",
  (event) => {
    const surface = target(event);
    if (surface && !surface.node.contains(event.relatedTarget)) {
      surface.hover = false;
      surface.dirty = true;
      wake();
    }
  },
  { passive: true },
);
document.addEventListener("keydown", (event) => {
  if ([" ", "Enter"].includes(event.key)) press(event, 1);
});
document.addEventListener("keyup", release);
for (const type of ["resize", "scroll", "pageshow"]) addEventListener(type, invalidate, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) invalidate();
  else {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }
});
quiet.addEventListener("change", invalidate);
forced.addEventListener("change", invalidate);
const observer = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === "attributes" && record.target.getAttribute(record.attributeName) === record.oldValue) continue;
    if (record.type === "childList") scanNeeded = true;
    const surface = surfaces.get(record.target);
    if (surface) surface.dirty = true;
    if (record.target === document.documentElement) invalidate();
  }
  wake();
});
observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeOldValue: true,
  attributeFilter: ["aria-pressed", "aria-expanded", "disabled", "hidden", "open", "data-theme"],
});

async function prepare() {
  if (forced.matches) return;
  const image = new Image();
  image.src = new URL("./materials/wood-atlas.webp", import.meta.url).href;
  await image.decode();
  renderer = new CarpentryRenderer(image);
  document.body.dataset.carpentryReady = "";
  wake();
}
prepare().catch(disable);
forced.addEventListener("change", () => {
  if (!renderer && !forced.matches && !failed) prepare().catch(disable);
});
addEventListener("pagehide", (event) => {
  cancelAnimationFrame(raf);
  raf = 0;
  last = 0;
  if (!event.persisted) {
    observer.disconnect();
    disable();
  }
});
window.PortfolioCarpentry = Object.freeze({
  snapshot: () => ({
    kind: "ray-marched-carpentry-solids",
    backend: renderer ? "webgl2" : null,
    failed,
    failureReason,
    renders: renderer?.frames || 0,
    adapter: renderer?.adapter,
    renderMs: renderer?.timings,
    surfaces: [...surfaces.values()].map((surface) => ({
      frame: surface.frame,
      seed: surface.seed,
      press: surface.press,
      rect: surface.rect,
      visible: surface.visible,
      label: surface.frame ? null : surface.node.textContent.trim(),
    })),
  }),
});
