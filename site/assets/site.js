function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderArticleList(container, articles) {
  if (!container || !articles?.length) return;
  const cards = [...articles]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((article, index) => {
      const card = el("article", "card article-card");
      card.dataset.index = String(index + 1).padStart(2, "0");
      const heading = el("h3", "", article.title || article.slug);
      const summary = el("p", "card-question", article.description || "");
      const meta = el("p", "card-meta", `Published ${article.date || ""}`);
      const links = el("div", "links");
      const read = el("a", "", "Read article");
      read.href = article.url;
      links.append(read);
      card.append(heading, summary, meta, links);
      return card;
    });
  container.replaceChildren(...cards);
}

function publicNotebook(notebook) {
  return notebook.slug !== "visual_intuition_atlas";
}

function compareNotebooks(a, b) {
  if (a.sequence && b.sequence && a.sequence !== b.sequence) return b.sequence - a.sequence;
  return (b.path || "").localeCompare(a.path || "", undefined, { numeric: true });
}

function notebookCard(notebook, index) {
  const card = el("article", "card");
  card.dataset.index = String(index + 1).padStart(2, "0");
  const heading = el("h3", "", notebook.title || notebook.path);
  const meta = el("p", "card-meta", "Preserved source notebook");
  const question = el("p", "card-question", notebook.question || "");
  const links = el("div", "links");
  const read = el("a", "", "Read notebook");
  const slug = notebook.slug || notebook.path.split("/").pop().replace(/\.ipynb$/, "");
  read.href = "/notebooks/" + encodeURIComponent(slug) + "/";
  const lab = el("a", "", "Open in JupyterLite ↗");
  const jupyterPath = notebook.jupyterPath || notebook.path.replace(/^publication\/notebooks\//, "");
  lab.href = "/lab/lab/index.html?path=" + encodeURIComponent(jupyterPath);
  links.append(read, lab);
  card.append(heading, question, meta, links);
  return card;
}

function renderNotebookList(container, notebooks) {
  if (!container || !notebooks?.length) return;
  const cards = [...notebooks].filter(publicNotebook).sort(compareNotebooks).map(notebookCard);
  container.replaceChildren(...cards);
}

function renderProvenance(sources, target, build) {
  if (target) {
    target.textContent = Object.entries(sources)
      .map(([key, source]) => key + "  " + String(source.commit || "").slice(0, 12))
      .join("\n");
  }
  if (build) build.textContent = sources.portfolio?.commit ? " / " + sources.portfolio.commit.slice(0, 8) : "";
}

function graphDependencies(article, articles, index) {
  const declared = Array.isArray(article.dependsOn) ? article.dependsOn : [];
  if (declared.length) return declared.map(slug => ({ slug, kind: "dependency" }));
  if (index <= 0) return [];
  return [{ slug: articles[index - 1].slug, kind: "chronology" }];
}

function researchTopologyLayout(rawArticles) {
  const articles = [...rawArticles].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const nodeW = 250, nodeH = 72, gapX = 52, gapY = 46, cols = 3;
  const positions = new Map();
  articles.forEach((article, index) => {
    const col = index % cols, row = Math.floor(index / cols);
    positions.set(article.slug, { x: 36 + col * (nodeW + gapX), y: 28 + row * (nodeH + gapY) });
  });
  const rows = Math.ceil(articles.length / cols);
  return { articles, positions, nodeW, nodeH, width: 920, height: Math.max(280, 38 + rows * (nodeH + gapY)) };
}

function appendTopologyEdges(svg, layout) {
  const ns = "http://www.w3.org/2000/svg";
  for (const [index, article] of layout.articles.entries()) {
    const to = layout.positions.get(article.slug);
    for (const dep of graphDependencies(article, layout.articles, index)) {
      const from = layout.positions.get(dep.slug);
      if (!from || !to) continue;
      const line = document.createElementNS(ns, "line");
      line.classList.add("graph-edge");
      line.setAttribute("x1", from.x + layout.nodeW / 2);
      line.setAttribute("y1", from.y + layout.nodeH);
      line.setAttribute("x2", to.x + layout.nodeW / 2);
      line.setAttribute("y2", to.y);
      if (dep.kind === "chronology") {
        line.setAttribute("stroke-dasharray", "4 7");
        line.setAttribute("opacity", ".45");
      }
      svg.append(line);
    }
  }
}

function appendTopologyNodes(svg, layout) {
  const ns = "http://www.w3.org/2000/svg";
  layout.articles.forEach(article => {
    const pos = layout.positions.get(article.slug);
    const link = document.createElementNS(ns, "a");
    link.setAttribute("href", article.url);
    link.setAttribute("class", "graph-node");
    link.setAttribute("data-status", article.status || (article === layout.articles.at(-1) ? "active" : "published"));
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", pos.x); rect.setAttribute("y", pos.y);
    rect.setAttribute("width", layout.nodeW); rect.setAttribute("height", layout.nodeH);
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", pos.x + 12); label.setAttribute("y", pos.y + 28);
    const clean = (article.title || article.slug).replace(/\s+/g, " ");
    label.textContent = clean.length > 34 ? clean.slice(0, 32) + "…" : clean;
    const meta = document.createElementNS(ns, "text");
    meta.classList.add("graph-meta");
    meta.setAttribute("x", pos.x + 12); meta.setAttribute("y", pos.y + 52);
    meta.textContent = `${String(article.sequence || "").padStart(3, "0")} / ${article.date || ""}`;
    link.append(rect, label, meta);
    svg.append(link);
  });
}

function topologySvg(layout) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", "research-graph-title research-graph-desc");
  const title = document.createElementNS(ns, "title");
  title.id = "research-graph-title";
  title.textContent = "Research dependency map";
  const desc = document.createElementNS(ns, "desc");
  desc.id = "research-graph-desc";
  desc.textContent = "Published research articles connected by declared dependencies; faint fallback links show chronology when no dependency metadata is declared.";
  svg.append(title, desc);
  appendTopologyEdges(svg, layout);
  appendTopologyNodes(svg, layout);
  return svg;
}

