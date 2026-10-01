import { SharedGlass } from './model-glass.js';

// Thin generated display faces share the graph's renderer and camera. Native
// DOM content remains in document order; its measured viewport bounds anchor
// these faces. No text is printed into a WebGL texture.
export class HomepageScreens extends SharedGlass {
  layout(camera, viewport, distance) {
    this.viewport = viewport; this.distance = distance;
    if (this.panels.length) return;
    for (let index = 0; index < 3; index++) {
      const mesh = new this.T.Mesh(new this.T.PlaneGeometry(1, 1), this.material);
      const trim = new this.T.LineSegments(new this.T.EdgesGeometry(mesh.geometry), this.trimMaterial);
      this.scene.add(mesh, trim); this.panels.push({mesh, trim});
    }
    this.material.thickness = .025; this.material.depthWrite = false;
    this.trimMaterial.color.set(0xb980ff); this.trimMaterial.opacity = .32;
  }
  sync(camera) {
    if (!this.viewport) return;
    const T = this.T, root = this.instruments.root, canvas = root.querySelector('canvas').getBoundingClientRect();
    const faces = [...root.querySelectorAll('[data-digital-pane]')].map(node => ({node, rect:node.getBoundingClientRect()}))
      .filter(({rect}) => rect.bottom > canvas.top && rect.top < canvas.bottom).slice(0, 3);
    const distance = this.distance - 5, unit = 2 * distance * Math.tan(camera.fov * Math.PI / 360) / this.viewport.height;
    const forward = camera.getWorldDirection(new T.Vector3());
    this.panels.forEach((panel, index) => {
      const face = faces[index]; panel.mesh.visible = panel.trim.visible = Boolean(face);
      if (!face) return;
      const r = face.rect, x = (r.left + r.width / 2 - canvas.left) / canvas.width * 2 - 1;
      const y = 1 - (r.top + r.height / 2 - canvas.top) / canvas.height * 2;
      const ray = new T.Vector3(x, y, 0).unproject(camera).sub(camera.position).normalize();
      panel.mesh.position.copy(camera.position).addScaledVector(ray, distance / ray.dot(forward));
      panel.mesh.quaternion.copy(camera.quaternion); panel.mesh.scale.set(r.width * unit, r.height * unit, 1);
      panel.trim.position.copy(panel.mesh.position); panel.trim.quaternion.copy(panel.mesh.quaternion); panel.trim.scale.copy(panel.mesh.scale);
      panel.id = face.node.closest('[data-digital-chapter]').id;
    });
    this.mode = 'native-scroll';
  }
  pulse(value) { this.light.intensity = value * 4; this.light.position.set(0, 2, 3); }
}
