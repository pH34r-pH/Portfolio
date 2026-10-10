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
    this.renderer = renderer; this.environment = null; this.sharedEnvironment = scene.environment;
    this.material = new T.MeshPhysicalMaterial({color: 0xffffff, transmission: .99, opacity: 1, ior: 1.46, thickness: .58, roughness: .025, metalness: 0, side: T.FrontSide, attenuationColor: 0xffffff, attenuationDistance: Infinity, envMapIntensity: .3, clearcoat: 0});
    this.trimMaterial = new T.LineBasicMaterial({color: 0xc8dce5, transparent: true, opacity: .32});
    this.light = new T.PointLight(0x5bbfff, 0, 18, 2); scene.add(this.light);
    this.light.userData.replayPulse = true;
  }
  setQuality(mode) {
    const low = mode === 'lightweight'; this.quality = mode;
    if (!low && !this.sharedEnvironment && !this.instruments.article && !this.environment) this.environment = environment(this.T, this.renderer);
    this.scene.environment = this.sharedEnvironment || (low ? null : this.environment?.texture || null);
    this.material.transmission = low ? 0 : .99; this.material.opacity = low ? .07 : 1;
    this.material.transparent = low; this.material.roughness = low ? .16 : .025;
    this.material.needsUpdate = true;
    for (const panel of this.panels) {
      panel.mesh.material.copy(this.material); panel.trim.material.copy(this.trimMaterial);
    }
  }
  layout(camera, viewport, distance, phone) {
    this.viewport = viewport; this.phone = phone;
    // The first fit after rotation must see the current context's phone pane.
    this.instruments.setMode(this.instruments.mode, phone);
    this.pinnedToArticleContext = true;
    this.poseKey = null;
    this.instruments.host.dataset.instruments = 'spatial';
    this.panels.forEach(panel => {
      this.scene.remove(panel.mesh, panel.trim); panel.mesh.geometry.dispose(); panel.trim.geometry.dispose();
      panel.mesh.material.dispose(); panel.trim.material.dispose();
    });
    this.canvas = this.instruments.host.querySelector('[data-machine-canvas]');
    this.panels = this.instruments.dimensions(phone, viewport.width).map(size => {
      const anchor = anchors[size.id], depth = phone ? anchor.depth * .65 : anchor.depth;
      const center = new this.T.Vector3(phone ? 0 : anchor.x * 2 - 1, phone ? -.62 : 1 - anchor.y * 2, 0).unproject(camera);
      const direction = center.sub(camera.position).normalize();
      const position = camera.position.clone().addScaledVector(direction, (distance - depth) / direction.dot(camera.getWorldDirection(new this.T.Vector3())));
      const unit = 2 * (distance - depth) * Math.tan(camera.fov * Math.PI / 360) / viewport.height;
      size.worldWidth = size.width * unit; size.worldHeight = size.height * unit;
      const mesh = new this.T.Mesh(glassGeometry(this.T, size.worldWidth + unit * 24, size.worldHeight + unit * 24), this.material.clone());
      mesh.position.copy(position); mesh.quaternion.copy(camera.quaternion); mesh.rotateY(anchor.tilt * (phone ? .4 : 1));
      const trim = new this.T.LineSegments(new this.T.EdgesGeometry(mesh.geometry, 24), this.trimMaterial.clone());
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
  visiblePanels() {
    return this.panels.filter(panel => panel.node.contextVisible !== false
      && (!this.phone || panel.id === this.instruments.active || panel.node.dataset.contextActive === 'false'));
  }
  layoutFits(visible) {
    return visible.every(panel => panel.projection.scale >= .94
      && panel.projection.corners.every(([x,y])=>x>=12&&x<=this.viewport.width-12
        &&y>=12&&y<=this.viewport.height-12));
  }
  resetPanelPoses(camera) {
    for (const panel of this.panels) {
      if (!panel.cameraPosition) continue;
      panel.mesh.position.copy(panel.cameraPosition).applyMatrix4(camera.matrixWorld);
      panel.mesh.quaternion.copy(camera.quaternion).multiply(panel.cameraRotation);
      panel.trim.position.copy(panel.mesh.position); panel.trim.quaternion.copy(panel.mesh.quaternion);
    }
  }
  setPanelVisibility(camera,visible,safe) {
    for (const panel of this.panels) {
      if (panel.node.contextAnimating) this.animatePanel(panel,camera,safe);
      else this.resetPanelMaterial(panel);
      panel.mesh.visible = panel.trim.visible = safe && visible.includes(panel);
    }
  }
  resetPanelMaterial(panel) {
    const opacity=panel.node.dataset.contextActive === 'false' ? 0 : 1;
    const material=panel.mesh.material;
    material.opacity=this.material.opacity*opacity;
    if(material.transparent!==this.material.transparent) {material.transparent=this.material.transparent;material.needsUpdate=true;}
    panel.trim.material.opacity=this.trimMaterial.opacity*opacity;
    panel.transitionOpacity=opacity; panel.transitionOffset={x:0,y:0};
  }
  translatePanelForDOM(panel,camera,offsetX,offsetY) {
    const position=panel.mesh.position;
    const right=new this.T.Vector3(1,0,0).applyQuaternion(camera.quaternion);
    const up=new this.T.Vector3(0,1,0).applyQuaternion(camera.quaternion);
    const center=()=>{panel.mesh.updateMatrixWorld(true);const corners=project(this.T,camera,panel.mesh,panel,this.viewport).corners;
      return corners.reduce((sum,point)=>[sum[0]+point[0]/4,sum[1]+point[1]/4],[0,0]);};
    const initial=center(),target=[initial[0]+offsetX,initial[1]+offsetY];
    for(let iteration=0;iteration<3;iteration++) {
      const current=center(),step=.01;
      position.addScaledVector(right,step);const rightCenter=center();
      position.addScaledVector(right,-step).addScaledVector(up,step);const upCenter=center();
      position.addScaledVector(up,-step);
      const a=(rightCenter[0]-current[0])/step,b=(upCenter[0]-current[0])/step;
      const c=(rightCenter[1]-current[1])/step,d=(upCenter[1]-current[1])/step,determinant=a*d-b*c;
      if(Math.abs(determinant)<1e-8)break;
      const dx=target[0]-current[0],dy=target[1]-current[1];
      position.addScaledVector(right,(dx*d-b*dy)/determinant).addScaledVector(up,(a*dy-dx*c)/determinant);
    }
    panel.mesh.updateMatrixWorld(true);
  }
  sync(camera) {
    if (!this.viewport) return;
    camera.updateMatrixWorld();
    this.currentCamera = camera;
    this.resetPanelPoses(camera);
    const contextState = this.panels.map(panel => `${panel.id}:${panel.node.contextVisible}:${panel.node.dataset.contextActive}:${panel.node.contextAnimating}`).join(',');
    const key = `${this.layoutGeneration}:${this.instruments.active}:${contextState}:${visualViewport?.scale || 1}:${this.instruments.root.dataset.render}`;
    const stateChanged = key !== this.poseKey; this.poseKey = key;
    const visible = this.visiblePanels();
    const zoomed = (visualViewport?.scale || 1) > 1.15;
    // The fit decision uses the pinned article pose, never the user's live
    // camera pose. Camera gestures therefore cannot reflow article controls.
    // Reading panes keep native document layout beside/below the graph. The
    // full spatial viewer retains projected glass when its controls fit.
    const safe = !this.instruments.article && !zoomed && this.layoutFits(visible);
    if (stateChanged || (safe ? 'spatial' : 'flow') !== this.mode) this.instruments.setMode(safe ? 'spatial' : 'flow', this.phone);
    this.mode = safe ? 'spatial' : 'flow';
    if (!stateChanged && !this.hasContextAnimation()) {this.scene.updateMatrixWorld();return;}
    this.setPanelVisibility(camera,visible,safe);
    this.scene.updateMatrixWorld();
  }
  animatePanel(panel, camera, safe) {
    const style = getComputedStyle(panel.node);
    const animating = Boolean(panel.node.contextAnimating);
    const opacity = animating ? clamp(Number.parseFloat(style.opacity) || 0, 0, 1)
      : panel.node.dataset.contextActive === 'false' ? 0 : 1;
    const rect = panel.node.getBoundingClientRect();
    const canvas = this.canvas.getBoundingClientRect(), corners = panel.projection.corners;
    const baseLeft = Math.min(...corners.map(point => point[0])), baseTop = Math.min(...corners.map(point => point[1]));
    const offsetX = animating ? rect.left - canvas.left - baseLeft : 0;
    const offsetY = animating ? rect.top - canvas.top - baseTop : 0;
    panel.domOffset = {x:offsetX,y:offsetY}; panel.backingOpacity = opacity;
    if (safe && animating) this.translatePanelForDOM(panel,camera,offsetX,offsetY);
    panel.trim.position.copy(panel.mesh.position); panel.trim.quaternion.copy(panel.mesh.quaternion);
    const material = panel.mesh.material, transparent = this.material.transparent || animating;
    if (material.transparent !== transparent) {material.transparent = transparent; material.needsUpdate = true;}
    material.opacity = this.material.opacity * opacity;
    panel.trim.material.opacity = this.trimMaterial.opacity * opacity;
    panel.transitionOpacity = opacity; panel.transitionOffset = {x:offsetX,y:offsetY};
  }
  hasContextAnimation() { return this.instruments.hasContextAnimation(); }
  pulse(value) {
    const energy = clamp(value, 0, 1); this.light.intensity = energy * 4;
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
    const alignmentError = panel => {
      if (!this.currentCamera || !panel.node || !panel.projection) return null;
      const corners = project(this.T,this.currentCamera,panel.mesh,panel,this.viewport).corners;
      const rect = panel.node.getBoundingClientRect(), canvas = this.canvas.getBoundingClientRect();
      const xs=corners.map(point=>point[0]),ys=corners.map(point=>point[1]);
      return Math.max(Math.abs(Math.min(...xs)-(rect.left-canvas.left)),Math.abs(Math.min(...ys)-(rect.top-canvas.top)),
        Math.abs(Math.max(...xs)-(rect.right-canvas.left)),Math.abs(Math.max(...ys)-(rect.bottom-canvas.top)),
        Math.abs((Math.max(...xs)-Math.min(...xs))-rect.width),Math.abs((Math.max(...ys)-Math.min(...ys))-rect.height));
    };
    const activeEnvironment=this.scene.environment, image=activeEnvironment?.image;
    const cubeUV=Boolean(activeEnvironment&&activeEnvironment.mapping===this.T.CubeUVReflectionMapping);
    const pmremSize=cubeUV?(image?.height||0)/4:0;
    const illumination={ownership:!activeEnvironment?'none':activeEnvironment===this.sharedEnvironment?'shared':activeEnvironment===this.environment?.texture?'owned':'external',
      mapping:cubeUV?'cube-uv':activeEnvironment?'other':'none',width:image?.width||0,height:image?.height||0,faceSize:pmremSize};
    return {mode: this.mode, quality:this.quality, visible: this.panels.filter(panel => panel.mesh.visible).length, pmremSize, environment:illumination, lights,
      material: {transmission: this.material.transmission, opacity:this.material.opacity, ior: this.material.ior, thickness: this.material.thickness, roughness:this.material.roughness, tint:this.material.color.getHexString()},
      pinnedToArticleContext: this.pinnedToArticleContext === true, layoutGeneration: this.layoutGeneration,
      panels: this.panels.map(panel => ({id: panel.id, depth: panel.depth, visible: panel.mesh.visible,
        contextActive: panel.node?.dataset.contextActive !== 'false', contextVisible:panel.node?.contextVisible !== false,
        contextAnimating:Boolean(panel.node?.contextAnimating),backingOpacity:panel.mesh.material.opacity,trimOpacity:panel.trim.material.opacity,
        transitionOpacity:panel.transitionOpacity??1,transitionOffset:panel.transitionOffset??{x:0,y:0},
        transitionAlignmentError:alignmentError(panel),cameraPinnedError:pinnedError(panel),
        corners: panel.projection?.corners, scale: panel.projection?.scale}))};
  }
  dispose() {
    this.instruments.setMode('flow', this.phone);
    this.panels.forEach(panel=>{panel.mesh.material.dispose();panel.trim.material.dispose();});
    this.environment?.dispose(); this.material.dispose(); this.trimMaterial.dispose();
  }
}
