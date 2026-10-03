const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)] ?? null;

// CPU submission time is not GPU completion or a physical-device FPS claim.
export class RenderMetrics {
  constructor(renderer) {
    this.gl = renderer.getContext(); this.extension = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.cpu = []; this.gpu = []; this.pending = []; this.frameCPU = [];
  }
  begin() {
    this.poll(); this.started = performance.now();
    if (this.extension && this.pending.length < 4) {
      this.query = this.gl.createQuery(); this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, this.query);
    }
  }
  end() {
    this.add(this.cpu, performance.now() - this.started);
    if (this.query) {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT); this.pending.push(this.query); this.query = null;
    }
  }
  add(list, value) { list.push(value); if (list.length > 180) list.shift(); }
  poll() {
    const gl = this.gl, ext = this.extension;
    if (!ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    this.pending = this.pending.filter(query => {
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!disjoint) this.add(this.gpu, gl.getQueryParameter(query, gl.QUERY_RESULT) * .000001);
      gl.deleteQuery(query); return false;
    });
    if (disjoint) this.gpu.length = 0;
  }
  snapshot() {
    const summarize = values => ({samples: values.length, p50: percentile(values, .5), p95: percentile(values, .95)});
    return {cpuRenderSubmissionMs: summarize(this.cpu), cpuFrameUpdateMs: summarize(this.frameCPU), gpuRenderMs: summarize(this.gpu), gpuTimerSupported: Boolean(this.extension)};
  }
  dispose() { this.pending.forEach(query => this.gl.deleteQuery(query)); this.pending.length = 0; }
}
