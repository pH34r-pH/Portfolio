function renderArticleList(container, articles) {
  if (!articles?.length) return;
  const cards = [...articles]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((article, index) => {
      const card = document.createElement("article");
      card.className = "card article-card";
      card.dataset.index = String(index + 1).padStart(2, "0");
      const heading = document.createElement("h3");
      heading.textContent = article.title || article.slug;
      const summary = document.createElement("p");
      summary.className = "card-question";
      summary.textContent = article.description || "";
      const meta = document.createElement("p");
      meta.className = "card-meta";
      meta.textContent = `Reviewed article · ${article.date || ""}`;
      const links = document.createElement("div");
      links.className = "links";
      const read = document.createElement("a");
      read.href = article.url;
      read.textContent = "Read article";
      links.append(read);
      card.append(heading, summary, meta, links);
      return card;
    });
  container.replaceChildren(...cards);
}

function notebookCard(notebook, index) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.index = String(index + 1).padStart(2, "0");
  const heading = document.createElement("h3");
  heading.textContent = notebook.title || notebook.path;
  const meta = document.createElement("p");
  meta.className = "card-meta";
  meta.textContent = "Chronological notebook · preserved source";
  const question = document.createElement("p");
  question.className = "card-question";
  question.textContent = notebook.question || "";
  const links = document.createElement("div");
  links.className = "links";
  const read = document.createElement("a");
  const slug = notebook.slug || notebook.path.split("/").pop().replace(/\.ipynb$/, "");
  read.href = "/notebooks/" + encodeURIComponent(slug) + "/";
  read.textContent = "Read notebook";
  const lab = document.createElement("a");
  const jupyterPath = notebook.jupyterPath || notebook.path.replace(/^publication\/notebooks\//, "");
  lab.href = "/lab/lab/index.html?path=" + encodeURIComponent(jupyterPath);
  lab.textContent = "Open in JupyterLite ↗";
  links.append(read, lab);
  card.append(heading, question, meta, links);
  return card;
}

function renderNotebookList(container, notebooks) {
  if (!notebooks?.length) return;
  const ordered = [...notebooks]
    .filter((notebook) => notebook.slug !== "visual_intuition_atlas")
    .sort((a, b) => {
      if (a.sequence && b.sequence && a.sequence !== b.sequence) return b.sequence - a.sequence;
      return (b.path || "").localeCompare(a.path || "", undefined, { numeric: true });
    });
  container.replaceChildren(...ordered.map(notebookCard));
}

function renderProvenance(sources, target, build) {
  if (target)
    target.textContent = Object.entries(sources)
      .map(([key, source]) => key + "  " + String(source.commit || "").slice(0, 12))
      .join("\n");
  if (build)
    build.textContent = sources.portfolio?.commit
      ? " / " + sources.portfolio.commit.slice(0, 8)
      : "";
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
  try {
    const response = await fetch("/publication.json", { cache: "no-store" });
    if (!response.ok) throw new Error();
    const manifest = await response.json();
    window.PortfolioPublication = manifest;
    document.dispatchEvent(new CustomEvent("portfolio:publication", { detail: manifest }));
    const sources = manifest.sources || {};
    renderProvenance(sources, target, build);
    if (articleList) renderArticleList(articleList, manifest.articles);
    if (list) renderNotebookList(list, manifest.notebooks);
  } catch {
    showCatalogUnavailable(list, articleList, target);
  }
}
loadPublication();

/* Move the environmental field only when the reader moves through the page.
   It remains a quiet, deterministic depth cue and disappears under reduced
   motion rather than running as a permanent animation. */
function setupFieldResponse() {
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;

  const writeField = () => {
    frame = 0;
    if (reduced.matches) {
      root.style.setProperty("--field-shift-x", "0px");
      root.style.setProperty("--field-shift-y", "0px");
      root.style.setProperty("--glass-scroll-y", "0px");
      return;
    }

    const range = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const progress = Math.min(1, Math.max(0, scrollY / range));
    const shift = progress * 34 - 10;
    const lateral = Math.sin(progress * Math.PI) * 12;
    root.style.setProperty("--field-shift-x", `${lateral.toFixed(1)}px`);
    root.style.setProperty("--field-shift-y", `${shift.toFixed(1)}px`);
    root.style.setProperty("--glass-scroll-y", `${((progress * 2 - 1) * 16).toFixed(1)}px`);
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(writeField);
  };

  writeField();
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
  reduced.addEventListener?.("change", schedule);
}

setupFieldResponse();
