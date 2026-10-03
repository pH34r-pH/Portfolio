function merge(T, geometries) {
  const combined = new T.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const arrays = geometries.map(geometry => geometry.attributes[name].array);
    const values = new Float32Array(arrays.reduce((sum, array) => sum + array.length, 0));
    let offset = 0; for (const array of arrays) { values.set(array, offset); offset += array.length; }
    combined.setAttribute(name, new T.BufferAttribute(values, geometries[0].attributes[name].itemSize));
  }
  const indices = new Uint32Array(geometries.reduce((sum, geometry) => sum + geometry.index.count, 0));
  let indexOffset = 0, vertexOffset = 0;
  for (const geometry of geometries) {
    for (const index of geometry.index.array) indices[indexOffset++] = index + vertexOffset;
    vertexOffset += geometry.attributes.position.count; geometry.dispose();
  }
  combined.setIndex(new T.BufferAttribute(indices, 1)); combined.computeBoundingSphere(); return combined;
}

// Decorative housings/rings keep their positions; shared materials share draws.
export function buildMachineHardware(T, materials, topology, layerX) {
  const group = new T.Group(), dummy = new T.Object3D(), rims = [], trims = [];
  const bolts = new T.InstancedMesh(new T.CylinderGeometry(.035, .035, .11, 6), materials.ceramic, topology.widths.length * 8);
  topology.radii.forEach((radius, layer) => {
    const x = layerX(layer), outer = radius + .2;
    rims.push(new T.TorusGeometry(outer, .038, 6, 48).rotateY(Math.PI / 2).translate(x, 0, 0));
    trims.push(new T.TorusGeometry(outer + .065, .008, 3, 48).rotateY(Math.PI / 2).translate(x - .055, 0, 0));
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      dummy.position.set(x, Math.cos(angle) * outer, Math.sin(angle) * outer);
      dummy.rotation.set(0, 0, Math.PI / 2); dummy.updateMatrix(); bolts.setMatrixAt(layer * 8 + index, dummy.matrix);
    }
  });
  group.add(new T.Mesh(merge(T, rims), materials.shell), new T.Mesh(merge(T, trims), materials.ceramic), bolts);
  const housings = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), materials.shell, 12);
  dummy.rotation.set(0, 0, 0); let instance = 0;
  for (const side of [-1, 1]) {
    dummy.position.set(side * 5.3, 0, 0); dummy.scale.set(.34, 1.35, 1.05); dummy.updateMatrix(); housings.setMatrixAt(instance++, dummy.matrix);
    for (let index = 0; index < 5; index++) {
      dummy.position.set(side * (5.12 + index * .09), 0, 0); dummy.scale.set(.05, 1.38, 1.08); dummy.updateMatrix(); housings.setMatrixAt(instance++, dummy.matrix);
    }
  }
  const chassis = [];
  for (const z of [-2.5, 2.5]) chassis.push(new T.Vector3(-4.6, -2.55, z), new T.Vector3(4.6, -2.55, z));
  group.add(housings, new T.LineSegments(new T.BufferGeometry().setFromPoints(chassis), materials.probe));
  return group;
}
