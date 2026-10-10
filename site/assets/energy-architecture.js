// Physical page furniture shares the model camera. Supports are decorative;
// the graph and its recorded tensors remain independently inspectable.
export class EnergyArchitecture {
  constructor(T, scene, journey, surface) {
    Object.assign(this, { T, scene, journey, surface });
    this.group = new T.Group();
    scene.add(this.group);
    this.energy = 0;
    this.lastLayout = "";
    this.dummy = new T.Object3D();
    this.up = new T.Vector3(0, 1, 0);
    this.beamCount = 0;
    this.jointCount = 0;
    this.geometry = { tube: new T.CylinderGeometry(1, 1, 1, 32), cap: new T.BoxGeometry(1, 1, 1), wood: this.roundedWood(), joint: new T.SphereGeometry(1, 24, 16) };
    this.materials = {
      filament: new T.MeshBasicMaterial({ color: 0xbcf4ff, toneMapped: false }),
      core: new T.MeshBasicMaterial({ color: 0x128ceb, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }),
      halo: new T.MeshBasicMaterial({ color: 0x008fff, transparent: true, opacity: 0.28, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
      mist: new T.MeshBasicMaterial({ color: 0x0080ff, transparent: true, opacity: 0.1, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
      aura: new T.MeshBasicMaterial({ color: 0x0065ff, transparent: true, opacity: 0.025, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
      wood: new T.MeshPhysicalMaterial({ color: 0xe0c299, roughness: 0.32, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.22 }),
      socket: new T.MeshStandardMaterial({ color: 0x53311c, roughness: 0.45, metalness: 0 }),
    };
    this.batch = {
      filament: this.instances(this.geometry.tube, this.materials.filament, 12),
      core: this.instances(this.geometry.tube, this.materials.core, 12),
      halo: this.instances(this.geometry.tube, this.materials.halo, 12),
      mist: this.instances(this.geometry.tube, this.materials.mist, 12),
      aura: this.instances(this.geometry.tube, this.materials.aura, 12),
      wood: this.instances(this.geometry.wood, this.materials.wood, 12),
      socket: this.instances(this.geometry.cap, this.materials.socket, 12),
      joint: this.instances(this.geometry.joint, this.materials.filament, 12),
    };
    this.sections = Array.from({ length: 2 }, () => this.screenFurniture());
    this.spine = this.screenFurniture();
    this.texturePromise = this.loadWood().catch(() => {
      this.textureStatus = "solid-fallback";
    });
  }
  instances(geometry, material, count) {
    if (geometry === this.geometry.wood) return this.woodPieces(geometry, material, count);
    const mesh = new this.T.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(this.T.DynamicDrawUsage);
    this.group.add(mesh);
    for (let index = 0; index < count; index++) this.hideInstance(mesh, index);
    return mesh;
  }
  woodPieces(geometry, material, count) {
    this.woodGeometry = [];
    const pieces = Array.from({ length: count }, (_, index) => {
      const cut = geometry.clone(),
        uv = cut.getAttribute("uv");
      const x = ((index * 0.61803398875) % 1) * 0.76,
        y = ((index * 0.41421356237) % 1) * 0.74;
      for (let vertex = 0; vertex < uv.count; vertex++) uv.setXY(vertex, x + uv.getX(vertex) * 0.19, y + uv.getY(vertex) * 0.19);
      const mesh = new this.T.Mesh(cut, material);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.woodGeometry.push(cut);
      return mesh;
    });
    const batch = {
      instanceMatrix: { needsUpdate: false },
      setMatrixAt: (index, matrix) => {
        const mesh = pieces[index];
        mesh.matrix.copy(matrix);
        mesh.matrixWorldNeedsUpdate = true;
        mesh.visible = matrix.elements[12] < 1e5;
      },
    };
    for (let index = 0; index < count; index++) this.hideInstance(batch, index);
    return batch;
  }
  roundedWood() {
    const shape = new this.T.Shape();
    const points = [
      [-0.55, 0.55],
      [1.25, 0.55],
      [1.25, 0.05],
      [0.05, 0.05],
      [0.05, -1.25],
      [-0.55, -1.25],
    ];
    points.forEach(([x, y], index) => {
      const [px, py] = points[(index + points.length - 1) % points.length],
        [nx, ny] = points[(index + 1) % points.length];
      const incoming = Math.hypot(px - x, py - y),
        outgoing = Math.hypot(nx - x, ny - y),
        r = 0.14;
      const a = [x + ((px - x) * r) / incoming, y + ((py - y) * r) / incoming],
        b = [x + ((nx - x) * r) / outgoing, y + ((ny - y) * r) / outgoing];
      if (index === 0) shape.moveTo(...a);
      else shape.lineTo(...a);
      shape.quadraticCurveTo(x, y, ...b);
    });
    shape.closePath();
    const geometry = new this.T.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.1, bevelSegments: 4, steps: 1, curveSegments: 10 });
    geometry.translate(0, 0, -0.4);
    const uv = geometry.getAttribute("uv");
    for (let index = 0; index < uv.count; index++) uv.setXY(index, (uv.getX(index) + 0.55) / 1.8, (uv.getY(index) + 1.25) / 1.8);
    return geometry;
  }
  async loadWood() {
    const texture = await new this.T.TextureLoader().loadAsync(new URL("./materials/wood-atlas.webp", import.meta.url).href);
    if (this.disposed) {
      texture.dispose();
      return;
    }
    texture.colorSpace = this.T.SRGBColorSpace;
    texture.offset.y = 1 / 3;
    texture.repeat.y = 1 / 3;
    texture.anisotropy = 8;
    this.materials.wood.map = texture;
    const relief = texture.clone();
    relief.colorSpace = this.T.NoColorSpace;
    this.materials.wood.bumpMap = relief;
    this.materials.wood.roughnessMap = relief;
    this.materials.wood.roughness = 0.62;
    this.materials.wood.clearcoat = 0.18;
    this.relief = relief;
    this.materials.wood.color.set(0xffffff);
    this.materials.wood.needsUpdate = true;
    this.texture = texture;
    this.textureStatus = "hemlock";
  }
  screenFurniture() {
    return { beams: Array.from({ length: 4 }, () => this.beamCount++), joints: Array.from({ length: 4 }, () => this.jointCount++) };
  }
  hideInstance(mesh, index) {
    this.dummy.position.set(1e6, 1e6, 1e6);
    this.dummy.quaternion.identity();
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }
  hide(section) {
    for (const index of section.beams) for (const name of ["filament", "core", "halo", "mist", "aura"]) this.hideInstance(this.batch[name], index);
    for (const index of section.joints) for (const name of ["wood", "socket", "joint"]) this.hideInstance(this.batch[name], index);
  }
  world(x, y) {
    const point = new this.T.Vector3((x / this.bounds.width) * 2 - 1, 1 - (y / this.bounds.height) * 2, 0).unproject(this.camera);
    const ray = point.sub(this.camera.position).normalize();
    return this.camera.position.clone().addScaledVector(ray, this.distance / ray.dot(this.forward));
  }
  placeBeam(index, a, b, radius = 2.4) {
    const start = this.world(...a),
      end = this.world(...b),
      direction = end.clone().sub(start),
      length = direction.length();
    this.dummy.position.copy(start).add(end).multiplyScalar(0.5);
    this.dummy.quaternion.setFromUnitVectors(this.up, direction.normalize());
    for (const [name, multiplier] of [
      ["filament", 0.25],
      ["core", 1],
      ["halo", 2.6],
      ["mist", 5],
      ["aura", 9],
    ]) {
      this.dummy.scale.set(radius * this.unit * multiplier, length, radius * this.unit * multiplier);
      this.dummy.updateMatrix();
      this.batch[name].setMatrixAt(index, this.dummy.matrix);
    }
  }
  placeJoint(index, x, y, corner, scale = 1) {
    const point = this.world(x, y);
    for (const [name, size, depth] of [
      ["wood", [22, 22, 12], 0],
      ["socket", [9, 9, 13], -1],
      ["joint", [2, 2, 2], -7],
    ]) {
      this.dummy.position.copy(point).addScaledVector(this.forward, depth * this.unit);
      this.dummy.quaternion.copy(this.camera.quaternion);
      this.dummy.rotateZ((-corner * Math.PI) / 2);
      if (name === "wood") {
        this.dummy.rotateY(0.16);
        this.dummy.rotateX(-0.08);
      }
      this.dummy.scale.set(...size.map((value) => value * this.unit * scale));
      this.dummy.updateMatrix();
      this.batch[name].setMatrixAt(index, this.dummy.matrix);
    }
  }
  layoutScreen(section, rect) {
    const x = rect.left - this.bounds.left,
      y = rect.top - this.bounds.top,
      pad = this.bounds.width < 720 ? 7 : 17;
    const points = [
      [x - pad, y - pad],
      [x + rect.width + pad, y - pad],
      [x + rect.width + pad, y + rect.height + pad],
      [x - pad, y + rect.height + pad],
    ];
    points.forEach((point, index) => {
      this.placeBeam(section.beams[index], point, points[(index + 1) % 4]);
      this.placeJoint(section.joints[index], ...point, index);
    });
  }
  sync(camera) {
    this.camera = camera;
    this.bounds = this.surface.getBoundingClientRect();
    if (!this.bounds.width || !this.bounds.height) return;
    this.distance = 12;
    this.forward = camera.getWorldDirection(new this.T.Vector3());
    this.unit = (2 * this.distance * Math.tan((camera.fov * Math.PI) / 360)) / this.bounds.height;
    this.materials.wood.bumpScale = 0.18 * this.unit;
    const panes = [...this.journey.querySelectorAll("[data-digital-pane]")]
      .map((pane) => pane.getBoundingClientRect())
      .filter((rect) => rect.bottom > this.bounds.top && rect.top < this.bounds.bottom)
      .slice(0, 2);
    const key = JSON.stringify([
      this.bounds.width,
      this.bounds.height,
      camera.fov,
      ...camera.position.toArray(),
      ...camera.quaternion.toArray(),
      ...panes.map((rect) => [rect.left, rect.top, rect.width, rect.height]),
    ]);
    if (key === this.lastLayout) return;
    this.lastLayout = key;
    this.sections.forEach((section, index) => (panes[index] ? this.layoutScreen(section, panes[index]) : this.hide(section)));
    const w = this.bounds.width,
      h = this.bounds.height,
      inset = w < 720 ? 12 : 42;
    const corners = [
      [inset, 22],
      [w - inset, 22],
      [w - inset, h - 28],
      [inset, h - 28],
    ];
    if (w < 720) this.hide(this.spine);
    else
      corners.forEach((point, index) => {
        this.placeBeam(this.spine.beams[index], point, corners[(index + 1) % 4], 1.8);
        this.placeJoint(this.spine.joints[index], ...point, index, 0.72);
      });
    Object.values(this.batch).forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
    });
  }
  pulse(value) {
    this.energy = value;
    this.materials.halo.opacity = 0.22 + value * 0.12;
    this.materials.mist.opacity = 0.08 + value * 0.05;
  }
  diagnostics() {
    return {
      kind: "decorative-screen-support",
      wood: this.textureStatus || "loading",
      energy: this.energy,
      screenCapacity: 2,
      drawBatches: 19,
      uniqueWoodCuts: 12,
      grainRelief: true,
    };
  }
  dispose() {
    this.disposed = true;
    this.scene.remove(this.group);
    this.texture?.dispose();
    this.relief?.dispose();
    this.woodGeometry?.forEach((geometry) => geometry.dispose());
    Object.values(this.geometry).forEach((item) => item.dispose());
    Object.values(this.materials).forEach((item) => item.dispose());
  }
}
