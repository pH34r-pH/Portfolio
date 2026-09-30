/* Shared shell behavior: one art direction, environmental light/dark appearance. */
(() => {
  const root = document.documentElement;
  const storageKey = "portfolio-theme";

  function readTheme() {
    try {
      const value = localStorage.getItem(storageKey);
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  }

  function applyTheme(value, persist = false) {
    if (value) root.dataset.theme = value;
    else delete root.dataset.theme;
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      const dark = (root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
      button.setAttribute("aria-label", dark ? "Use light appearance" : "Use dark appearance");
      button.setAttribute("aria-pressed", String(dark));
      button.textContent = dark ? "Light" : "Dark";
    });
    if (persist) {
      try {
        if (value) localStorage.setItem(storageKey, value);
        else localStorage.removeItem(storageKey);
      } catch {}
    }
  }

  applyTheme(readTheme());
  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-theme-toggle]");
    if (!button) return;
    const current = root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(current === "dark" ? "light" : "dark", true);
  });

  addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) applyTheme(readTheme());
  });

  const menuButton = document.querySelector(".menu-toggle");
  const menu = document.querySelector("#site-menu");
  if (menuButton && menu) {
    const close = (restoreFocus = false) => {
      menu.hidden = true;
      menuButton.setAttribute("aria-expanded", "false");
      if (restoreFocus) menuButton.focus();
    };
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") === "true";
      menu.hidden = open;
      menuButton.setAttribute("aria-expanded", String(!open));
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !menu.hidden) close(true);
    });
    document.addEventListener("click", event => {
      if (!menu.hidden && !menu.contains(event.target) && !menuButton.contains(event.target)) close();
    });
    menu.querySelectorAll("a").forEach(link => link.addEventListener("click", () => close()));
  }
})();