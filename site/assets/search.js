const triggers = [...document.querySelectorAll(".search-toggle")];

if (triggers.length) {
  let pagefindPromise;
  let sequence = 0;
  let matches = [];
  let displayed = 0;
  let loading = false;
  const pageSize = 8;
  const isApple = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || '');
  triggers.forEach(trigger => {
    const shortcut = trigger.querySelector('kbd');
    if (shortcut) shortcut.textContent = isApple ? '⌘K' : 'Ctrl+K';
  });

  function createSearchDialog() {
    const dialog = document.createElement("dialog");
    dialog.className = "search-dialog";
    dialog.innerHTML = `
      <div class="search-shell">
        <header>
          <div><p class="eyebrow">SEARCH / PUBLICATION</p><h2 id="search-title">Find the mechanism.</h2></div>
          <button type="button" class="search-close" aria-label="Close search">Close</button>
        </header>
        <label for="portfolio-search">Articles, concepts, experiments, and notebooks</label>
        <input id="portfolio-search" type="search" autocomplete="off" spellcheck="false" placeholder="consumer, hypersphere, normalization…">
        <p class="search-status" role="status" aria-live="polite">Type at least two characters.</p>
        <ol class="search-results"></ol>
        <button class="search-more" type="button" hidden>Load more results</button>
      </div>`;
    dialog.setAttribute("aria-labelledby", "search-title");
    document.body.append(dialog);
    dialog.querySelector(".search-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dialog.close();
    });
    return dialog;
  }

  const dialog = createSearchDialog();
  const input = dialog.querySelector("#portfolio-search");
  const status = dialog.querySelector(".search-status");
  const results = dialog.querySelector(".search-results");
  const more = dialog.querySelector('.search-more');

  function loadPagefind() {
    pagefindPromise ??= import("/pagefind/pagefind.js").then(async (pagefind) => {
      // Image URLs (including notebook data URIs) are not searchable prose.
      await pagefind.options({ baseUrl: "/", highlightParam: "highlight", ranking: { metaWeights: { image: 0 } } });
      await pagefind.init();
      return pagefind;
    }).catch(error => { pagefindPromise = undefined; throw error; });
    return pagefindPromise;
  }

  function plainExcerpt(excerpt = "") {
    const doc = new DOMParser().parseFromString(excerpt, "text/html");
    doc.querySelectorAll('script,style').forEach(node => node.remove());
    doc.querySelectorAll('td,th,p,div,li,br').forEach(node => node.after(' '));
    return doc.body.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  function resultItem(data) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = data.url;
    const title = document.createElement("strong");
    title.textContent = data.meta?.title || data.url;
    const excerpt = document.createElement("span");
    excerpt.textContent = plainExcerpt(data.excerpt);
    const kind = document.createElement('span');
    kind.className = 'search-result-type';
    const path = new URL(data.url, location.href).pathname;
    // Published route segments remain stable under a GitHub Pages project prefix.
    kind.textContent = /\/articles\//.test(path) ? 'Article' : /\/notebooks\//.test(path) ? 'Notebook'
      : /\/projects\//.test(path) ? 'Project' : 'Page';
    link.append(kind, title, excerpt);
    item.append(link);
    return item;
  }

  async function search(term, requestId) {
    matches = []; displayed = 0; loading = false;
    more.hidden = true; more.disabled = false;
    results.replaceChildren();
    if (term.length < 2) {
      results.replaceChildren();
      status.textContent = "Type at least two characters.";
      return;
    }
    status.textContent = "Searching…";
    try {
      const pagefind = await loadPagefind();
      const response = await pagefind.search(term);
      // Pagefind 1.5 searches metadata and can return image-only matches even
      // with zero image weight. Keep body and textual metadata matches.
      if (requestId !== sequence) return;
      matches = response.results.filter((result) => result.words?.length
        || !result.matchedMetaFields?.length
        || result.matchedMetaFields.some((field) => field !== "image"));
      await loadMore(requestId);
    } catch (error) {
      if (requestId !== sequence) return;
      results.replaceChildren();
      status.textContent = "Search could not load. Try again, or browse Research and Projects from the site menu.";
      console.warn("Portfolio search unavailable.", error);
    }
  }

  async function loadMore(requestId = sequence) {
    if (loading || requestId !== sequence) return;
    loading = true; more.disabled = true;
    const start = displayed;
    status.textContent = start ? `Loading more results… ${start} of ${matches.length} shown.` : 'Loading results…';
    try {
      const data = await Promise.all(matches.slice(start, start + pageSize).map(result => result.data()));
      if (requestId !== sequence) return;
      results.append(...data.map(resultItem));
      displayed += data.length;
      status.textContent = matches.length ? `Showing ${displayed} of ${matches.length} results.` : 'No matching research.';
      more.hidden = displayed >= matches.length;
      if (start && data.length) results.children[start].querySelector('a').focus();
    } catch (error) {
      if (requestId !== sequence) return;
      status.textContent = `Could not load results. Showing ${displayed} of ${matches.length}. Use Load more to retry.`;
      more.hidden = false;
    } finally {
      if (requestId === sequence) { loading = false; more.disabled = false; }
    }
  }
  more.addEventListener('click', () => loadMore());

  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const term = input.value.trim();
    const requestId = ++sequence;
    more.hidden = true;
    results.replaceChildren();
    status.textContent = term.length < 2 ? 'Type at least two characters.' : 'Searching…';
    timer = setTimeout(() => search(term, requestId), 120);
  });

  function openSearch() {
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => input.focus());
    loadPagefind().catch(() => {});
  }

  triggers.forEach((trigger) => trigger.addEventListener("click", openSearch));
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
    const command = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    const slash = event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (!command && !slash) return;
    event.preventDefault();
    openSearch();
  });
}
