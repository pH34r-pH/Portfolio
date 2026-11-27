// Physical presentation stage for the homepage background.
// Native DOM panes stay in document order and remain the only text. Each pane is
// carried by a physically lit glass slab on an aluminium chassis; the slab moves on
// a damped spring and the pane follows it through a perspective homography, so
// the words are always the real, selectable, accessible text.
import {studioEnvironment} from './physical-studio.js';

const PANE_DISTANCE = 12, STIFFNESS = 86, DAMPING = 14.5, REST = 1e-3;
const CAMERA_PATH = [[0, 0], [-.13, .035], [.12, -.02], [-.05, .045], [0, .02]];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function stageMaterials(T, lightweight) {
  return {
    glass: new T.MeshPhysicalMaterial({color: 0x10263a, metalness: 0, roughness: .2, transmission: lightweight ? 0 : .5,
      thickness: .3, ior: 1.52, attenuationColor: 0x071420, attenuationDistance: .5, clearcoat: 1, clearcoatRoughness: .035,
      specularIntensity: 1, envMapIntensity: 1.35}),
    chassis: new T.MeshPhysicalMaterial({color: 0x9fb2c1, metalness: 1, roughness: .34, clearcoat: .25, clearcoatRoughness: .3, envMapIntensity: 1.1}),
    brass: new T.MeshPhysicalMaterial({color: 0xc29a5b, metalness: 1, roughness: .26, envMapIntensity: 1.2}),
    floor: new T.MeshPhysicalMaterial({color: 0x02060a, metalness: 0, roughness: .5, clearcoat: .9, clearcoatRoughness: .08, envMapIntensity: .3,
      transparent: true, alphaMap: floorFade(T)}),
  };
}

// Radial falloff so the floor dissolves into the dark set instead of meeting a horizon.
function floorFade(T) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d'), gradient = context.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, '#fff'); gradient.addColorStop(.45, '#bbb'); gradient.addColorStop(1, '#000');
  context.fillStyle = gradient; context.fillRect(0, 0, 256, 256);
  return new T.CanvasTexture(canvas);
}

function roundedRect(T, width, height, radius) {
  const x = -width / 2, y = -height / 2, r = Math.min(radius, width / 2, height / 2), shape = new T.Shape();
  shape.moveTo(x + r, y); shape.lineTo(x + width - r, y); shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r); shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height); shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

// One slab: front face at local z=0, chassis behind it on four brass standoffs.
function slabGeometry(T, width, height, radius, unit) {
  const bevel = 3 * unit, thick = 16 * unit, glassOut = 14 * unit, chassisOut = 22 * unit, gap = 10 * unit, plate = 5 * unit;
  const glass = new T.ExtrudeGeometry(roundedRect(T, width + glassOut * 2, height + glassOut * 2, radius + glassOut),
    {depth: thick - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8});
  glass.translate(0, 0, -(thick - bevel));
  const chassis = new T.ExtrudeGeometry(roundedRect(T, width + chassisOut * 2, height + chassisOut * 2, radius + chassisOut),
    {depth: plate, bevelEnabled: true, bevelThickness: unit, bevelSize: unit, bevelSegments: 2, curveSegments: 8});
  chassis.translate(0, 0, -(thick + gap + plate));
  const standoff = new T.CylinderGeometry(4 * unit, 4 * unit, gap + 2 * unit, 20).rotateX(Math.PI / 2);
  const inset = [width / 2 + glassOut - 9 * unit, height / 2 + glassOut - 9 * unit];
  const posts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [sx * inset[0], sy * inset[1], -(thick + gap / 2)]);
  return {glass, chassis, standoff, posts};
}

function spring(state, key, target, dt) {
  const velocity = `v${key}`, accel = STIFFNESS * (target - state[key]) - DAMPING * state[velocity];
  state[velocity] += accel * dt; state[key] += state[velocity] * dt;
  return Math.abs(state[key] - target) + Math.abs(state[velocity]) * .05;
}

