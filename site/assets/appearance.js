/* Shared menu and display-mode behavior for static pages and generated readers. */
(() => {
  const root = document.documentElement;
  root.removeAttribute("data-style");
  root.removeAttribute("data-palette");
  function readMode() {
    try {
      const saved = localStorage.getItem("portfolio-mode");
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function selectMode(value, persist = false) {
    const mode = value === "dark" ? "dark" : "light";
    root.dataset.mode = mode;
    document.querySelectorAll("[data-mode-choice]").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.modeChoice === mode)));
    if (persist) { try { localStorage.setItem("portfolio-mode", mode); } catch {} }
  }
  selectMode(readMode());
  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-mode-choice]");
    if (button) selectMode(button.dataset.modeChoice, true);
  });
  addEventListener("storage", event => {
    if (event.key === "portfolio-mode" || event.key === null) selectMode(readMode());
  });

  const menuButton = document.querySelector(".menu-toggle");
  const menu = document.querySelector("#site-menu");
  if (menuButton && menu) {
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
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !menu.hidden) close(true);
    });
    menu.querySelectorAll("a").forEach(link => link.addEventListener("click", () => close()));
    document.addEventListener("click", event => {
      if (!menu.hidden && !menu.contains(event.target) && !menuButton.contains(event.target)) close();
    });
  }

  const title = document.querySelector(".notebook-reader > header h1");
  if (title && !title.querySelector(".title-accent")) {
    const text = title.textContent;
    const split = text.indexOf(" — ");
    const accent = document.createElement("span");
    accent.className = "title-accent";
    accent.textContent = split < 0 ? text : text.slice(split + 3);
    title.replaceChildren(...(split < 0 ? [] : [document.createTextNode(text.slice(0, split + 3))]), accent);
  }
})();