// Let the generated model follow the focused article section. The controller
// owns all camera and rendering input; this module only reports heading
// context through its existing event seam.
for (const model of document.querySelectorAll(".myst-reader .article-model-machine[data-model-machine]")) {
  const article = model.closest(".myst-reader");
  const stage = model.querySelector("[data-machine-stage]");
  const host = model.querySelector(".machine-spatial-host");
  if (!article || !stage || !host) continue;
  const headings = [...article.querySelectorAll("[data-model-context]")];
  if (!headings.length) continue;

  let context = model.dataset.modelFocus || "all";
  let observer;
  let frame = 0;
  model.dataset.articleContext = context;

  function focusLine() {
    const header = document.querySelector(".topbar");
    const headerHeight = header?.getBoundingClientRect().height
      || Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--2071-header"))
      || 58;
    const spatial = host.dataset.instruments === "spatial";
    const targetHeight = spatial ? host.getBoundingClientRect().height : stage.getBoundingClientRect().height;
    const readingGap = spatial ? 28 : 72;
    return Math.min(Math.max(0, innerHeight - 3), headerHeight + (targetHeight || 280) + readingGap);
  }

  function updateContext() {
    frame = 0;
    const line = focusLine();
    const active = headings.filter(heading => heading.getBoundingClientRect().top <= line).at(-1);
    const next = active?.dataset.modelContext || model.dataset.modelFocus || "all";
    if (next === context) return;
    context = next;
    model.dataset.articleContext = context;
    model.dispatchEvent(new CustomEvent("portfolio:model-focus", {
      detail: { part: context, source: "article" },
    }));
  }

  function scheduleUpdate() {
    if (!frame) frame = requestAnimationFrame(updateContext);
  }

  function observeAtCurrentSize() {
    observer?.disconnect();
    const line = focusLine();
    const topInset = Math.max(0, Math.min(innerHeight - 3, Math.round(line)));
    const bottomInset = Math.max(0, Math.round(innerHeight - topInset - 2));
    observer = new IntersectionObserver(scheduleUpdate, {
      rootMargin: `-${topInset}px 0px -${bottomInset}px 0px`,
      threshold: 0,
    });
    headings.forEach(heading => observer.observe(heading));
    scheduleUpdate();
  }

  const layoutObserver = new ResizeObserver(observeAtCurrentSize);
  layoutObserver.observe(stage);
  layoutObserver.observe(host);
  observeAtCurrentSize();
  window.addEventListener("resize", observeAtCurrentSize, { passive: true });
  window.addEventListener("orientationchange", observeAtCurrentSize, { passive: true });
  window.addEventListener("pageshow", observeAtCurrentSize, { passive: true });
  window.addEventListener("hashchange", scheduleUpdate, { passive: true });
  window.addEventListener("popstate", scheduleUpdate, { passive: true });
}
