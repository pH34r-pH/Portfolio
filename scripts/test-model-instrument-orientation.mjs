import assert from 'node:assert/strict';
import { ModelInstruments } from '../site/assets/model-instruments.js';
import { SharedGlass } from '../site/assets/model-glass.js';
import { HomepageInstruments } from '../site/assets/homepage-instruments.js';
import { HomepageScreens } from '../site/assets/homepage-screens.js';

// Settled context changes do not need animation scheduling in this DOM fixture.
globalThis.cancelAnimationFrame = () => {};

function control(dataset) {
  return {
    dataset, style: {}, attributes: {}, hidden: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  };
}

function instruments() {
  const model = Object.create(ModelInstruments.prototype);
  const ids = ['input', 'inspect', 'output'];
  Object.assign(model, {
    active: 'input', mode: 'flow', phone: true,
    root: { dataset: { render: 'webgl' } },
    host: { dataset: {}, querySelector: () => ({}) },
    layer: { children: ids.map(id => control({ glassPanel: id })) },
    nav: { children: ids.map(id => control({ instrument: id })) },
    viewButton: control({}),
  });
  model.setContext('tokenizer', true);
  return model;
}

function glassFor(model) {
  const glass = Object.create(SharedGlass.prototype);
  Object.assign(glass, {
    instruments: model, panels: [],
    viewport: { width: 356, height: 188 }, phone: true,
  });
  return glass;
}

function panelsFor(model) {
  return model.layer.children.map(node => ({
    id: node.dataset.glassPanel, node,
    // A real narrow article cannot fit the full form into its short canvas.
    projection: { scale: 1, corners: [[12, 12], [300, 12], [300, 300], [12, 300]] },
  }));
}

function assertPhoneContext(model, expected) {
  assert.equal(model.active, expected, 'Phone selection follows the current article context');
  const glass = glassFor(model);
  glass.panels = panelsFor(model);
  const visible = glass.visiblePanels();
  assert.deepEqual(visible.map(panel => panel.id), [expected], 'The relevant phone pane remains visible');
  assert.equal(glass.layoutFits(visible), false, 'A missing pane cannot falsely pass the spatial fit check');
  assert.deepEqual(model.nav.children.filter(button => button.attributes['aria-pressed'] === 'true')
    .map(button => button.dataset.instrument), [expected]);
}

function landscapeToPhone(part, expected) {
  const model = instruments();
  model.setMode('flow', false);
  model.setContext(part, true);
  assert.equal(model.active, 'input', 'Landscape context changes preserve the last manual selection');
  assert.equal(model.relevant, expected);

  // The mode switch itself must reconcile selection before hiding any panes.
  model.setMode('spatial', true);
  assertPhoneContext(model, expected);
  assert.equal(model.layer.children.find(panel => panel.dataset.glassPanel === expected).hidden, false);
}

for (const [part, pane] of [['representation', 'inspect'], ['output', 'output'], ['consumer', 'output']]) {
  landscapeToPhone(part, pane);
}

// The renderer must reconcile before its first post-rotation dimensions/fit
// pass, rather than briefly accepting an empty list with Array.every().
{
  const model = instruments();
  model.setMode('flow', false);
  model.setContext('output', true);
  const glass = glassFor(model);
  let measured = false;
  model.dimensions = phone => {
    assert.equal(phone, true);
    assert.equal(model.phone, true);
    assertPhoneContext(model, 'output');
    measured = true;
    return [];
  };
  glass.layout(null, glass.viewport, 10, true);
  assert.equal(measured, true, 'Orientation selection is verified at the real layout entry point');
}

// All-context articles keep the user's chosen pane; desktop keeps its selection.
{
  const model = instruments();
  model.active = 'output';
  model.setContext('all', true);
  model.setMode('spatial', true);
  assert.equal(model.active, 'output');
  model.setMode('flow', false);
  model.setContext('representation', true);
  model.setMode('spatial', false);
  assert.equal(model.active, 'output');
}

// Reconciling the incoming pane must not discard outgoing transition planes.
{
  const model = instruments();
  model.setMode('flow', false);
  model.setContext('output', true);
  const input = model.layer.children[0];
  input.contextVisible = true;
  input.contextAnimating = true;
  model.setMode('spatial', true);
  const glass = glassFor(model);
  glass.panels = panelsFor(model);
  assert.deepEqual(glass.visiblePanels().map(panel => panel.id), ['input', 'output']);
}

// Home has its own layout override and an adapter with no .mode property.
// Its initial and rotated layouts must never enter the article pre-fit hook.
{
  const home = Object.create(HomepageInstruments.prototype);
  home.root = { dataset: { instruments: 'native-scroll' } };
  const screens = Object.create(HomepageScreens.prototype);
  class Geometry {}
  class Mesh {
    constructor(geometry) { this.geometry = geometry; }
  }
  Object.assign(screens, {
    instruments: home, panels: [], material: {},
    trimMaterial: { color: { set() {} } }, scene: { add() {} },
    T: { Mesh, PlaneGeometry: Geometry, EdgesGeometry: Geometry, LineSegments: Mesh },
  });
  assert.equal(home.mode, undefined);
  screens.layout(null, { width: 360, height: 800 }, 10);
  screens.layout(null, { width: 915, height: 412 }, 10);
  assert.equal(home.root.dataset.instruments, 'native-scroll');
  assert.equal(screens.panels.length, 3);
  assert.deepEqual(screens.viewport, { width: 915, height: 412 });
}

console.log('Instrument orientation: context selection, pre-fit ordering, preserved selections, exit planes and Home passed');
