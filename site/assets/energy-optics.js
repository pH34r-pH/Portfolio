// A continuous Gaussian light profile avoids hard boundaries between glow shells.
export function beamGlowTexture(T) {
  const width = 256, data = new Uint8Array(width * 4);
  for (let x = 0; x < width; x++) {
    const distance = (x / (width - 1) - .5) * 2;
    data.set([255, 255, 255, Math.round(255 * Math.exp(-distance * distance * 9))], x * 4);
  }
  const texture = new T.DataTexture(data, width, 1, T.RGBAFormat);
  texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function energyMaterials(T, texture) {
  return {
    filament: new T.MeshBasicMaterial({color: 0xdaf9ff, toneMapped: false}),
    core: new T.MeshBasicMaterial({color: 0x168fff, transparent: true, opacity: .52, depthWrite: false, toneMapped: false}),
    glow: new T.MeshBasicMaterial({color: 0x149dff, map: texture, transparent: true, opacity: .56,
      depthWrite: false, blending: T.AdditiveBlending, toneMapped: false}),
    aura: new T.MeshBasicMaterial({color: 0x0789ff, map: texture, transparent: true, opacity: .13,
      depthWrite: false, blending: T.AdditiveBlending, toneMapped: false}),
    steel: new T.MeshPhysicalMaterial({color: 0x879ca9, metalness: .96, roughness: .21,
      clearcoat: .6, clearcoatRoughness: .15, envMapIntensity: 1.4}),
    collar: new T.MeshStandardMaterial({color: 0xabc3cd, metalness: .94, roughness: .17, envMapIntensity: 1.5}),
  };
}
