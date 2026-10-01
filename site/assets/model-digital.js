import { TOPOLOGY, layerX } from './model-topology.js';

// Contours follow the actual cluster radii; they are structural guides, not data.
export function digitalContours(T) {
  const positions = [], colors = [];
  TOPOLOGY.radii.forEach((radius, layer) => {
    for (const scale of [1.06, 1.16]) for (let step = 0; step < 64; step++) {
      for (const angle of [step, step + 1]) {
        const phase = angle * Math.PI / 32;
        positions.push(layerX(layer), Math.cos(phase) * radius * scale, Math.sin(phase) * radius * scale);
        colors.push(layer % 2 ? .8 : .15, layer % 2 ? .15 : .7, 1);
      }
    }
  });
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  return new T.LineSegments(geometry, new T.LineBasicMaterial({vertexColors:true, transparent:true, opacity:.3, depthWrite:false, blending:T.AdditiveBlending}));
}
