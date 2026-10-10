// Pointer lighting changes the reflection, never the content's position.
const enabled = matchMedia("(hover:hover) and (pointer:fine)");
const quiet = matchMedia("(prefers-reduced-motion:reduce)");
let raf = 0,
  pane,
  point;
document.addEventListener(
  "pointermove",
  (event) => {
    if (!enabled.matches || quiet.matches) return;
    const target = event.target.closest(".digital-pane,.card,.machine-glass-panel");
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
