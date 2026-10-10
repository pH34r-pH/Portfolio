// Homepage prose uses native CSS glass. The background has no duplicate planes.
export class BackgroundGlass {
  constructor(instruments) {
    this.instruments = instruments;
  }
  setQuality() {}
  layout(camera, viewport) {
    this.viewport = viewport;
  }
  sync(camera) {
    this.architecture?.sync(camera);
  }
  pulse(value) {
    this.architecture?.pulse(value);
  }
  diagnostics() {
    return { mode: "native-document", panels: [], architecture: this.architecture?.diagnostics() ?? null };
  }
  dispose() {
    this.architecture?.dispose();
  }
}
