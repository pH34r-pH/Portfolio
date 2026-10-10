import { ModelQuality } from "./model-quality.js";

const THREE_BASE = "/assets/vendor/three@0.186.1/";

export function webGLRendering(T, canvas, fallbackReasons = []) {
  const options = { alpha: true, antialias: true, powerPreference: "high-performance" };
  const context = canvas.getContext("webgl2", options);
  if (!context) throw new Error("WebGL2 unavailable");
  const quality = new ModelQuality(context);
  return { T, context, renderer: new T.WebGLRenderer({ canvas, context, ...options }), quality, backend: "webgl2", fallbackReasons };
}

async function webGPURendering(canvas, adapter, current) {
  const requiredFeatures = ["core-features-and-limits", "timestamp-query"].filter((feature) => adapter.features.has(feature));
  const device = await adapter.requestDevice({ requiredFeatures, requiredLimits: { maxTextureDimension2D: adapter.limits.maxTextureDimension2D } });
  let renderer;
  try {
    const T = await import(`${THREE_BASE}three.webgpu.js`);
    if(!current()){device.destroy();return null;}
    renderer = new T.WebGPURenderer({ canvas, device, alpha: true, antialias: true, samples: 4, trackTimestamp: device.features.has("timestamp-query") });
    await renderer.init();
    if (!renderer.backend.isWebGPUBackend || renderer.backend.compatibilityMode) throw new Error("WebGPU core rendering with MSAA unavailable");
    return { T, renderer, context: renderer.getContext(), quality: ModelQuality.webGPU(adapter, device), backend: "webgpu", fallbackReasons: [] };
  } catch (error) {
    renderer?.dispose();
    device.destroy();
    throw error;
  }
}

export async function createRendering(root,{current=()=>true}={}) {
  let canvas = root.querySelector("[data-machine-canvas]");
  const fallbackReasons = [];
  // Immutable poster/fixture captures retain the existing reproducible WebGL path.
  const fixture =
    root.hasAttribute("data-illustration-fixture") || root.hasAttribute("data-background-recording") || (root.hasAttribute("data-digital-home") && root.hasAttribute("data-model-startup"));
  if (!fixture && navigator.gpu && isSecureContext) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if(!current())return null;
      if (!adapter) throw new Error("No usable WebGPU adapter");
      return await webGPURendering(canvas, adapter,current);
    } catch (error) {
      fallbackReasons.push(error.message);
      // A canvas cannot change context type after a failed WebGPU initialization.
      const fresh = canvas.cloneNode(false);
      canvas.replaceWith(fresh);
      canvas = fresh;
    }
  } else fallbackReasons.push(fixture ? "Reproducible WebGL fixture" : "WebGPU unavailable in this browser/context");
  const T = await import(`${THREE_BASE}three.module.js`);
  if(!current())return null;
  return webGLRendering(T, canvas, fallbackReasons);
}
