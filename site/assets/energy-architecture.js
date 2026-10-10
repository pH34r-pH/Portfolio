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
    this.geometry = { tube: new T.CylinderGeometry(1, 1, 1, 32), joint: new T.SphereGeometry(1, 24, 16) };
    this.materials = {
      filament: new T.MeshBasicMaterial({ color: 0xbcf4ff, toneMapped: false }),
      core: new T.MeshBasicMaterial({ color: 0x128ceb, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }),
      halo: new T.MeshBasicMaterial({ color: 0x008fff, transparent: true, opacity: 0.28, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
      mist: new T.MeshBasicMaterial({ color: 0x0080ff, transparent: true, opacity: 0.1, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
      aura: new T.MeshBasicMaterial({ color: 0x0065ff, transparent: true, opacity: 0.025, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
    };
    this.batch = {
      filament: this.instances(this.geometry.tube, this.materials.filament, 12),
      core: this.instances(this.geometry.tube, this.materials.core, 12),
      halo: this.instances(this.geometry.tube, this.materials.halo, 12),
      mist: this.instances(this.geometry.tube, this.materials.mist, 12),
      aura: this.instances(this.geometry.tube, this.materials.aura, 12),
      joint: this.instances(this.geometry.joint, this.materials.filament, 12),
    };
    this.sections = Array.from({ length: 2 }, () => this.screenFurniture());
    this.spine = this.screenFurniture();
  }
  instances(geometry, material, count) {
    const mesh = new this.T.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(this.T.DynamicDrawUsage);
    this.group.add(mesh);
    for (let index = 0; index < count; index++) this.hideInstance(mesh, index);
    return mesh;
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
    for (const index of section.joints) this.hideInstance(this.batch.joint, index);
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
  placeJoint(index, x, y, scale = 1) {
    const point = this.world(x, y);
    for (const [name, size, depth] of [
      ["joint", [2, 2, 2], -7],
    ]) {
      this.dummy.position.copy(point).addScaledVector(this.forward, depth * this.unit);
      this.dummy.quaternion.copy(this.camera.quaternion);
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
      this.placeJoint(section.joints[index], ...point);
    });
  }
  sync(camera) {
    this.camera = camera;
    this.bounds = this.surface.getBoundingClientRect();
    if (!this.bounds.width || !this.bounds.height) return;
    this.distance = 12;
    this.forward = camera.getWorldDirection(new this.T.Vector3());
    this.unit = (2 * this.distance * Math.tan((camera.fov * Math.PI) / 360)) / this.bounds.height;
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
        this.placeJoint(this.spine.joints[index], ...point, 0.72);
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
      energy: this.energy,
      screenCapacity: 2,
      drawBatches: 6,
    };
  }
  dispose() {
    this.disposed = true;
    this.scene.remove(this.group);
    Object.values(this.geometry).forEach((item) => item.dispose());
    Object.values(this.materials).forEach((item) => item.dispose());
  }
}
