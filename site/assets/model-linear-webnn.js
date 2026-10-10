export async function createWebNNLinear() {
  if (!navigator.ml || typeof MLGraphBuilder === "undefined") throw new Error("WebNN unavailable");
  const context = await navigator.ml.createContext({ deviceType: "gpu", powerPreference: "high-performance" });
  try {
    const required = ["matmul", "transpose", "add"],
      limits = context.opSupportLimits();
    if (required.some((name) => !limits[name])) throw new Error("WebNN matrix operators unavailable");
    return new WebNNLinear(context);
  } catch (error) {
    context.destroy();
    throw error;
  }
}

class WebNNLinear {
  constructor(context) {
    this.name = "webnn-hybrid";
    this.context = context;
    this.cache = new Map();
    this.weights = new WeakMap();
    this.nextId = 0;
  }
  async graph(rows, inputWidth, outputWidth, weight, bias) {
    if (!this.weights.has(weight)) this.weights.set(weight, ++this.nextId);
    const key = `${this.weights.get(weight)}:${rows}:${inputWidth}:${outputWidth}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const builder = new MLGraphBuilder(this.context),
      inputShape = [rows, inputWidth],
      outputShape = [rows, outputWidth];
    const input = builder.input("input", { dataType: "float32", shape: inputShape });
    const weights = builder.constant({ dataType: "float32", shape: [outputWidth, inputWidth] }, weight);
    const offset = builder.constant({ dataType: "float32", shape: [outputWidth] }, bias);
    const output = builder.add(builder.matmul(input, builder.transpose(weights, { permutation: [1, 0] })), offset);
    const graph = await builder.build({ output });
    const tensors = {
      input: await this.context.createTensor({ dataType: "float32", shape: inputShape, writable: true }),
      output: await this.context.createTensor({ dataType: "float32", shape: outputShape, readable: true }),
    };
    const item = { graph, ...tensors };
    this.cache.set(key, item);
    if (this.cache.size > 24) {
      const first = this.cache.keys().next().value;
      this.destroy(this.cache.get(first));
      this.cache.delete(first);
    }
    return item;
  }
  async linear(input, rows, inputWidth, outputWidth, weight, bias) {
    const item = await this.graph(rows, inputWidth, outputWidth, weight, bias);
    this.context.writeTensor(item.input, input);
    this.context.dispatch(item.graph, { input: item.input }, { output: item.output });
    return new Float32Array(await this.context.readTensor(item.output));
  }
  destroy(item) {
    item.graph.destroy();
    item.input.destroy();
    item.output.destroy();
  }
  dispose() {
    this.cache.forEach((item) => this.destroy(item));
    this.cache.clear();
    this.context.destroy();
  }
}
