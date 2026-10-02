import { clamp } from './model-topology.js';

const anchors = {
  input: {x: .16, y: .60, depth: 2.4, tilt: .17},
  inspect: {x: .83, y: .31, depth: 4.6, tilt: -.15},
  output: {x: .70, y: .74, depth: 7.0, tilt: -.17},
};

function glassGeometry(T, width, height) {
  const shape = new T.Shape(), cut = .06;
  shape.moveTo(-width / 2 + cut, -height / 2);
  shape.lineTo(width / 2 - cut, -height / 2); shape.lineTo(width / 2, -height / 2 + cut);
  shape.lineTo(width / 2, height / 2 - cut); shape.lineTo(width / 2 - cut, height / 2);
  shape.lineTo(-width / 2 + cut, height / 2); shape.lineTo(-width / 2, height / 2 - cut);
  shape.lineTo(-width / 2, -height / 2 + cut); shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, {depth: .50, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 2, steps: 1, curveSegments: 1});
  geometry.translate(0, 0, -.25); return geometry;
}

function environment(T, renderer) {
  const scene = new T.Scene(); scene.background = new T.Color(.12, .17, .23);
  const objects = [];
  for (const [x, y, z, width, height, color] of [[-5, 5, 6, 2, 8, 0xffffff], [5, 3, 2, 1, 9, 0x91ceff], [0, -4, -4, 8, 1, 0x1e567f]]) {
    const mesh = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({color, side: T.DoubleSide}));
    mesh.position.set(x, y, z); mesh.lookAt(0, 0, 0); scene.add(mesh); objects.push(mesh);
  }
  const generator = new T.PMREMGenerator(renderer), target = generator.fromScene(scene, 0, .1, 50, {size: 128});
  generator.dispose(); objects.forEach(object => { object.geometry.dispose(); object.material.dispose(); });
  return target;
}

// A projective DOM transform uses precisely the same world plane and camera as
// the front glass face. No per-panel camera, screenshot texture or frame loop.
function project(T, camera, mesh, size, viewport) {
  const local = new T.Matrix4().set(size.worldWidth / size.width, 0, 0, -size.worldWidth / 2,
    0, -size.worldHeight / size.height, 0, size.worldHeight / 2, 0, 0, 1, .30, 0, 0, 0, 1);
  const matrix = new T.Matrix4().copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse).multiply(mesh.matrixWorld).multiply(local).elements;
  const h = [], w = viewport.width / 2, v = viewport.height / 2;
  for (const offset of [0, 4, 12]) h.push(w * (matrix[offset] + matrix[offset + 3]), v * (-matrix[offset + 1] + matrix[offset + 3]), matrix[offset + 3]);
  const d = h[8];
  const css = [h[0] / d, h[1] / d, 0, h[2] / d, h[3] / d, h[4] / d, 0, h[5] / d, 0, 0, 1, 0, h[6] / d, h[7] / d, 0, 1];
  const point = (x, y) => { const d = h[2] * x + h[5] * y + h[8]; return [(h[0] * x + h[3] * y + h[6]) / d, (h[1] * x + h[4] * y + h[7]) / d]; };
  const corners = [[0, 0], [size.width, 0], [size.width, size.height], [0, size.height]].map(([x, y]) => point(x, y));
  return {css, corners, scale: Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]) / size.width};
}

