// Let the generated model follow the focused article section. The controller
// owns all camera and rendering input; this module only reports heading
// context through its existing event seam.
for (const model of document.querySelectorAll(".myst-reader .article-model-machine[data-model-machine]")) {
  const article = model.closest(".myst-reader");
  const stage = model.querySelector("[data-machine-stage]");
  let host = model.querySelector(".machine-spatial-host");
  if (!article || !stage) continue;
  const headings = [...article.querySelectorAll("[data-model-context]")];
  if (!headings.length) continue;

  const initialHost = host;
  let context = model.dataset.modelFocus || "all";
  let headingIdentity='';
  let observer;
  let frame = 0;
  model.dataset.articleContext = context;

  function focusLine() {
    const header = document.querySelector(".topbar");
    const headerHeight = header?.getBoundingClientRect().height
      || Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--2071-header"))
      || 58;
    if(model.dataset.viewerHidden==='true'||model.dataset.viewerPinned==='false')return headerHeight+innerHeight*.25;
    const spatial = Boolean(host)&&(host.dataset.instruments === "spatial"||model.dataset.modelReaderLayout==='true');
    const targetHeight = spatial ? host.getBoundingClientRect().height : stage.getBoundingClientRect().height;
    const readingGap = spatial ? 28 : 72;
    const controls=model.querySelector('.article-model-toolbar')?.getBoundingClientRect().height||0;
    return Math.min(Math.max(0, innerHeight - 3), headerHeight + controls + 12 + (targetHeight || 280) + readingGap);
  }

  function updateContext() {
    frame = 0;
    if(model.dataset.modelFollow==='false')return;
    const line = focusLine();
    const active = headings.filter(heading => heading.getBoundingClientRect().top <= line).at(-1);
    const next = active?.dataset.modelContext || model.dataset.modelFocus || "all";
    const identity=active?.id||'';
    if (next === context&&identity===headingIdentity) return;
    context = next;
    headingIdentity=identity;
    model.dataset.articleContext = context;
    model.dataset.articleHeading=identity;
    model.dispatchEvent(new CustomEvent("portfolio:model-focus", {
      detail: { part: context, source: "article",headingId:identity,title:active?.textContent.trim(),summary:active?.nextElementSibling?.tagName==='P'?active.nextElementSibling.textContent.trim().slice(0,280):'' },
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
  if (host) layoutObserver.observe(host);
  observeAtCurrentSize();
  model.addEventListener("portfolio:model-ready", () => {
    host = model.querySelector(".machine-spatial-host");
    if (host && host !== initialHost) layoutObserver.observe(host);
    headingIdentity='';
    observeAtCurrentSize();
  });
  for(const event of ['portfolio:article-follow','portfolio:article-layout','portfolio:model-visibility'])model.addEventListener(event,()=>{headingIdentity='';observeAtCurrentSize();});
  window.addEventListener("resize", observeAtCurrentSize, { passive: true });
  window.addEventListener("orientationchange", observeAtCurrentSize, { passive: true });
  window.addEventListener("pageshow", observeAtCurrentSize, { passive: true });
  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("hashchange", scheduleUpdate, { passive: true });
  window.addEventListener("popstate", scheduleUpdate, { passive: true });
}
