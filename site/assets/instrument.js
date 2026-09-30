(() => {
  const root = document.documentElement;
  root.removeAttribute("data-style");
  const storedMode = (() => { try { return localStorage.getItem("portfolio-mode"); } catch { return null; } })();
  const preferredDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const mode = storedMode === "dark" || storedMode === "light" ? storedMode : (preferredDark ? "dark" : "light");
  root.dataset.mode = mode;

  function setMode(next, persist = true) {
    const value = next === "dark" ? "dark" : "light";
    root.dataset.mode = value;
    document.querySelectorAll("[data-mode-choice]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.modeChoice === value));
    });
    if (persist) { try { localStorage.setItem("portfolio-mode", value); } catch {} }
  }
  document.querySelectorAll("[data-mode-choice]").forEach(button => {
    button.addEventListener("click", () => setMode(button.dataset.modeChoice));
    button.setAttribute("aria-pressed", String(button.dataset.modeChoice === mode));
  });
  addEventListener("storage", event => {
    if (event.key === "portfolio-mode" && event.newValue) setMode(event.newValue, false);
  });

  const flash = document.createElement("div");
  flash.className = "route-flash";
  flash.setAttribute("aria-hidden", "true");
  document.body.append(flash);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.addEventListener("click", event => {
      const link = event.target.closest?.("a[href]");
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname && url.hash) return;
      if (link.target === "_blank" || link.hasAttribute("download")) return;
      event.preventDefault();
      document.body.classList.add("route-leaving");
      setTimeout(() => location.href = url.href, 235);
    });
  }

  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const emphasis = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle("transient-active", entry.isIntersecting));
    }, { rootMargin: "-39% 0px -43% 0px", threshold: 0 });
    document.querySelectorAll("[data-transient] strong,[data-transient] em,.myst-reader[data-transient] strong,.myst-reader[data-transient] em").forEach(el => emphasis.observe(el));
  }

  function ensureSearch() {
    if (document.querySelector(".search-trigger")) return;
    const topbar = document.querySelector(".topbar");
    const menuToggle = topbar?.querySelector(".menu-toggle");
    if (!topbar || !menuToggle) return;
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "search-trigger";
    trigger.textContent = "Search /";
    trigger.setAttribute("aria-label", "Search research");
    topbar.insertBefore(trigger, menuToggle);

    const dialog = document.createElement("dialog");
    dialog.className = "search-dialog";
    dialog.innerHTML = '<div class="search-shell"><div class="search-head"><strong>Research index / search</strong><button class="search-close" type="button" aria-label="Close search">×</button></div><input class="search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Search articles, concepts, experiments…" aria-label="Search"><div class="search-results" aria-live="polite"></div></div>';
    document.body.append(dialog);
    const input = dialog.querySelector(".search-input");
    const results = dialog.querySelector(".search-results");
    dialog.querySelector(".search-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    trigger.addEventListener("click", () => { dialog.showModal(); queueMicrotask(() => input.focus()); });
    document.addEventListener("keydown", event => {
      if ((event.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName)) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault(); dialog.showModal(); queueMicrotask(() => input.focus());
      }
    });

    let fallback = [];
    let pagefind = null;
    async function init() {
      try {
        pagefind = await import("/pagefind/pagefind.js");
        await pagefind.init();
      } catch {
        try {
          const response = await fetch("/publication.json");
          const manifest = await response.json();
          fallback = (manifest.articles || []).map(a => ({url:a.url,title:a.title,excerpt:a.description,date:a.date}));
        } catch {}
      }
    }
    init();

    let timer = 0;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.trim();
        if (!q) { results.replaceChildren(); return; }
        let items = [];
        if (pagefind) {
          const found = await pagefind.search(q);
          const data = await Promise.all(found.results.slice(0,8).map(result => result.data()));
          items = data.map(x => ({url:x.url,title:x.meta?.title || x.url,excerpt:x.excerpt || ""}));
        } else {
          const needle = q.toLowerCase();
          items = fallback.filter(x => (x.title+" "+x.excerpt).toLowerCase().includes(needle)).slice(0,8);
        }
        if (!items.length) { results.innerHTML = '<div class="search-empty">No matching research.</div>'; return; }
        results.replaceChildren(...items.map(item => {
          const a = document.createElement("a");
          a.className = "search-result"; a.href = item.url;
          const strong = document.createElement("strong"); strong.textContent = item.title;
          const span = document.createElement("span"); span.innerHTML = item.excerpt;
          a.append(strong,span); return a;
        }));
      }, 90);
    });
  }
  ensureSearch();

  function renderGraph(container, articles) {
    const items = [...(articles || [])].sort((a,b)=>(a.sequence||0)-(b.sequence||0));
    if (!items.length) return;
    const width = Math.max(760, 230 * Math.ceil(items.length / 2));
    const rows = 2, rowGap = 120, top = 70, nodeW = 170, nodeH = 62;
    const positions = new Map();
    items.forEach((article, i) => {
      const col = Math.floor(i / rows), row = i % rows;
      positions.set(article.slug, {x:42+col*220,y:top+row*rowGap});
    });
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox", `0 0 ${width} 310`);
    svg.setAttribute("role","img");
    svg.setAttribute("aria-label","Research dependency map");
    const edges = document.createElementNS(svg.namespaceURI,"g");
    const nodes = document.createElementNS(svg.namespaceURI,"g");
    const bySlug = new Map(items.map(x=>[x.slug,x]));
    items.forEach((article,i) => {
      const to = positions.get(article.slug);
      const deps = (article.dependsOn || []).filter(dep => bySlug.has(dep));
      const inferred = !deps.length && i > 0 ? [items[i-1].slug] : [];
      (deps.length ? deps : inferred).forEach(dep => {
        const from = positions.get(dep);
        const path = document.createElementNS(svg.namespaceURI,"path");
        const x1=from.x+nodeW, y1=from.y+nodeH/2, x2=to.x, y2=to.y+nodeH/2;
        const bend=(x2-x1)*.52;
        path.setAttribute("d",`M${x1},${y1} C${x1+bend},${y1} ${x2-bend},${y2} ${x2},${y2}`);
        path.setAttribute("class","graph-edge");
        if (!deps.length) path.setAttribute("stroke-dasharray","4 6");
        edges.append(path);
      });
      const link = document.createElementNS(svg.namespaceURI,"a");
      link.setAttribute("href",article.url);
      const g = document.createElementNS(svg.namespaceURI,"g");
      g.setAttribute("class","graph-node");
      g.setAttribute("transform",`translate(${to.x} ${to.y})`);
      const rect=document.createElementNS(svg.namespaceURI,"rect"); rect.setAttribute("width",nodeW);rect.setAttribute("height",nodeH);
      const dot=document.createElementNS(svg.namespaceURI,"circle");dot.setAttribute("cx",12);dot.setAttribute("cy",14);dot.setAttribute("r",3);
      const title=document.createElementNS(svg.namespaceURI,"text");title.setAttribute("x",22);title.setAttribute("y",18);
      const short=(article.title||article.slug).length>22?(article.title||article.slug).slice(0,21)+"…":(article.title||article.slug);
      title.textContent=short;
      const date=document.createElementNS(svg.namespaceURI,"text");date.setAttribute("class","graph-date");date.setAttribute("x",12);date.setAttribute("y",45);date.textContent=article.date||"";
      g.append(rect,dot,title,date);link.append(g);nodes.append(link);
    });
    svg.append(edges,nodes);
    container.replaceChildren(svg);
  }

  const graph = document.querySelector("#research-graph");
  if (graph) {
    fetch("/publication.json").then(r=>r.json()).then(m=>renderGraph(graph,m.articles)).catch(()=> {
      graph.innerHTML='<p class="search-empty">Research map is available in the published build.</p>';
    });
  }
})();
