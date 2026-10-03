// Reuse the shared replay controls beside the dedicated homepage viewer.
export class HomepageInstruments {
  constructor(root, stage, io) {
    this.root = root; this.host = stage; this.layer = io; this.active = 'input';
    const controls = root.querySelector('[data-homepage-controls]');
    controls.prepend(root.querySelector('.machine-replay'));
    root.querySelector('.digital-replay-disclosure > div').append(io, root.querySelector('.machine-disclosure'), root.querySelector('.machine-help'));
    this.viewButton = document.createElement('button'); this.viewButton.hidden = true;
    this.qualityHint = document.createElement('p'); this.qualityHint.className = 'digital-quality-hint';
    controls.prepend(this.qualityHint); this.quality('auto');
  }
  update() { return false; }
  dimensions() { return []; }
  setMode(mode) { this.root.dataset.instruments = mode; }
  quality(mode) {
    this.qualityHint.hidden = mode !== 'lightweight';
    this.qualityHint.textContent = 'Lightweight display · refraction off';
  }
}