// Pose targets from the pane's reading position: rising from a bench below the
// fold, docked square to the reader, then tipping back onto the rack above.
function poseTargets(distance, side, frozen) {
  if (frozen) return {tilt: 0, yaw: 0, depth: 0, lift: 0};
  const enter = smooth(.08, .95, distance), exit = smooth(.1, .95, -distance);
  return {tilt: -1.02 * enter + .72 * exit, yaw: side * (.3 * enter - .36 * exit),
    depth: .55 * enter + .75 * exit, lift: -.1 * enter + .12 * exit};
}

// Map the pane's own box (0,0)-(w,h) onto four projected corners as a CSS matrix3d.
export function quadMatrix(width, height, quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3, dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (sx * dy2 - dx2 * sy) / den : 0, h = den ? (dx1 * sy - sx * dy1) / den : 0;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
  const m = [a / width, d / width, 0, g / width, b / height, e / height, 0, h / height, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map(v => +v.toFixed(6)).join(',')})`;
}

export class PhysicalStage {
  constructor(T, machine, journey, {lightweight = false} = {}) {
    Object.assign(this, {T, machine, journey, lightweight});
    this.phoneQuery = matchMedia('(max-width:720px)');
    this.scene = machine.scene; this.group = new T.Group(); this.scene.add(this.group);
    this.materials = stageMaterials(T, lightweight);
    this.panes = [...journey.querySelectorAll('[data-digital-pane]')].map(node => ({node, chapter: node.closest('[data-digital-chapter]'),
      state: {tilt: 0, yaw: 0, depth: 0, lift: 0, vtilt: 0, vyaw: 0, vdepth: 0, vlift: 0}, object: null, sizeKey: ''}));
    this.cameraState = {yaw: 0, pitch: 0, vyaw: 0, vpitch: 0};
    this.base = {yaw: machine.yaw, pitch: machine.pitch};
    this.matrix = new T.Matrix4(); this.scratch = new T.Matrix4(); this.vector = new T.Vector3(); this.forward = new T.Vector3();
    this.buildStudio(); this.measure();
    this.onResize = () => { this.measured = false; this.kick(); };
    this.resizeObserver = new ResizeObserver(this.onResize); this.resizeObserver.observe(journey);
    this.onScroll = () => this.kick(); addEventListener('scroll', this.onScroll, {passive: true});
    journey.dataset.physicalStage = 'active';
    Object.defineProperty(journey, 'physicalStage', {value: this, configurable: true});
  }
  buildStudio() {
    const T = this.T, renderer = this.machine.renderer;
    this.environment = studioEnvironment(T, renderer); this.scene.environment = this.environment.texture;
    this.scene.fog = new T.Fog(0x02080e, 30, 62);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = this.machine.backend === 'webgpu' ? T.PCFShadowMap : T.PCFSoftShadowMap;
    const bounds = new T.Box3().setFromObject(this.machine.housing.group), center = bounds.getCenter(new T.Vector3());
    this.floor = new T.Mesh(new T.PlaneGeometry(34, 34).rotateX(-Math.PI / 2), this.materials.floor); this.floor.renderOrder = -1;
    this.floor.position.set(center.x, bounds.min.y - .004, center.z); this.floor.receiveShadow = true; this.group.add(this.floor);
    const key = new T.DirectionalLight(0xf2f8ff, 1.7), size = this.phone ? 1024 : 2048;
    key.position.copy(center).add(new T.Vector3(-7, 13, 9)); key.target.position.copy(center); key.castShadow = true;
    Object.assign(key.shadow.camera, {left: -17, right: 17, top: 17, bottom: -17, near: .5, far: 60});
    key.shadow.mapSize.set(size, size); key.shadow.bias = -.0004; key.shadow.normalBias = .02; key.shadow.radius = 5;
    this.group.add(key, key.target); this.key = key;
    this.machine.machine.traverse(node => { if (node.isMesh && !(node.material?.transmission > .5)) node.castShadow = true; });
  }
  // Untransformed layout offsets relative to each chapter; chapters never transform.
  measure() {
    for (const pane of this.panes) {
      const previous = pane.node.style.transform; pane.node.style.transform = 'none';
      const rect = pane.node.getBoundingClientRect(), chapter = pane.chapter.getBoundingClientRect();
      pane.offset = {x: rect.left - chapter.left, y: rect.top - chapter.top, width: rect.width, height: rect.height,
        radius: parseFloat(getComputedStyle(pane.node).borderTopLeftRadius) || 20};
      pane.node.style.transform = previous;
    }
    this.measured = true;
  }
  layoutRect(pane) {
    const chapter = pane.chapter.getBoundingClientRect(), o = pane.offset;
    return {left: chapter.left + o.x, top: chapter.top + o.y, width: o.width, height: o.height, radius: o.radius};
  }
  ensureObject(pane, unit) {
    const key = [pane.offset.width, pane.offset.height, unit].map(v => v.toFixed(4)).join(':');
    if (key === pane.sizeKey) return pane.object;
    this.disposeObject(pane);
    const T = this.T, geometry = slabGeometry(T, pane.offset.width * unit, pane.offset.height * unit, pane.offset.radius * unit, unit);
    const object = new T.Group(); object.matrixAutoUpdate = false;
    const glass = new T.Mesh(geometry.glass, this.materials.glass), chassis = new T.Mesh(geometry.chassis, this.materials.chassis);
    const posts = new T.InstancedMesh(geometry.standoff, this.materials.brass, 4);
    geometry.posts.forEach((position, index) => posts.setMatrixAt(index, this.scratch.makeTranslation(...position)));
    for (const mesh of [glass, chassis, posts]) { mesh.castShadow = true; object.add(mesh); }
    glass.renderOrder = 2; object.userData.geometry = geometry;
    this.group.add(object); pane.object = object; pane.sizeKey = key;
    return object;
  }
  disposeObject(pane) {
    if (!pane.object) return;
    this.group.remove(pane.object);
    const g = pane.object.userData.geometry; g.glass.dispose(); g.chassis.dispose(); g.standoff.dispose();
    pane.object = null; pane.sizeKey = '';
  }
  get phone() { return this.phoneQuery.matches; }
  frozen(pane) {
    return this.phone || this.journey.dataset.reading === 'native' || pane.node.contains(document.activeElement);
  }
  // Base pose places the slab's front face exactly where the pane is laid out.
  basePoint(camera, canvas, rect) {
    const T = this.T, x = (rect.left + rect.width / 2 - canvas.left) / canvas.width * 2 - 1;
    const y = 1 - (rect.top + rect.height / 2 - canvas.top) / canvas.height * 2;
    const ray = this.vector.set(x, y, .5).unproject(camera).sub(camera.position).normalize();
    return new T.Vector3().copy(camera.position).addScaledVector(ray, PANE_DISTANCE / ray.dot(this.forward));
  }
  poseMatrix(camera, base, state, size) {
    const T = this.T, pivot = state.tilt < 0 ? -size.height / 2 : size.height / 2, m = this.matrix;
    m.compose(base, camera.quaternion, new T.Vector3(1, 1, 1));
    m.multiply(this.scratch.makeTranslation(0, state.lift * size.height + pivot, -state.depth * size.height));
    m.multiply(this.scratch.makeRotationX(state.tilt)).multiply(this.scratch.makeRotationY(state.yaw));
    return m.multiply(this.scratch.makeTranslation(0, -pivot, 0));
  }
  project(point, camera, canvas) {
    const p = this.vector.copy(point).project(camera);
    return [canvas.left + (p.x + 1) / 2 * canvas.width, canvas.top + (1 - p.y) / 2 * canvas.height];
  }
  applyDom(pane, rect, camera, canvas, size, settled) {
    if (settled) { pane.node.style.transform = ''; pane.node.style.transformOrigin = ''; return; }
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
      const point = new this.T.Vector3(sx * size.width / 2, sy * size.height / 2, 0).applyMatrix4(pane.object.matrix);
      const [x, y] = this.project(point, camera, canvas); return [x - rect.left, y - rect.top];
    });
    pane.node.style.transformOrigin = '0 0';
    pane.node.style.transform = quadMatrix(rect.width, rect.height, corners);
  }
  stepPane(pane, camera, canvas, unit, dt) {
    const rect = this.layoutRect(pane), center = rect.top + rect.height / 2;
    const near = center > -innerHeight && center < innerHeight * 2;
    if (!near) {
      if (pane.object) pane.object.visible = false;
      pane.node.style.transform = ''; pane.node.style.transformOrigin = ''; return true;
    }
    const distance = (center - innerHeight / 2) / innerHeight, side = rect.left + rect.width / 2 < innerWidth / 2 ? 1 : -1;
    const target = poseTargets(distance, side, this.frozen(pane)), state = pane.state;
    let error = 0;
    for (let t = 0; t < dt; t += 1 / 120) for (const key of Object.keys(target)) error = Math.max(error, spring(state, key, target[key], Math.min(1 / 120, dt - t)));
    const settled = error < REST && Object.values(target).every(value => value === 0);
    if (settled) for (const key of Object.keys(target)) { state[key] = 0; state[`v${key}`] = 0; }
    const object = this.ensureObject(pane, unit), size = {width: rect.width * unit, height: rect.height * unit};
    object.visible = true; object.matrix.copy(this.poseMatrix(camera, this.basePoint(camera, canvas, rect), state, size));
    object.matrixWorldNeedsUpdate = true;
    this.applyDom(pane, rect, camera, canvas, size, settled);
    return error < REST;
  }
  steerCamera(dt) {
    if (this.phone) return true;
    const index = Math.max(0, this.panes.findIndex(pane => pane.chapter.id === this.journey.dataset.chapter));
    const [yaw, pitch] = CAMERA_PATH[Math.min(index, CAMERA_PATH.length - 1)], state = this.cameraState;
    const error = Math.max(spring(state, 'yaw', yaw, Math.min(dt, .05)), spring(state, 'pitch', pitch, Math.min(dt, .05)));
    this.machine.yaw = this.base.yaw + state.yaw; this.machine.pitch = this.base.pitch + state.pitch; this.machine.updateCamera();
    return error < REST;
  }
  sync(camera) {
    if (this.disposed) return;
    const now = performance.now(), dt = this.last ? Math.min(.05, (now - this.last) / 1000) : 0;
    this.last = now; if (!this.measured) this.measure();
    let settled = this.steerCamera(dt);
    camera.updateMatrixWorld(); this.forward.copy(camera.getWorldDirection(this.vector));
    const canvas = this.machine.canvas.getBoundingClientRect();
    if (!canvas.width || !canvas.height) return;
    const unit = 2 * PANE_DISTANCE * Math.tan(camera.fov * Math.PI / 360) / canvas.height;
    for (const pane of this.panes) settled = this.stepPane(pane, camera, canvas, unit, dt) && settled;
    if (!settled) this.kick();
  }
  // Keep springs moving while background playback is paused.
  kick() {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (performance.now() - (this.last || 0) > 12) this.machine.render();
    });
  }
  diagnostics() {
    return {kind: 'physical-stage', panes: this.panes.filter(pane => pane.object?.visible).length, shadows: this.machine.renderer.shadowMap.enabled,
      environment: 'procedural-studio', transmission: this.materials.glass.transmission,
      docked: this.panes.filter(pane => !pane.node.style.transform).length};
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.raf); removeEventListener('scroll', this.onScroll); this.resizeObserver.disconnect();
    for (const pane of this.panes) { this.disposeObject(pane); pane.node.style.transform = ''; pane.node.style.transformOrigin = ''; }
    this.scene.remove(this.group); this.floor.geometry.dispose(); this.materials.floor.alphaMap.dispose(); Object.values(this.materials).forEach(material => material.dispose());
    this.environment.dispose(); this.scene.fog = null; delete this.journey.dataset.physicalStage;
  }
}
