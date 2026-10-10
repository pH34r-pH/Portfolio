import { vertex, fragment } from "./carpentry-shaders.js";

// One small GL context serves every native UI surface. The copied canvases are
// presentation targets; every face is rendered from the same 3D solid shader.
export class CarpentryRenderer {
  constructor(image) {
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl2", {
      alpha: true,
      depth: false,
      antialias: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    if (!this.gl) throw Error("Carpentry WebGL2 unavailable");
    const gl = this.gl;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    this.adapter = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    this.timings = [];
    this.program = gl.createProgram();
    const shaders = [this.shader(gl.VERTEX_SHADER, vertex), this.shader(gl.FRAGMENT_SHADER, fragment)];
    shaders.forEach((shader) => gl.attachShader(this.program, shader));
    gl.linkProgram(this.program);
    shaders.forEach((shader) => gl.deleteShader(shader));
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.locations = Object.fromEntries(["shape", "windowRect", "state", "lighting", "seed", "density"].map((name) => [name, gl.getUniformLocation(this.program, name)]));
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.LINEAR);
    for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.CLAMP_TO_EDGE);
    this.limit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
    this.frames = 0;
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
    });
  }
  shader(type, source) {
    const gl = this.gl,
      shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  render(surface) {
    const began = performance.now();
    if (this.lost) throw Error("Carpentry context lost");
    const gl = this.gl,
      { canvas, rect, crop } = surface;
    const dpr = Math.min(devicePixelRatio || 1, this.limit / crop.width, this.limit / crop.height);
    const width = Math.round(crop.width * dpr),
      height = Math.round(crop.height * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.uniform4f(this.locations.shape, rect.width, rect.height, surface.rail, surface.frame ? 1 : 0);
    gl.uniform4f(this.locations.windowRect, crop.x, crop.y, crop.width, crop.height);
    gl.uniform4f(this.locations.state, surface.press, surface.hover ? 1 : 0, surface.selected ? 1 : 0, document.documentElement.dataset.theme === "dark" ? 1 : 0);
    gl.uniform3f(this.locations.lighting, surface.light.x * 0.24, surface.light.y * 0.24, window.PortfolioModelLight?.energy || 0);
    gl.uniform1f(this.locations.seed, surface.seed);
    gl.uniform1f(this.locations.density, dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, width, height);
    context.drawImage(this.canvas, 0, 0);
    this.frames++;
    this.timings.push(performance.now() - began);
    if (this.timings.length > 60) this.timings.shift();
  }
  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
