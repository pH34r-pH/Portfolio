// All panes reflect the same stationary light above the reader's left shoulder.
const surfaces = '.digital-pane,.card,.notebook-content,.machine-glass-panel,.topology-detail,.topology-accessible,.standard-card,.article-execution,.experiment-table-wrap';
const visible = new Set();
let raf = 0, surfaceIndex = 0;

// SVG backdrop displacement currently has gaps outside Chromium. Other engines
// retain the CSS optical blur; none of these filters ever filter native glyphs.
const chromium = navigator.userAgentData?.brands?.some(({brand}) => brand === 'Chromium') || /(?:Chrome|Chromium)\//.test(navigator.userAgent);
const refracts = chromium && CSS.supports('backdrop-filter', 'url("#portfolio-glass-optics-0")');
function svgNode(tag, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}
function mountOptics() {
  if (!refracts) return;
  const svg = svgNode('svg', {class: 'material-optics', 'aria-hidden': 'true', width: '0', height: '0'});
  const defs = svgNode('defs', {});
  [19, 37, 61].forEach((seed, index) => {
    const filter = svgNode('filter', {id: `portfolio-glass-optics-${index}`, x: '-1%', y: '-1%', width: '102%', height: '102%', 'color-interpolation-filters': 'sRGB'});
    // A single low-frequency octave supplies broad, stationary optical waviness.
    // The map is never painted: it moves backdrop samples by at most 1.2 CSS px.
    filter.append(svgNode('feTurbulence', {type: 'fractalNoise', baseFrequency: '.005 .007', numOctaves: '1', seed: String(seed), result: 'glass-form'}));
    filter.append(svgNode('feDisplacementMap', {in: 'SourceGraphic', in2: 'glass-form', scale: '2.4', xChannelSelector: 'R', yChannelSelector: 'G'}));
    defs.append(filter);
  });
  svg.append(defs); document.body.prepend(svg);
}
function updateLighting() {
  raf = 0;
  // Read first, write second. Scroll/resize events request one update; no idle RAF.
  const positions = [...visible].map(node => ({node, bounds: node.getBoundingClientRect()}));
  for (const {node, bounds} of positions) {
    node.style.setProperty('--surface-light-x', `${Math.round(innerWidth * .24 - bounds.left)}px`);
    node.style.setProperty('--surface-light-y', `${Math.round(76 - bounds.top)}px`);
  }
}
function scheduleLighting() {
  if (!raf && !document.hidden) raf = requestAnimationFrame(updateLighting);
}
const visibility = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) visible.add(entry.target);
    else visible.delete(entry.target);
  }
  scheduleLighting();
}, {rootMargin: '96px'});
const sizes = new ResizeObserver(scheduleLighting);
function mountSurface(node) {
  if (!node.matches(surfaces)) return;
  visibility.observe(node); sizes.observe(node);
  if (node.classList.contains('material-surface')) return;
  node.classList.add('material-surface');
  if (refracts && node.matches('.digital-pane,.machine-glass-panel')) {
    node.style.setProperty('--material-refraction', `url("#portfolio-glass-optics-${surfaceIndex++ % 3}") blur(1.35px)`);
  }
  const edge = document.createElement('span');
  edge.className = 'material-edge'; edge.setAttribute('aria-hidden', 'true');
  for (const corner of ['tl', 'tr', 'br', 'bl']) {
    const joint = document.createElement('i'); joint.className = `material-corner material-corner-${corner}`;
    edge.append(joint);
  }
  node.append(edge);
}
mountOptics();
document.querySelectorAll(surfaces).forEach(mountSurface);
const surfaceObserver = new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE || node.classList.contains('material-edge')) continue;
      mountSurface(node); node.querySelectorAll(surfaces).forEach(mountSurface);
    }
    for (const node of record.removedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE || node.isConnected) continue;
      for (const surface of [node, ...node.querySelectorAll('.material-surface')]) {
        visible.delete(surface); visibility.unobserve(surface); sizes.unobserve(surface);
      }
    }
  }
});
surfaceObserver.observe(document.body, {childList: true, subtree: true});
for (const type of ['scroll', 'resize', 'pageshow']) addEventListener(type, scheduleLighting, {passive: true});
document.querySelector('[data-digital-home]')?.addEventListener('portfolio:reading', scheduleLighting);
document.addEventListener('visibilitychange', scheduleLighting);
addEventListener('pagehide', () => {
  cancelAnimationFrame(raf);
  raf = 0;
});
