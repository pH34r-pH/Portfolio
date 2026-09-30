/* Shared shell behavior for Portfolio 2071. */
{
  const root = document.documentElement;
  const modes = new Set(["auto", "light", "dark"]);
  const mediaDark = matchMedia("(prefers-color-scheme: dark)");
  const mediaReduced = matchMedia("(prefers-reduced-motion: reduce)");

  function readMode() {
    try {
      const value = localStorage.getItem("portfolio-theme");
      return modes.has(value) ? value : "auto";
    } catch {
      return "auto";
    }
  }

  function resolveMode(mode) {
    return mode === "auto" ? (mediaDark.matches ? "dark" : "light") : mode;
  }

  function writeMode(mode) {
    try { localStorage.setItem("portfolio-theme", mode); }
    catch { /* Local preference is optional. */ }
  }

  function syncThemeColor(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.append(meta);
    }
    meta.content = theme === "dark" ? "#00070d" : "#f4f9fd";
  }

  function ensureThemeControls() {
    document.querySelectorAll(".appearance").forEach((container) => {
      if (container.querySelector("[data-theme-choice]")) return;
      container.replaceChildren();

      const label = document.createElement("span");
      label.className = "appearance-label";
      label.textContent = "Environment";
      container.append(label);

      for (const value of ["auto", "light", "dark"]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.themeChoice = value;
        button.textContent = value[0].toUpperCase() + value.slice(1);
        button.setAttribute("aria-pressed", "false");
        container.append(button);
      }
    });
  }

  function applyTheme(mode, persist = false) {
    const safeMode = modes.has(mode) ? mode : "auto";
    const theme = resolveMode(safeMode);
    root.dataset.themeMode = safeMode;
    root.dataset.theme = theme;
    delete root.dataset.palette;
    delete root.dataset.style;
    syncThemeColor(theme);

    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === safeMode));
    });

    if (persist) writeMode(safeMode);
  }

  /* Apply before the rest of the page paints; legacy data attributes are removed
     so the archived multi-style selectors never participate in the 2071 surface. */
  applyTheme(readMode());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensureThemeControls();
      applyTheme(readMode());
      setupMenu();
      setupReaderTitle();
      setupTransientEmphasis();
    }, { once: true });
  } else {
    ensureThemeControls();
    applyTheme(readMode());
    setupMenu();
    setupReaderTitle();
    setupTransientEmphasis();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-theme-choice]");
    if (button) applyTheme(button.dataset.themeChoice, true);
  });

  addEventListener("storage", (event) => {
    if (event.key === "portfolio-theme" || event.key === null) applyTheme(readMode());
  });

  mediaDark.addEventListener?.("change", () => {
    if (root.dataset.themeMode === "auto") applyTheme("auto");
  });

  function setupMenu() {
    const menuButton = document.querySelector(".menu-toggle");
    const menu = document.querySelector("#site-menu");
    if (!menuButton || !menu || menu.dataset.ready === "true") return;
    menu.dataset.ready = "true";

    const close = (focus = false) => {
      menu.hidden = true;
      menuButton.setAttribute("aria-expanded", "false");
      if (focus) menuButton.focus();
    };

    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      menu.hidden = open;
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) close(true);
    });

    menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => close()));

    document.addEventListener("click", (event) => {
      if (!menu.hidden && !menu.contains(event.target) && !menuButton.contains(event.target)) close();
    });
  }

  function setupReaderTitle() {
    const title = document.querySelector(".notebook-reader > header h1");
    if (!title || title.querySelector(".title-accent")) return;
    const text = title.textContent;
    const split = text.indexOf(" — ");
    const accent = document.createElement("span");
    accent.className = "title-accent";
    accent.textContent = split < 0 ? text : text.slice(split + 3);
    title.replaceChildren(...(split < 0 ? [] : [document.createTextNode(text.slice(0, split + 3))]), accent);
  }

  function setupTransientEmphasis() {
    if (mediaReduced.matches) return;

    const scopes = document.querySelectorAll(".myst-reader, .about-sections, .lede, .proof-line");
    const emphasized = [...scopes].flatMap((scope) => [...scope.querySelectorAll("strong, em")]);
    if (!emphasized.length || !("IntersectionObserver" in window)) return;

    scopes.forEach((scope) => scope.classList.add("transient-reading"));

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.classList.toggle("is-reading", entry.isIntersecting);
    }, {
      root: null,
      threshold: 0,
      rootMargin: "-34% 0px -52% 0px",
    });

    emphasized.forEach((node) => observer.observe(node));
  }
}
