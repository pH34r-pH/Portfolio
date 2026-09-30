const triggers = [...document.querySelectorAll(".search-toggle")];

if (triggers.length) {
  let pagefindPromise;
  let sequence = 0;

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
      </div>`;
    dialog.setAttribute("aria-labelledby", "search-title");
    document.body.append(dialog);
    dialog.querySelector(".search-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    return dialog;
  }

  const dialog = createSearchDialog();
  const input = dialog.querySelector("#portfolio-search");
  const status = dialog.querySelector(".search-status");
  const results = dialog.querySelector(".search-results");

  function loadPagefind() {
    pagefindPromise ??= import("/pagefind/pagefind.js").then(async (pagefind) => {
      await pagefind.options({ baseUrl: "/", highlightParam: "highlight" });
      await pagefind.init();
      return pagefind;
    });
    return pagefindPromise;
  }

  function plainExcerpt(excerpt = "") {
    const doc = new DOMParser().parseFromString(excerpt, "text/html");
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
    link.append(title, excerpt);
    item.append(link);
    return item;
  }

  async function search(term, requestId) {
    if (term.length < 2) {
      results.replaceChildren();
      status.textContent = "Type at least two characters.";
      return;
    }
    status.textContent = "Searching…";
    try {
      const pagefind = await loadPagefind();
      const response = await pagefind.search(term);
      const data = await Promise.all(response.results.slice(0, 8).map((result) => result.data()));
      if (requestId !== sequence) return;
      results.replaceChildren(...data.map(resultItem));
      status.textContent = data.length ? `${response.results.length} result${response.results.length === 1 ? "" : "s"}.` : "No matching research.";
    } catch (error) {
      if (requestId !== sequence) return;
      results.replaceChildren();
      status.textContent = "Search is available in the published site.";
      console.warn("Portfolio search unavailable.", error);
    }
  }

  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const term = input.value.trim();
    const requestId = ++sequence;
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
