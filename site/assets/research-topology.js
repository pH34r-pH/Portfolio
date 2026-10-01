const root = document.querySelector("[data-research-topology]");

if (root) {
  const nodesLayer = root.querySelector("[data-topology-nodes]");
  const edgesLayer = root.querySelector("[data-topology-edges]");
  const detail = document.querySelector("[data-topology-detail]");
  const list = document.querySelector("[data-topology-list]");
  let articles = [];
  let dependencies = new Map();
  let children = new Map();
  let buttons = new Map();

  const safe = (value) => typeof value === "string" ? value : "";

  function computeDepth(article, bySlug, memo = new Map(), visiting = new Set()) {
    if (memo.has(article.slug)) return memo.get(article.slug);
    if (visiting.has(article.slug)) return 0;
    visiting.add(article.slug);
    const deps = (article.dependsOn || []).map((slug) => bySlug.get(slug)).filter(Boolean);
    const depth = deps.length ? Math.max(...deps.map((dep) => computeDepth(dep, bySlug, memo, visiting))) + 1 : 0;
    visiting.delete(article.slug);
    memo.set(article.slug, depth);
    return depth;
  }

  function buildRelations(items) {
    const bySlug = new Map(items.map((article) => [article.slug, article]));
    dependencies = new Map();
    children = new Map(items.map((article) => [article.slug, []]));
    for (const article of items) {
      const deps = (article.dependsOn || []).filter((slug) => bySlug.has(slug));
      dependencies.set(article.slug, deps);
      for (const dep of deps) children.get(dep)?.push(article.slug);
    }
    const memo = new Map();
    return items.map((article) => ({
      ...article,
      topologyDepth: computeDepth(article, bySlug, memo),
    }));
  }

  function nodeLabel(article) {
    return article.shortTitle || article.title?.replace(/^Milestone\s+\d+\s+[—-]\s+/i, "") || article.slug;
  }

  function createNode(article, row) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "topology-node";
    button.dataset.slug = article.slug;
    if (article.frontierOpen?.length || article.frontierNext?.length) button.dataset.frontier = "true";
    button.style.gridColumn = String(article.topologyDepth + 1);
    button.style.gridRow = String(row + 1);
    button.innerHTML = `<span class="topology-node-sequence">${String(article.sequence || row + 1).padStart(2, "0")}</span><strong></strong><small></small>`;
    button.querySelector("strong").textContent = nodeLabel(article);
    const focus = [article.modelFocus, article.modelVariant].filter(Boolean).join(" / ");
    button.querySelector("small").textContent = focus || "research milestone";
    button.setAttribute("aria-label", `${nodeLabel(article)}. ${focus || "Research milestone"}`);
    button.addEventListener("click", () => select(article.slug, true));
    button.addEventListener("keydown", (event) => {
      const ordered = [...buttons.values()];
      const index = ordered.indexOf(button);
      if (index < 0) return;
      let nextIndex = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex += 1;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex -= 1;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = ordered.length - 1;
      if (nextIndex === index || nextIndex < 0 || nextIndex >= ordered.length) return;
      event.preventDefault();
      ordered[nextIndex].focus();
      select(ordered[nextIndex].dataset.slug, false);
    });
    buttons.set(article.slug, button);
    return button;
  }

  function articleBySlug(slug) {
    return articles.find((article) => article.slug === slug);
  }

  function frontierBlock(label, values, className) {
    if (!values?.length) return null;
    const section = document.createElement("section");
    section.className = `topology-frontier ${className}`;
    const heading = document.createElement("h4");
    heading.textContent = label;
    const ul = document.createElement("ul");
    for (const value of values) {
      const li = document.createElement("li");
      li.textContent = value;
      ul.append(li);
    }
    section.append(heading, ul);
    return section;
  }

  function setSelectionState(slug) {
    for (const [key, button] of buttons) {
      const selected = key === slug;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  }

  function detailHeader(article) {
    const meta = document.createElement("p");
    meta.className = "eyebrow";
    meta.textContent = [
      `MILESTONE ${String(article.sequence || "").padStart(3, "0")}`,
      article.modelFocus ? article.modelFocus.toUpperCase() : null,
      article.date ? `PUBLISHED ${article.date}` : null,
    ].filter(Boolean).join(" / ");
    const heading = document.createElement("h3");
    heading.textContent = nodeLabel(article);
    const description = document.createElement("p");
    description.textContent = article.description || "";
    return [meta, heading, description];
  }

  function detailRelations(article) {
    const relation = document.createElement("p");
    relation.className = "topology-relations";
    const deps = (dependencies.get(article.slug) || []).map((dep) => nodeLabel(articleBySlug(dep))).filter(Boolean);
    const next = (children.get(article.slug) || []).map((child) => nodeLabel(articleBySlug(child))).filter(Boolean);
    const builtOn = deps.length ? `Built on: ${deps.join(", ")}.` : "Declared root: no earlier article dependency.";
    const feeds = next.length ? `Feeds: ${next.join(", ")}.` : "No published dependent article yet.";
    relation.textContent = `${builtOn} ${feeds}`;
    return relation;
  }

  function detailActions(article) {
    const actions = document.createElement("div");
    actions.className = "topology-detail-actions";
    const read = document.createElement("a");
    read.href = article.url;
    read.textContent = "Read article →";
    actions.append(read);
    return actions;
  }

  function appendFrontier(article) {
    const blocks = [
      frontierBlock("Observed", article.frontierObserved, "is-observed"),
      frontierBlock("Open", article.frontierOpen, "is-open"),
      frontierBlock("Next test", article.frontierNext, "is-next"),
    ].filter(Boolean);
    detail.append(...blocks);
  }

  function select(slug, moveFocus = false) {
    const article = articleBySlug(slug);
    if (!article) return;
    setSelectionState(slug);
    detail.replaceChildren(...detailHeader(article), detailRelations(article));
    appendFrontier(article);
    detail.append(detailActions(article));
    root.dataset.selected = slug;
    drawEdges();
    if (moveFocus) {
      const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      detail.scrollIntoView?.({ block: "nearest", behavior });
    }
  }

  function drawEdges() {
    if (!nodesLayer || !edgesLayer || !articles.length) return;
    const width = nodesLayer.scrollWidth;
    const height = nodesLayer.scrollHeight;
    const stacked = matchMedia("(max-width: 640px)").matches;
    edgesLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);
    edgesLayer.style.width = `${width}px`;
    edgesLayer.style.height = `${height}px`;
    edgesLayer.replaceChildren();

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    gradient.id = "topology-edge-signal";
    gradient.setAttribute("x1", "0");
    gradient.setAttribute("x2", "1");
    gradient.innerHTML = '<stop offset="0" stop-color="var(--muted)" stop-opacity=".42"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".72"/>';
    defs.append(gradient);
    edgesLayer.append(defs);

    for (const article of articles) {
      const target = buttons.get(article.slug);
      if (!target) continue;
      for (const dep of dependencies.get(article.slug) || []) {
        const source = buttons.get(dep);
        if (!source) continue;
        const x1 = source.offsetLeft + source.offsetWidth;
        const y1 = source.offsetTop + source.offsetHeight / 2;
        const x2 = target.offsetLeft;
        const y2 = target.offsetTop + target.offsetHeight / 2;
        const pathStartX = stacked ? source.offsetLeft + source.offsetWidth / 2 : x1;
        const pathStartY = stacked ? source.offsetTop + source.offsetHeight : y1;
        const pathEndX = stacked ? target.offsetLeft + target.offsetWidth / 2 : x2;
        const pathEndY = stacked ? target.offsetTop : y2;
        const delta = stacked
          ? Math.max(18, Math.min(48, Math.abs(pathEndY - pathStartY) * .34))
          : Math.max(36, (x2 - x1) * .48);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute(
          "d",
          stacked
            ? `M ${pathStartX} ${pathStartY} C ${pathStartX} ${pathStartY + delta}, ${pathEndX} ${pathEndY - delta}, ${pathEndX} ${pathEndY}`
            : `M ${pathStartX} ${pathStartY} C ${pathStartX + delta} ${pathStartY}, ${pathEndX - delta} ${pathEndY}, ${pathEndX} ${pathEndY}`,
        );
        path.dataset.source = dep;
        path.dataset.target = article.slug;
        const selected = root.dataset.selected;
        if (selected && (dep === selected || article.slug === selected)) path.classList.add("is-active");
        edgesLayer.append(path);

        const endpoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        endpoint.classList.add("topology-edge-end");
        if (selected && (dep === selected || article.slug === selected)) endpoint.classList.add("is-active");
        endpoint.setAttribute("cx", String(pathEndX));
        endpoint.setAttribute("cy", String(pathEndY));
        endpoint.setAttribute("r", selected && (dep === selected || article.slug === selected) ? "3" : "2");
        edgesLayer.append(endpoint);
      }
    }
  }

  function renderAccessibleList() {
    if (!list) return;
    list.replaceChildren(...articles.map((article) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = article.url;
      link.textContent = nodeLabel(article);
      const relation = document.createElement("span");
      const deps = dependencies.get(article.slug) || [];
      relation.textContent = deps.length ? ` — depends on ${deps.join(", ")}` : " — root";
      li.append(link, relation);
      return li;
    }));
  }

  function render(manifest) {
    if (!manifest?.articles?.length) return;
    articles = buildRelations([...manifest.articles].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)));
    const depths = Math.max(...articles.map((article) => article.topologyDepth), 0) + 1;
    nodesLayer.style.setProperty("--topology-columns", String(depths));
    buttons = new Map();

    const rowsByDepth = new Map();
    const nodeElements = [];
    for (const article of articles) {
      const row = rowsByDepth.get(article.topologyDepth) || 0;
      rowsByDepth.set(article.topologyDepth, row + 1);
      nodeElements.push(createNode(article, row));
    }
    nodesLayer.replaceChildren(...nodeElements);
    renderAccessibleList();

    requestAnimationFrame(() => {
      drawEdges();
      const frontier = [...articles].reverse().find((article) => article.frontierOpen?.length || article.frontierNext?.length);
      select(frontier?.slug || articles.at(-1)?.slug, false);
    });
  }

  const resize = new ResizeObserver(() => requestAnimationFrame(drawEdges));
  resize.observe(nodesLayer);
  addEventListener("resize", () => requestAnimationFrame(drawEdges), { passive: true });

  if (window.PortfolioPublication) render(window.PortfolioPublication);
  else document.addEventListener("portfolio:publication", (event) => render(event.detail), { once: true });
}
