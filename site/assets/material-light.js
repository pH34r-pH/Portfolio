// Pointer lighting changes the reflection, never the content's position.
const surfaces = '.digital-pane,.card,.notebook-content,.machine-glass-panel,.topology-detail,.topology-accessible,.standard-card,.article-execution,.experiment-table-wrap';
function mountEdges(node) {
  if (!node.matches(surfaces) || node.querySelector(':scope > .material-edge')) return;
  const edge = document.createElement('span');
  edge.className = 'material-edge'; edge.setAttribute('aria-hidden', 'true');
  for (const corner of ['tl', 'tr', 'br', 'bl']) {
    const joint = document.createElement('i'); joint.className = `material-corner material-corner-${corner}`;
    edge.append(joint);
  }
  node.append(edge);
}
document.querySelectorAll(surfaces).forEach(mountEdges);
const surfaceObserver = new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) {
    if (node.nodeType !== Node.ELEMENT_NODE || node.classList.contains('material-edge')) continue;
    mountEdges(node); node.querySelectorAll(surfaces).forEach(mountEdges);
  }
});
surfaceObserver.observe(document.body, {childList: true, subtree: true});
const enabled = matchMedia("(hover:hover) and (pointer:fine)");
const quiet = matchMedia("(prefers-reduced-motion:reduce)");
let raf = 0,
  pane,
  point;
document.addEventListener(
  "pointermove",
  (event) => {
    if (!enabled.matches || quiet.matches) return;
    const target = event.target.closest(surfaces);
    if (!target) return;
    pane = target;
    point = { x: event.clientX, y: event.clientY };
    if (!raf)
      raf = requestAnimationFrame(() => {
        raf = 0;
        const bounds = pane.getBoundingClientRect();
        pane.style.setProperty("--surface-light-x", `${((point.x - bounds.left) / bounds.width) * 100}%`);
        pane.style.setProperty("--surface-light-y", `${((point.y - bounds.top) / bounds.height) * 100}%`);
      });
  },
  { passive: true },
);
addEventListener("pagehide", () => {
  cancelAnimationFrame(raf);
  raf = 0;
});
