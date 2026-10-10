export class ModelQuality {
  static webGPU(adapter, device) {
    const quality = Object.create(ModelQuality.prototype);
    quality.requested = 'auto'; quality.backend = 'webgpu';
    quality.driver = `${adapter.info?.vendor || 'unavailable'} ${adapter.info?.architecture || ''}`.trim();
    quality.contextAttributes = {alpha:true, antialias:true, powerPreference:'high-performance'};
    quality.sampleSupport = {defaultFramebufferSamples:4, maxSamples:4, antialias:true};
    const limit = device.limits.maxTextureDimension2D;
    quality.limits = {maxTextureSize:limit, maxRenderbufferSize:limit, maxViewport:[limit,limit], maxTargetDimension:limit};
    return quality;
  }
  constructor(gl) {
    this.backend = 'webgl2';
    const attributes = gl.getContextAttributes() || {};
    const samples = gl.getParameter(gl.SAMPLES);
    const maxSamples = gl.getParameter(gl.MAX_SAMPLES);
    const maxViewport = Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS));
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    this.driver = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '';
    this.contextAttributes = attributes;
    this.sampleSupport = {defaultFramebufferSamples:samples, maxSamples, antialias:attributes.antialias === true};
    this.limits = {maxTextureSize, maxRenderbufferSize, maxViewport, maxTargetDimension:Math.min(maxTextureSize,maxRenderbufferSize,...maxViewport)};
    if (!this.sampleSupport.antialias || samples < 1) throw new Error('WebGL2 multisample antialiasing is unavailable');
    this.requested = 'auto';
  }
  get effective() { return this.requested === 'auto' ? 'refraction' : this.requested; }
  set(mode) { if (['auto', 'refraction', 'lightweight'].includes(mode)) this.requested = mode; }
  get lightweight() { return this.effective === 'lightweight'; }
  snapshot() {
    return {backend:this.backend, requested:this.requested, effective:this.effective, driver:this.driver || 'unavailable', contextAttributes:this.contextAttributes,
      sampleSupport:this.sampleSupport, limits:this.limits};
  }
}