function topologyList(articles) {
  const list = el("div", "graph-list");
  list.setAttribute("aria-label", "Research articles");
  articles.forEach((article, index) => {
    const record = el("article", "graph-list-record");
    const link = el("a", "", `${String(article.sequence || "").padStart(3, "0")} · ${article.title}`);
    link.href = article.url;
    record.append(link);
    const deps = graphDependencies(article, articles, index);
    if (deps.length) {
      const names = deps.map(dep => articles.find(item => item.slug === dep.slug)?.title || dep.slug);
      const prefix = deps.every(dep => dep.kind === "chronology") ? "Follows publication chronology: " : "Depends on: ";
      record.append(el("p", "graph-list-deps", prefix + names.join("; ")));
    }
    list.append(record);
  });
  return list;
}

function renderResearchTopology(container, rawArticles) {
  if (!container || !rawArticles?.length) return;
  const layout = researchTopologyLayout(rawArticles);
  container.replaceChildren(topologySvg(layout), topologyList(layout.articles));
}

function renderResearchFrontier(container, rawArticles) {
  if (!container || !rawArticles?.length) return;
  const article = [...rawArticles].filter(item => item.frontier).sort((a, b) => (b.sequence || 0) - (a.sequence || 0))[0];
  if (!article?.frontier) {
    container.innerHTML = "<p>The current research frontier will appear with the next published state update.</p>";
    return;
  }
  const groups = [["observed","Observed"],["ruledOut","Ruled out"],["open","Open"],["next","Next test"]];
  const cards = [];
  for (const [key, label] of groups) {
    const values = article.frontier[key];
    if (!Array.isArray(values) || !values.length) continue;
    const card = el("article", "frontier-card");
    card.dataset.kind = key;
    card.append(el("span", "frontier-label", label));
    const list = el("ul");
    values.forEach(value => list.append(el("li", "", value)));
    card.append(list);
    cards.push(card);
  }
  const source = el("a", "frontier-source", "Current frontier from " + article.title + " →");
  source.href = article.url;
  container.replaceChildren(...cards, source);
}
function showCatalogUnavailable(list, articleList, target) {
  if (list) list.innerHTML = "<p>Publication catalog unavailable.</p>";
  if (articleList) articleList.innerHTML = "<p>Article catalog unavailable.</p>";
  if (target) target.textContent = "Build metadata unavailable.";
}

async function loadPublication() {
  const target = document.querySelector("#provenance-data");
  const list = document.querySelector("#notebook-list");
  const articleList = document.querySelector("#article-list");
  const build = document.querySelector("#build-id");
  const topology = document.querySelector("#research-topology");
  const frontier = document.querySelector("#research-frontier");
  try {
    const response = await fetch("/publication.json", { cache: "no-store" });
    if (!response.ok) throw new Error();
    const manifest = await response.json();
    const sources = manifest.sources || {};
    renderProvenance(sources, target, build);
    renderArticleList(articleList, manifest.articles);
    renderNotebookList(list, manifest.notebooks);
    renderResearchTopology(topology, manifest.articles);
    renderResearchFrontier(frontier, manifest.articles);
  } catch {
    showCatalogUnavailable(list, articleList, target);
    if (topology) topology.innerHTML = "<p>Research map is available in the published build.</p>";
    if (frontier) frontier.innerHTML = "<p>Research frontier is available in the published build.</p>";
  }
}

