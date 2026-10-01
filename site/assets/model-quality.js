export class ModelQuality {
  constructor(gl) {
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    this.driver = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '';
    this.software = /swiftshader|llvmpipe|softpipe|software/i.test(this.driver);
    this.requested = 'auto';
  }
  get effective() { return this.requested === 'auto' ? (this.software ? 'lightweight' : 'refraction') : this.requested; }
  set(mode) { if (['auto', 'refraction', 'lightweight'].includes(mode)) this.requested = mode; }
  get lightweight() { return this.effective === 'lightweight'; }
  snapshot() { return {requested:this.requested, effective:this.effective, detectedSoftware:this.software, driverAvailable:Boolean(this.driver)}; }
}
