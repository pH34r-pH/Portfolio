// Homepage keeps all replay controls in native reading order, within a disclosure.
export class HomepageInstruments {
  constructor(root, stage, io) {
    this.root = root; this.host = root; this.layer = io; this.active = 'input';
    const controls = root.querySelector('[data-homepage-controls]');
    controls.append(root.querySelector('.machine-replay'), io, root.querySelector('.machine-disclosure'), root.querySelector('.machine-help'));
    stage.tabIndex = -1; stage.removeAttribute('role'); stage.removeAttribute('aria-label');
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
