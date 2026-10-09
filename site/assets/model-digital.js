import { TOPOLOGY, layerX } from './model-topology.js';

// Contours follow the actual cluster radii; they are structural guides, not data.
export function digitalContours(T, segments=64) {
  const positions = [];
  TOPOLOGY.radii.forEach((radius, layer) => {
    for (const scale of [1.06, 1.16]) for (let step = 0; step < segments; step++) {
      for (const angle of [step, step + 1]) {
        const phase = angle * Math.PI * 2 / segments;
        positions.push(layerX(layer), Math.cos(phase) * radius * scale, Math.sin(phase) * radius * scale);
      }
    }
  });
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  return new T.LineSegments(geometry, new T.LineBasicMaterial({color:0x165577, transparent:true, opacity:.2, depthWrite:false, blending:T.AdditiveBlending}));
}
