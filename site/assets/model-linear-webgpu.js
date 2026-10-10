const shader = `struct Shape { rows:u32, inputWidth:u32, outputWidth:u32, padding:u32 }
@group(0) @binding(0) var<storage,read> input:array<f32>;
@group(0) @binding(1) var<storage,read> weight:array<f32>;
@group(0) @binding(2) var<storage,read> bias:array<f32>;
@group(0) @binding(3) var<storage,read_write> output:array<f32>;
@group(0) @binding(4) var<uniform> shape:Shape;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>) {
  let index=id.x;if(index>=shape.rows*shape.outputWidth){return;}
  let row=index/shape.outputWidth;let column=index%shape.outputWidth;
  var sum=bias[column];
  for(var i=0u;i<shape.inputWidth;i++){sum+=input[row*shape.inputWidth+i]*weight[column*shape.inputWidth+i];}
  output[index]=sum;
}`;

export async function createWebGPULinear() {
  if (!navigator.gpu) throw new Error("WebGPU compute unavailable");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No usable WebGPU compute adapter");
  const device = await adapter.requestDevice();
  try {
    const module = device.createShaderModule({ code: shader });
    const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "main" } });
    return new WebGPULinear(device, pipeline);
  } catch (error) {
    device.destroy();
    throw error;
  }
}

class WebGPULinear {
  constructor(device, pipeline) {
    this.name = "webgpu-hybrid";
    this.device = device;
    this.pipeline = pipeline;
    this.weights = new WeakMap();
    this.owned = new Set();
    this.capacity = 129 * 512 * 4;
    this.input = this.buffer(this.capacity, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    this.output = this.buffer(this.capacity, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    this.readback = this.buffer(this.capacity, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
    this.shape = this.buffer(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    device.lost.then((info) => {
      if (info.reason !== "destroyed") this.lost = true;
    });
  }
  buffer(size, usage) {
    const buffer = this.device.createBuffer({ size, usage });
    this.owned.add(buffer);
    return buffer;
  }
  constant(values) {
    let buffer = this.weights.get(values);
    if (!buffer) {
      buffer = this.buffer(values.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
      this.device.queue.writeBuffer(buffer, 0, values);
      this.weights.set(values, buffer);
    }
    return buffer;
  }
  async linear(input, rows, inputWidth, outputWidth, weight, bias) {
    if (this.lost) throw new Error("WebGPU compute device lost");
    const bytes = rows * outputWidth * 4;
    if (bytes > this.capacity || input.byteLength > this.capacity) throw new Error("Unsupported matrix shape");
    const resources = [this.input, this.constant(weight), this.constant(bias), this.output, this.shape];
    const group = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: resources.map((buffer, binding) => ({ binding, resource: { buffer } })) });
    this.device.queue.writeBuffer(this.input, 0, input);
    this.device.queue.writeBuffer(this.shape, 0, new Uint32Array([rows, inputWidth, outputWidth, 0]));
    const encoder = this.device.createCommandEncoder(),
      pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil((rows * outputWidth) / 64));
    pass.end();
    encoder.copyBufferToBuffer(this.output, 0, this.readback, 0, bytes);
    this.device.queue.submit([encoder.finish()]);
    await this.readback.mapAsync(GPUMapMode.READ, 0, bytes);
    const result = new Float32Array(this.readback.getMappedRange(0, bytes).slice(0));
    this.readback.unmap();
    return result;
  }
  dispose() {
    this.owned.forEach((buffer) => buffer.destroy());
    this.device.destroy();
  }
}