export class SharedGlass {
  constructor(T, scene, renderer, instruments) {
    this.T = T; this.scene = scene; this.instruments = instruments; this.panels = [];
    this.renderer = renderer; this.environment = null;
    this.material = new T.MeshPhysicalMaterial({color: 0xffffff, transmission: .99, opacity: 1, ior: 1.46, thickness: .58, roughness: .025, metalness: 0, side: T.FrontSide, attenuationColor: 0xffffff, attenuationDistance: Infinity, envMapIntensity: .3, clearcoat: 0});
    this.trimMaterial = new T.LineBasicMaterial({color: 0xc8dce5, transparent: true, opacity: .32});
    this.light = new T.PointLight(0x5bbfff, 0, 18, 2); scene.add(this.light);
    this.light.userData.replayPulse = true;
  }
  setQuality(mode) {
    const low = mode === 'lightweight'; this.quality = mode;
    if (!low && !this.environment) this.environment = environment(this.T, this.renderer);
    this.scene.environment = low ? null : this.environment.texture;
    this.material.transmission = low ? 0 : .99; this.material.opacity = low ? .07 : 1;
    this.material.transparent = low; this.material.roughness = low ? .16 : .025;
    this.material.needsUpdate = true;
  }
  layout(camera, viewport, distance, phone) {
    this.viewport = viewport; this.phone = phone;
    this.pinnedToArticleContext = true;
    this.poseKey = null;
    this.instruments.host.dataset.instruments = 'spatial';
    this.panels.forEach(panel => { this.scene.remove(panel.mesh, panel.trim); panel.mesh.geometry.dispose(); panel.trim.geometry.dispose(); });
    this.panels = this.instruments.dimensions(phone, viewport.width).map(size => {
      const anchor = anchors[size.id], depth = phone ? anchor.depth * .65 : anchor.depth;
      const center = new this.T.Vector3(phone ? 0 : anchor.x * 2 - 1, phone ? -.62 : 1 - anchor.y * 2, 0).unproject(camera);
      const direction = center.sub(camera.position).normalize();
      const position = camera.position.clone().addScaledVector(direction, (distance - depth) / direction.dot(camera.getWorldDirection(new this.T.Vector3())));
      const unit = 2 * (distance - depth) * Math.tan(camera.fov * Math.PI / 360) / viewport.height;
      size.worldWidth = size.width * unit; size.worldHeight = size.height * unit;
      const mesh = new this.T.Mesh(glassGeometry(this.T, size.worldWidth + unit * 24, size.worldHeight + unit * 24), this.material);
      mesh.position.copy(position); mesh.quaternion.copy(camera.quaternion); mesh.rotateY(anchor.tilt * (phone ? .4 : 1));
      const trim = new this.T.LineSegments(new this.T.EdgesGeometry(mesh.geometry, 24), this.trimMaterial);
      trim.position.copy(mesh.position); trim.quaternion.copy(mesh.quaternion); this.scene.add(mesh, trim);
      return {...size, mesh, trim, depth, projection: null};
    });
    // DOM panes are article context, not camera controls. Pin their screen
    // transforms to the layout pose; orbit, pan, and zoom remain independent.
    this.layoutCamera = camera;
    this.layoutGeneration = (this.layoutGeneration || 0) + 1;
    this.projectLayout();
  }
  projectLayout() {
    if (!this.viewport || !this.layoutCamera) return;
    this.scene.updateMatrixWorld(); this.layoutCamera.updateMatrixWorld();
    const inverseCamera = this.layoutCamera.matrixWorld.clone().invert();
    for (const panel of this.panels) {
      panel.projection = project(this.T, this.layoutCamera, panel.mesh, panel, this.viewport);
      panel.node.style.transform = `matrix3d(${panel.projection.css.join(',')})`;
      panel.cameraPosition = panel.mesh.position.clone().applyMatrix4(inverseCamera);
      panel.cameraRotation = this.layoutCamera.quaternion.clone().invert().multiply(panel.mesh.quaternion.clone());
    }
  }
  sync(camera) {
    if (!this.viewport) return;
    camera.updateMatrixWorld();
    this.currentCamera = camera;
    for (const panel of this.panels) {
      if (!panel.cameraPosition) continue;
      panel.mesh.position.copy(panel.cameraPosition).applyMatrix4(camera.matrixWorld);
      panel.mesh.quaternion.copy(camera.quaternion).multiply(panel.cameraRotation);
      panel.trim.position.copy(panel.mesh.position); panel.trim.quaternion.copy(panel.mesh.quaternion);
    }
    this.scene.updateMatrixWorld();
    const contextState = this.panels.map(panel => `${panel.id}:${panel.node.contextVisible}:${panel.node.dataset.contextActive}`).join(',');
    const key = `${this.layoutGeneration}:${this.instruments.active}:${contextState}:${visualViewport?.scale || 1}:${this.instruments.root.dataset.render}`;
    if (key === this.poseKey) return; this.poseKey = key;
    const visible = this.panels.filter(panel => panel.node.contextVisible !== false
      && (!this.phone || panel.id === this.instruments.active || panel.node.dataset.contextActive === 'false'));
    const zoomed = (visualViewport?.scale || 1) > 1.15;
    // The fit decision uses the pinned article pose, never the user's live
    // camera pose. Camera gestures therefore cannot reflow article controls.
    const safe = !zoomed && visible.every(panel => panel.projection.scale >= .94
      && panel.projection.corners.every(([x, y]) => x >= 12 && x <= this.viewport.width - 12
        && y >= 12 && y <= this.viewport.height - 12));
    this.instruments.setMode(safe ? 'spatial' : 'flow', this.phone);
    for (const panel of this.panels) {
      panel.mesh.visible = panel.trim.visible = safe && visible.includes(panel);
    }
    this.mode = safe ? 'spatial' : 'flow';
  }
  pulse(value) {
    const energy = clamp(value, 0, 1); this.light.intensity = energy * 16;
    const output = this.panels.find(panel => panel.id === 'output');
    if (output) this.light.position.copy(output.mesh.position).add(new this.T.Vector3(-1, 1.8, 2.4));
  }
  diagnostics() {
    let lights = 0; this.scene.traverse(object => { if (object.isLight && object.userData.replayPulse) lights += 1; });
    const pinnedError = panel => {
      if (!this.currentCamera || !panel.projection || !panel.cameraPosition) return null;
      const current = project(this.T, this.currentCamera, panel.mesh, panel, this.viewport).css;
      return Math.max(...current.map((value,index)=>Math.abs(value-panel.projection.css[index])));
    };
    return {mode: this.mode, quality:this.quality, visible: this.panels.filter(panel => panel.mesh.visible).length, pmremSize: this.environment ? 128 : 0, lights,
      material: {transmission: this.material.transmission, opacity:this.material.opacity, ior: this.material.ior, thickness: this.material.thickness, roughness:this.material.roughness, tint:this.material.color.getHexString()},
      pinnedToArticleContext: this.pinnedToArticleContext === true, layoutGeneration: this.layoutGeneration,
      panels: this.panels.map(panel => ({id: panel.id, depth: panel.depth, visible: panel.mesh.visible,
        contextActive: panel.node?.dataset.contextActive !== 'false', contextVisible:panel.node?.contextVisible !== false,
        cameraPinnedError:pinnedError(panel), corners: panel.projection?.corners, scale: panel.projection?.scale}))};
  }
  dispose() { this.instruments.setMode('flow', this.phone); this.environment?.dispose(); this.material.dispose(); this.trimMaterial.dispose(); }
}
