let nextInstrument = 0;
const make = (tag, className, text) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Native controls are moved once, never painted into a texture or duplicated.
export class ModelInstruments {
  constructor(root, stage, io, inspect, view) {
    this.root = root; this.active = 'input'; this.mode = 'flow';
    this.host = make('div', 'machine-spatial-host'); stage.before(this.host); this.host.append(stage, io);
    this.host.dataset.instruments = 'flow'; this.layer = io; io.className = 'machine-instruments';
    const form = root.querySelector('[data-machine-form]'), output = root.querySelector('.machine-output');
    const input = this.panel('input', '01 / INPUT', 'A byte enters the block.'); input.append(form);
    const probe = this.panel('inspect', '02 / COORDINATE', 'One coordinate. One time slice.');
    this.selection = make('p', 'machine-glass-selection'); probe.append(this.selection);
    const inspectButton = make('button', '', 'Inspect coordinate'); inspectButton.type = 'button';
    inspectButton.addEventListener('click', inspect); probe.append(inspectButton);
    const readout = this.panel('output', '03 / OUTPUT', 'A scripted byte returns.'); readout.append(output);
    const note = make('p', 'machine-glass-note', 'Deterministic teaching replay · first 12 UTF-8 bytes'); readout.append(note);
    this.nav = make('div', 'machine-instrument-nav'); this.nav.setAttribute('role', 'group');
    this.nav.setAttribute('aria-label', 'Visible instrument');
    for (const [id, label] of [['input', 'Input'], ['inspect', 'Coordinate'], ['output', 'Output']]) {
      const button = make('button', '', label); button.type = 'button'; button.dataset.instrument = id;
      button.addEventListener('click', () => { this.active = id; this.changed?.(); }); this.nav.append(button);
    }
    stage.after(this.nav);
    this.viewButton = make('button', 'machine-depth-view', 'View depth'); this.viewButton.type = 'button';
    this.viewButton.setAttribute('aria-pressed', 'false'); this.viewButton.addEventListener('click', view);
    this.nav.after(this.viewButton);
    this.setMode('flow', matchMedia('(max-width:720px)').matches);
  }
  panel(id, label, title) {
    const node = make('section', 'machine-glass-panel'); node.dataset.glassPanel = id;
    const heading = make('h3', '', title); heading.id = `model-instrument-${++nextInstrument}`;
    node.setAttribute('aria-labelledby', heading.id); node.append(make('p', 'machine-glass-label', label), heading);
    this.layer.append(node); return node;
  }
  update(node) {
    const changed = this.lastNode !== node.id; this.lastNode = node.id;
    this.selection.textContent = `${node.id} · ${node.label}`;
    return changed;
  }
  setMode(mode, phone) {
    this.mode = mode; this.host.dataset.instruments = mode;
    this.nav.hidden = !phone || mode === 'flow'; this.viewButton.hidden = mode === 'flow';
    for (const panel of this.layer.children) panel.hidden = mode === 'spatial' && phone && panel.dataset.glassPanel !== this.active;
    for (const button of this.nav.children) button.setAttribute('aria-pressed', String(button.dataset.instrument === this.active));
  }
  dimensions(phone, width) {
    const sizes = {input: 256, inspect: 268, output: 310};
    return [...this.layer.children].map(node => {
      const w = phone ? Math.min(320, width - 48) : sizes[node.dataset.glassPanel];
      const hidden = node.hidden; node.hidden = false; node.style.width = `${w}px`;
      const height = Math.ceil(node.scrollHeight); node.hidden = hidden;
      return {id: node.dataset.glassPanel, node, width: w, height};
    });
  }
}