function initTransientEmphasis() {
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const nodes = document.querySelectorAll(".myst-reader :is(strong,em), .about-sections :is(strong,em), .lede :is(strong,em)");
  if (!nodes.length) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle("reader-emphasis-active", entry.isIntersecting));
  }, { rootMargin: "-34% 0px -45% 0px", threshold: .01 });
  nodes.forEach(node => observer.observe(node));
}

function inferModelFocus(text) {
  const value = text.toLowerCase();
  if (/token|byte|encoding|input/.test(value)) return "tokenization";
  if (/hypersphere|state|representation|normaliz/.test(value)) return "representation";
  if (/architecture|layer|recurrent|mechanism/.test(value)) return "architecture";
  if (/consumer|readout|probe|used/.test(value)) return "consumer";
  if (/prediction|output|loss|endpoint/.test(value)) return "output";
  return null;
}

function initArticleModelTracking() {
  const instrument = document.querySelector("[data-article-model]");
  const article = document.querySelector(".myst-reader");
  if (!instrument || !article || !("IntersectionObserver" in window)) return;
  const headings = [...article.querySelectorAll("h2,h3")];
  const observer = new IntersectionObserver(entries => {
    const active = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!active) return;
    const focus = active.target.dataset.modelFocus || inferModelFocus(active.target.textContent || "");
    if (focus) {
      instrument.dataset.focus = focus;
      instrument.dispatchEvent(new CustomEvent("portfolio:model-focus", { detail: { focus } }));
    }
  }, { rootMargin: "-18% 0px -65% 0px", threshold: [0,.2,.6] });
  headings.forEach(heading => observer.observe(heading));
}

function ensureSearchDialog() {
  if (document.querySelector("#site-search")) return;
  const dialog = el("dialog", "search-dialog");
  dialog.id = "site-search";
  dialog.innerHTML = `<form method="dialog" class="search-shell">
    <div class="search-head">
      <label class="visually-hidden" for="site-search-input">Search research</label>
      <input id="site-search-input" type="search" autocomplete="off" placeholder="Search articles, concepts, notebooks…" />
      <button value="close" aria-label="Close search">×</button>
    </div>
    <div id="site-search-results" class="search-results" aria-live="polite"><p class="search-status">Start typing to search the publication.</p></div>
  </form>`;
  document.body.append(dialog);
}

async function searchPagefind(query, results) {
  if (!query.trim()) {
    results.innerHTML = '<p class="search-status">Start typing to search the publication.</p>';
    return;
  }
  try {
    const pagefind = await import("/pagefind/pagefind.js");
    await pagefind.init();
    const response = await pagefind.search(query);
    const records = await Promise.all(response.results.slice(0, 10).map(result => result.data()));
    if (!records.length) {
      results.innerHTML = '<p class="search-status">No matching research found.</p>';
      return;
    }
    results.replaceChildren(...records.map(record => {
      const link = el("a", "search-result");
      link.href = record.url;
      const title = el("strong", "", record.meta?.title || record.url);
      const excerpt = el("span");
      excerpt.innerHTML = record.excerpt || "";
      link.append(title, excerpt);
      return link;
    }));
  } catch {
    results.innerHTML = '<p class="search-status">Search is indexed in the complete published build.</p>';
  }
}

function initSearch() {
  ensureSearchDialog();
  const dialog = document.querySelector("#site-search");
  const input = document.querySelector("#site-search-input");
  const results = document.querySelector("#site-search-results");
  let timer;
  const open = () => {
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => input.focus());
  };
  document.addEventListener("click", event => {
    if (event.target.closest?.("[data-search-open]")) open();
  });
  document.addEventListener("keydown", event => {
    const shortcut = event.key === "/" && !/input|textarea/i.test(document.activeElement?.tagName || "");
    const command = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    if (shortcut || command) {
      event.preventDefault();
      open();
    }
  });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => searchPagefind(input.value, results), 90);
  });
}

loadPublication();
if (document.readyState === "loading") {
  addEventListener("DOMContentLoaded", () => {
    initTransientEmphasis();
    initArticleModelTracking();
    initSearch();
  }, { once: true });
} else {
  initTransientEmphasis();
  initArticleModelTracking();
  initSearch();
}