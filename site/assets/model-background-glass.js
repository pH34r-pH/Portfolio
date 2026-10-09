// Homepage prose uses native CSS glass. The background has no duplicate planes.
export class BackgroundGlass {
  constructor(instruments) {
    this.instruments = instruments;
  }
  setQuality() {}
  layout(camera, viewport) {
    this.viewport = viewport;
  }
  sync() {}
  pulse() {}
  diagnostics() {
    return { mode: "native-document", panels: [] };
  }
  dispose() {}
}
