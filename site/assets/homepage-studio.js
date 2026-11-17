// Use independent windows of visible frames. A failed promotion backs off so a
// device near the boundary doesn't repeatedly compile the expensive shaders.
export class FrameBudget {
  constructor() {
    this.samples = [];
    this.enhanced = false;
    this.retryDelay = 0;
    this.wait = 0;
  }

  observe(delta) {
    if (this.wait > 0) {
      this.wait -= delta;
      return false;
    }
    this.samples.push(delta);
    if (this.samples.length < 120) return false;
    const sorted = this.samples.sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * .9)];
    this.samples.length = 0;
    if (this.enhanced ? p90 <= 24 : p90 > 18) return false;
    this.enhanced = !this.enhanced;
    if (!this.enhanced) this.retryDelay = Math.min(120000, Math.max(15000, this.retryDelay * 2));
    this.wait = this.enhanced ? 1000 : this.retryDelay;
    return true;
  }
}

function brushedFinish(T) {
  // Long, fine machining marks with a repeatable grain and filtered mip chain.
  const width = 256, height = 256, bytes = new Uint8Array(width * height * 4);
  let seed = 3917;
  function noise() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let y = 0; y < height; y++) {
    const grain = 112 + 110 * noise();
    for (let x = 0; x < width; x++) {
      const value = Math.round(grain + 30 * noise());
      bytes.set([value, value, value, 255], 4 * (y * width + x));
    }
  }
  const map = new T.DataTexture(bytes, width, height, T.RGBAFormat);
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.generateMipmaps = true;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.magFilter = T.LinearFilter;
  map.needsUpdate = true;
  return map;
}

function studioRim(scene) {
  const light = new scene.T.DirectionalLight(0xffd4a3, 1.7);
  light.position.set(-10, 8, -9);
  light.castShadow = true;
  const shadow = light.shadow;
  const size = Math.min(2048, scene.quality.limits.maxTargetDimension);
  shadow.mapSize.set(size, size);
  Object.assign(shadow.camera, {left: -9, right: 9, top: 7, bottom: -7, near: .5, far: 38});
  shadow.camera.updateProjectionMatrix();
  shadow.normalBias = .018;
  // Only the fixed housing casts shadows. The recorded signal can move every
  // frame without rendering any of its 1,668 nodes into a shadow map.
  shadow.autoUpdate = false;
  shadow.needsUpdate = true;
  return light;
}

export class StudioFinish {
  constructor(scene) {
    this.scene = scene;
    this.budget = new FrameBudget();
  }

  observe(delta) {
    if (this.budget.observe(delta)) this.apply(this.budget.enhanced);
  }

  apply(enabled) {
    const {T, materials, glass} = this.scene;
    this.scene.root.dataset.finish = enabled ? "studio" : "native";
    const steel = glass.architecture.materials.steel;
    if (enabled) this.grain ??= brushedFinish(T);
    // The recorded node colors, replay lighting and camera remain data-driven.
    for (const metal of [materials.shell, materials.brass, steel]) {
      metal.roughnessMap = enabled ? this.grain : null;
      metal.needsUpdate = true;
    }
    steel.anisotropy = enabled ? .72 : 0;
    steel.anisotropyRotation = Math.PI / 2;
    materials.glazing.dispersion = enabled ? .12 : 0;
    materials.node.dispersion = enabled ? .22 : 0;
    materials.glazing.clearcoat = enabled ? .85 : 0;
    materials.glazing.clearcoatRoughness = enabled ? .045 : 0;
    this.scene.renderer.shadowMap.enabled = enabled;
    this.scene.housing.group.traverse(object => {
      if (!object.isMesh || object.material === materials.glazing) return;
      object.castShadow = object.receiveShadow = enabled;
    });
    if (enabled) {
      this.rim ??= studioRim(this.scene);
      this.scene.scene.add(this.rim);
    } else {
      this.rim?.removeFromParent();
      this.rim?.dispose();
      this.rim = null;
    }
  }

  dispose() {
    this.rim?.removeFromParent();
    this.rim?.dispose();
    this.grain?.dispose();
  }
}
