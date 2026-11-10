import('./material-light.js').catch(()=>{});
function renderArticleList(container, articles) {
  if (!articles?.length) return;
  const cards = [...articles]
    .sort((a, b) => a.sequence - b.sequence)
    .map((article) => {
      const card = document.createElement("article");
      card.className = "card article-card";
      card.dataset.index = article.milestone ? `Milestone ${article.milestone}` :
        ({ essay: 'Essay', 'work-in-progress': 'Work in progress' }[article.articleKind] || 'Article');
      const heading = document.createElement("h3");
      const titleLink = document.createElement("a");
      titleLink.href = article.url;
      titleLink.textContent = article.title || article.slug;
      heading.append(titleLink);
      const summary = document.createElement("p");
      summary.className = "card-question";
      summary.textContent = article.description || "";
      const meta = document.createElement("p");
      meta.className = "card-meta";
      meta.textContent = `Published ${article.date || "—"}`;
      const links = document.createElement("div");
      links.className = "links";
      const read = document.createElement("a");
      read.href = article.url;
      read.textContent = "Read article";
      links.append(read);
      if (article.notebookSlug) {
        const notebook = document.createElement('a');
        notebook.href = '/notebooks/' + encodeURIComponent(article.notebookSlug) + '/';
        notebook.textContent = 'Preserved notebook';
        links.append(notebook);
      }
      const resources = document.createElement('a');
      resources.href = article.url + '#article-resources';
      resources.textContent = 'Sources & downloads';
      links.append(resources);
      card.append(heading, summary, meta, links);
      return card;
    });
  container.replaceChildren(...cards);
}

function notebookCard(notebook) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.index = notebook.sequence ? `Milestone ${String(notebook.sequence).padStart(3, '0')}` : 'Companion notebook';
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
  const filename = notebook.path.split("/").pop();
  const slug = notebook.slug || (filename.endsWith(".ipynb") ? filename.slice(0, -6) : filename);
  read.href = "/notebooks/" + encodeURIComponent(slug) + "/";
  read.textContent = "Read notebook";
  const lab = document.createElement("a");
  const prefix = "publication/notebooks/";
  const jupyterPath = notebook.jupyterPath || (notebook.path.startsWith(prefix) ? notebook.path.slice(prefix.length) : notebook.path);
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
      if (a.sequence && b.sequence && a.sequence !== b.sequence) return a.sequence - b.sequence;
      return (a.path || "").localeCompare(b.path || "", undefined, { numeric: true });
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
  // The bundle contains the full readable catalog. Keep it if refresh fails.
  if (list && !list.querySelector('.card')) list.innerHTML = '<p>Notebook catalog unavailable. <a href="https://github.com/pH34r-pH/research-notes/tree/main/notebooks">Read the source archive</a>.</p>';
  if (articleList && !articleList.querySelector('.card')) articleList.innerHTML = '<p>Article catalog unavailable. <a href="/articles/001-text-as-signal/">Start with the first article</a> or <a href="/articles/accessible-does-not-imply-used/">read the current result</a>.</p>';
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
