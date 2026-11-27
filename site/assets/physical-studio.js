// Procedural photographic studio, rendered as an HDR equirectangular map.
// Hard-edged softboxes give glass and machined metal the crisp, shaped
// highlights of a product photograph; a dark cyclorama keeps the blue/black
// environment. This is rendered light, not recorded model telemetry.
const SOFTBOXES = [
  // u, v, half-width, half-height, r, g, b — linear radiance
  [.3, .09, .08, .016, 3.6, 4, 4.6],     // overhead strip, front
  [.72, .11, .05, .014, 2.4, 2.8, 3.3],  // overhead strip, rear
  [.16, .38, .028, .12, 6.4, 6.9, 7.6],  // key softbox, camera left
  [.63, .36, .01, .16, 2.4, 4, 6.6],     // cool rim strip, camera right
  [.9, .5, .02, .045, 2.8, 1.9, 1],      // warm kicker behind, for brass
  [.37, .62, .1, .02, .3, .55, 1],       // low blue bounce card
];

function radiance(u, v) {
  const floor = v > .5 ? .018 + (v - .5) * .05 : 0, ceiling = v < .5 ? .008 + (.5 - v) * .012 : 0;
  let r = .006 + floor * .8 + ceiling, g = .011 + floor + ceiling * 1.2, b = .02 + floor * 1.4 + ceiling * 1.6;
  for (const [cu, cv, hw, hh, sr, sg, sb] of SOFTBOXES) {
    const du = Math.min(Math.abs(u - cu), 1 - Math.abs(u - cu)) / hw, dv = Math.abs(v - cv) / hh;
    const k = Math.exp(-Math.pow(du, 14) - Math.pow(dv, 14));
    r += sr * k; g += sg * k; b += sb * k;
  }
  return [r, g, b];
}

export function studioEnvironment(T, renderer) {
  const width = 1024, height = 512, data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = radiance((x + .5) / width, (y + .5) / height), offset = (y * width + x) * 4;
    data[offset] = r; data[offset + 1] = g; data[offset + 2] = b; data[offset + 3] = 1;
  }
  const texture = new T.DataTexture(data, width, height, T.RGBAFormat, T.FloatType);
  texture.mapping = T.EquirectangularReflectionMapping; texture.colorSpace = T.LinearSRGBColorSpace; texture.needsUpdate = true;
  const generator = new T.PMREMGenerator(renderer);
  try { return generator.fromEquirectangular(texture); } finally { generator.dispose(); texture.dispose(); }
}
