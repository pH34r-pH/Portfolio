import {beamGlowTexture, energyMaterials} from './energy-optics.js';

// Physical page furniture shares the model camera and reflection environment.
// Its slow breath is decorative; recorded graph values remain independent.
export class EnergyArchitecture {
  constructor(T, scene, journey, surface) {
    Object.assign(this, {T, scene, journey, surface});
    this.group = new T.Group(); scene.add(this.group);
    this.energy = 0; this.lastLayout = ''; this.beamCount = this.jointCount = 0;
    this.dummy = new T.Object3D(); this.up = new T.Vector3(0, 1, 0);
    this.texture = beamGlowTexture(T); this.materials = energyMaterials(T, this.texture);
    this.geometry = {tube: new T.CylinderGeometry(1, 1, 1, 64), glow: new T.PlaneGeometry(1, 1),
      elbow: new T.TorusGeometry(18, 3.5, 32, 64, Math.PI / 2),
      collar: new T.CylinderGeometry(4.2, 4.2, 5, 48)};
    this.batch = {
      filament: this.instances(this.geometry.tube, this.materials.filament, 12),
      core: this.instances(this.geometry.tube, this.materials.core, 12),
      glow: this.instances(this.geometry.glow, this.materials.glow, 12),
      aura: this.instances(this.geometry.glow, this.materials.aura, 12),
      elbow: this.instances(this.geometry.elbow, this.materials.steel, 12),
      collar: this.instances(this.geometry.collar, this.materials.collar, 24),
    };
    this.batch.glow.renderOrder = 8; this.batch.aura.renderOrder = 7;
    this.sections = Array.from({length: 2}, () => this.screenFurniture());
    this.spine = this.screenFurniture();
  }
  instances(geometry, material, count) {
    const mesh = new this.T.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(this.T.DynamicDrawUsage);
    this.group.add(mesh);
    for (let index = 0; index < count; index++) this.hideInstance(mesh, index);
    return mesh;
  }
  screenFurniture() {
    return {beams: Array.from({length: 4}, () => this.beamCount++), joints: Array.from({length: 4}, () => this.jointCount++)};
  }
  hideInstance(mesh, index) {
    this.dummy.position.set(1e6, 1e6, 1e6); this.dummy.quaternion.identity(); this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix(); mesh.setMatrixAt(index, this.dummy.matrix);
  }
  hide(section) {
    for (const index of section.beams) for (const name of ['filament', 'core', 'glow', 'aura']) this.hideInstance(this.batch[name], index);
    for (const index of section.joints) {
      this.hideInstance(this.batch.elbow, index);
      this.hideInstance(this.batch.collar, index * 2); this.hideInstance(this.batch.collar, index * 2 + 1);
    }
  }
  world(x, y) {
    const point = new this.T.Vector3((x / this.bounds.width) * 2 - 1, 1 - (y / this.bounds.height) * 2, 0).unproject(this.camera);
    const ray = point.sub(this.camera.position).normalize();
    return this.camera.position.clone().addScaledVector(ray, this.distance / ray.dot(this.forward));
  }
  placeBeam(index, a, b, radius = 1.5) {
    const start = this.world(...a), end = this.world(...b), direction = end.clone().sub(start), length = direction.length();
    this.dummy.position.copy(start).add(end).multiplyScalar(.5);
    this.dummy.quaternion.setFromUnitVectors(this.up, direction.normalize());
    for (const [name, size] of [['filament', .32], ['core', radius]]) {
      this.dummy.scale.set(size * this.unit, length, size * this.unit);
      this.dummy.updateMatrix(); this.batch[name].setMatrixAt(index, this.dummy.matrix);
    }
    const normal = this.forward.clone().negate(), right = direction.clone().cross(normal).normalize();
    this.dummy.quaternion.setFromRotationMatrix(new this.T.Matrix4().makeBasis(right, direction, normal));
    for (const [name, width] of [['glow', 18], ['aura', 44]]) {
      this.dummy.scale.set(width * this.unit, length, this.unit);
      this.dummy.updateMatrix(); this.batch[name].setMatrixAt(index, this.dummy.matrix);
    }
  }
  placeJoint(index, center, angle, scale, ends) {
    this.dummy.position.copy(this.world(...center));
    this.dummy.quaternion.copy(this.camera.quaternion);
    this.dummy.rotateZ(angle); this.dummy.scale.setScalar(scale * this.unit);
    this.dummy.updateMatrix(); this.batch.elbow.setMatrixAt(index, this.dummy.matrix);
    ends.forEach(([x, y, rotation], endpoint) => {
      this.dummy.position.copy(this.world(x, y)); this.dummy.quaternion.copy(this.camera.quaternion);
      this.dummy.rotateZ(rotation); this.dummy.scale.setScalar(scale * this.unit);
      this.dummy.updateMatrix(); this.batch.collar.setMatrixAt(index * 2 + endpoint, this.dummy.matrix);
    });
  }
  layoutFrame(section, x, y, width, height, radii, beamRadius) {
    const [tl, tr, br, bl] = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
    const right = x + width, bottom = y + height;
    const beams = [[[x + tl, y], [right - tr, y]], [[right, y + tr], [right, bottom - br]],
      [[right - br, bottom], [x + bl, bottom]], [[x, bottom - bl], [x, y + tl]]];
    beams.forEach(([a, b], index) => this.placeBeam(section.beams[index], a, b, beamRadius));
    const corners = [
      [[x + tl, y + tl], Math.PI / 2, tl, [[x + tl, y, Math.PI / 2], [x, y + tl, 0]]],
      [[right - tr, y + tr], 0, tr, [[right - tr, y, Math.PI / 2], [right, y + tr, 0]]],
      [[right - br, bottom - br], -Math.PI / 2, br, [[right, bottom - br, 0], [right - br, bottom, Math.PI / 2]]],
      [[x + bl, bottom - bl], Math.PI, bl, [[x + bl, bottom, Math.PI / 2], [x, bottom - bl, 0]]],
    ];
    corners.forEach(([center, angle, radius, ends], index) => this.placeJoint(section.joints[index], center, angle, radius / 18, ends));
  }
  paneFrame(pane) {
    const rect = pane.getBoundingClientRect(), style = getComputedStyle(pane);
    const radii = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft']
      .map(corner => Math.max(0, parseFloat(style[`border${corner}Radius`]) || 0));
    // Match the browser's corner overlap reduction before adding the 1px seat.
    const [tl, tr, br, bl] = radii;
    const scale = Math.min(1, rect.width / (tl + tr), rect.width / (bl + br),
      rect.height / (tl + bl), rect.height / (tr + br));
    return {x: rect.left - this.bounds.left - 1, y: rect.top - this.bounds.top - 1,
      width: rect.width + 2, height: rect.height + 2, radii: radii.map(radius => radius * scale + 1)};
  }
  layoutScreen(section, frame) {
    this.layoutFrame(section, frame.x, frame.y, frame.width, frame.height, frame.radii, 1.5);
  }
  sync(camera) {
    this.camera = camera; this.bounds = this.surface.getBoundingClientRect();
    if (!this.bounds.width || !this.bounds.height) return;
    this.distance = 12; this.forward = camera.getWorldDirection(new this.T.Vector3());
    this.unit = (2 * this.distance * Math.tan(camera.fov * Math.PI / 360)) / this.bounds.height;
    const panes = [...this.journey.querySelectorAll('[data-digital-pane]')]
      .filter(pane => {const rect = pane.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > this.bounds.top && rect.top < this.bounds.bottom;}).slice(0, 2);
    const frames = panes.map(pane => this.paneFrame(pane));
    const key = JSON.stringify([this.bounds.left, this.bounds.top, this.bounds.width, this.bounds.height,
      camera.fov, ...camera.position.toArray(), ...camera.quaternion.toArray(), frames]);
    if (key === this.lastLayout) return;
    this.lastLayout = key;
    this.sections.forEach((section, index) => frames[index] ? this.layoutScreen(section, frames[index]) : this.hide(section));
    const w = this.bounds.width, h = this.bounds.height;
    if (w < 720) this.hide(this.spine);
    else this.layoutFrame(this.spine, 42, 22, w - 84, h - 50, 18, 1.2);
    Object.values(this.batch).forEach(mesh => {mesh.instanceMatrix.needsUpdate = true;});
  }
  pulse(value) {
    this.energy = value;
    const breath = Math.sin(performance.now() * Math.PI * 2 / 14000) * .035;
    this.materials.glow.opacity = .53 + value * .04 + breath;
    this.materials.aura.opacity = .12 + value * .012 + breath * .15;
  }
  diagnostics() {
    return {kind: 'decorative-screen-support', energy: this.energy, screenCapacity: 2, drawBatches: 6,
      corners: 'steel-quarter-torus-with-collars', glow: 'continuous-gaussian', edgeOffsetPx: 1,
      registration: 'screen-parallel-glass-perimeter', cornerRadii: 'computed-per-corner',
      decorativePulsePeriodSeconds: 14, decorativePulseAmplitude: .035};
  }
  dispose() {
    this.disposed = true; this.scene.remove(this.group);
    Object.values(this.geometry).forEach(item => item.dispose());
    Object.values(this.materials).forEach(item => item.dispose()); this.texture.dispose();
  }
}
