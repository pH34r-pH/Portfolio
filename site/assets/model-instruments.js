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
      button.addEventListener('click', () => {
        if (button.disabled) return;
        this.active = id; this.setMode(this.mode, this.phone); this.changed?.();
      }); this.nav.append(button);
    }
    this.context = root.dataset.modelFocus || 'all';
    this.setContext(this.context, true);
    stage.after(this.nav);
    this.viewButton = make('button', 'machine-depth-view', 'View depth'); this.viewButton.type = 'button';
    this.viewButton.setAttribute('aria-pressed', 'false'); this.viewButton.addEventListener('click', view);
    this.nav.after(this.viewButton);
    this.qualityHint = make('p', 'machine-render-hint'); this.qualityHint.hidden = true; stage.append(this.qualityHint);
    this.setMode('flow', matchMedia('(max-width:720px)').matches);
  }
  panel(id, label, title) {
    const node = make('section', 'machine-glass-panel'); node.dataset.glassPanel = id;
    const heading = make('h3', '', title); heading.id = `model-instrument-${++nextInstrument}`;
    node.setAttribute('aria-labelledby', heading.id); node.append(make('p', 'machine-glass-label', label), heading);
    node.addEventListener('transitionend', event => {
      if (event.target === node && event.propertyName === 'opacity') {
        if (performance.now() - (node.contextTransitionStartedAt || 0) < (node.contextTransitionDuration || 0) - 32) return;
        if (node.dataset.contextActive === 'false') this.finishContextExit(node);
        else this.finishContextEnter(node);
      }
    });
    this.layer.append(node); return node;
  }
  update(node) {
    const changed = this.lastNode !== node.id; this.lastNode = node.id;
    if (!changed) return false;
    this.selection.textContent = `${node.id} · ${node.label}`;
    return changed;
  }
  quality(mode) {
    this.qualityHint.hidden = mode !== 'lightweight';
    this.qualityHint.textContent = mode === 'lightweight' ? 'Lightweight glass / refraction off' : '';
  }
  setMode(mode, phone) {
    this.mode = mode; this.phone = phone; this.host.dataset.instruments = mode;
    this.nav.hidden = !phone || mode === 'flow'; if (this.viewButton) this.viewButton.hidden = this.root.dataset.render !== 'webgl';
    for (const panel of this.layer.children) {
      panel.hidden = mode === 'spatial' && phone && (panel.contextVisible === false
        || (panel.dataset.contextActive !== 'false' && panel.dataset.glassPanel !== this.active));
    }
    for (const button of this.nav.children) {
      button.setAttribute('aria-pressed', String(button.dataset.instrument === this.active));
      button.disabled = Boolean(this.relevant && button.dataset.instrument !== this.relevant);
    }
  }
  finishContextExit(panel) {
    if (panel.dataset.contextActive !== 'false') return;
    clearTimeout(panel.contextExitTimer);
    cancelAnimationFrame(panel.contextExitRaf);
    cancelAnimationFrame(panel.contextExitRaf2);
    panel.contextExitTimer = 0;
    panel.contextExitRaf = panel.contextExitRaf2 = 0;
    panel.contextAnimating = false; panel.contextVisible = false;
    panel.inert = true;
    panel.hidden = Boolean(this.phone && this.mode === 'spatial');
    this.changed?.();
  }
  finishContextEnter(panel) {
    if (panel.dataset.contextActive === 'false') return;
    this.cancelContextExit(panel); panel.contextAnimating = false;
  }
  cancelContextExit(panel) {
    clearTimeout(panel.contextExitTimer);
    cancelAnimationFrame(panel.contextExitRaf);
    cancelAnimationFrame(panel.contextExitRaf2);
    panel.contextExitTimer = 0; panel.contextExitRaf = panel.contextExitRaf2 = 0;
  }
  startContextExit(panel) {
    panel.contextVisible = true;
    panel.contextAnimating = true;
    if (panel.contains(document.activeElement)) this.host.querySelector('[data-machine-stage]')?.focus({preventScroll:true});
    panel.setAttribute('aria-hidden', 'true'); panel.inert = true; panel.style.pointerEvents = 'none';
    const duration = getComputedStyle(panel).transitionDuration.split(',').map(value => {
      const amount = parseFloat(value); return value.trim().endsWith('ms') ? amount : amount * 1000;
    });
    this.beginContextTransition(panel, Math.max(0, ...duration));
  }
  beginContextTransition(panel, duration) {
    panel.contextTransitionStartedAt = performance.now(); panel.contextTransitionDuration = duration;
    this.scheduleContextCompletion(panel, duration);
  }
  scheduleContextCompletion(panel, duration) {
    const wait = duration + 250;
    // Start the fallback after a paint opportunity so synchronous scene work
    // cannot consume the visible transition window.
    panel.contextExitRaf = requestAnimationFrame(() => {
      panel.contextExitRaf2 = requestAnimationFrame(() => {
        panel.contextExitTimer = setTimeout(() => this.finishContextExit(panel), wait);
      });
    });
  }
  startContextEnter(panel, initial, previouslyActive) {
    if (initial || !previouslyActive) this.cancelContextExit(panel);
    panel.contextVisible = true; panel.inert = false; panel.removeAttribute('aria-hidden');
    const entering = !initial && !previouslyActive;
    panel.contextAnimating = entering || (!initial && panel.contextAnimating);
    if (!entering) return;
    const duration = getComputedStyle(panel).transitionDuration.split(',').map(value => {
      const amount = parseFloat(value); return value.trim().endsWith('ms') ? amount : amount * 1000;
    });
    this.beginContextTransition(panel, Math.max(0, ...duration));
  }
  setPanelContext(panel, enters, initial) {
    if (!initial) delete panel.dataset.contextInitial;
    const previouslyActive = panel.dataset.contextActive !== 'false';
    if (enters) this.startContextEnter(panel, initial, previouslyActive);
    else if (initial) {
      panel.contextAnimating = false; panel.contextVisible = false; panel.inert = true;
      panel.setAttribute('aria-hidden', 'true');
    } else if (previouslyActive) {
      this.cancelContextExit(panel); this.startContextExit(panel);
    }
    panel.dataset.contextActive = String(enters);
    panel.style.pointerEvents = enters ? '' : 'none';
    if (this.mode === 'spatial' && this.phone && panel.contextVisible === false) panel.hidden = true;
    else if (enters || panel.contextVisible) panel.hidden = false;
    if (initial) panel.dataset.contextInitial = 'true';
  }
  hasContextAnimation() { return [...this.layer.children].some(panel => panel.contextAnimating); }
  setContext(part, initial = false) {
    this.context = part || 'all';
    const relevant = {
      tokenizer: 'input', input: 'input',
      representation: 'inspect',
      consumer: 'output', output: 'output',
    }[this.context];
    this.relevant = relevant;
    const selection = relevant || this.active;
    const changedSelection = this.phone && selection !== this.active;
    if (this.phone) this.active = selection;
    for (const panel of this.layer.children)
      this.setPanelContext(panel,!relevant || panel.dataset.glassPanel === relevant,initial);
    this.setMode(this.mode, this.phone);
    if (changedSelection) this.changed?.();
  }
  dimensions(phone, width) {
    const sizes = {input: 256, inspect: 268, output: 310};
    return [...this.layer.children].map(node => {
      const w = phone ? Math.min(320, width - 64) : sizes[node.dataset.glassPanel];
      const hidden = node.hidden; node.hidden = false; node.style.width = `${w}px`;
      const height = Math.ceil(node.scrollHeight); node.hidden = hidden;
      return {id: node.dataset.glassPanel, node, width: w, height};
    });
  }
}
