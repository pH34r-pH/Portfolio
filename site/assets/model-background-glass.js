// Homepage prose stays native DOM. An optional physical stage carries each pane on a lit slab.
export class BackgroundGlass {
  constructor(instruments) {
    this.instruments = instruments;
  }
  setQuality() {}
  layout(camera, viewport) {
    this.viewport = viewport;
  }
  sync(camera) {
    this.stage?.sync(camera);
    this.architecture?.sync(camera);
  }
  pulse(value) {
    this.architecture?.pulse(value);
  }
  diagnostics() {
    return { mode: this.stage ? "physical-stage" : "native-document", panels: [], architecture: this.architecture?.diagnostics() ?? null, stage: this.stage?.diagnostics() ?? null };
  }
  dispose() {
    this.stage?.dispose();
    this.architecture?.dispose();
  }
}
