/* Shared by Portfolio pages, generated readers, and the Lab return strip. */
(() => {
  const root = document.documentElement;
  const choices = {
    style: ["orbit", "register", "overprint", "hinge"],
    palette: ["nacre", "oxide", "violet", "high-contrast"],
  };
  function read(kind) {
    try { return localStorage.getItem("portfolio-" + kind); }
    catch { return null; }
  }
  function select(kind, value, persist = false) {
    const name = choices[kind].includes(value) ? value : choices[kind][0];
    root.dataset[kind] = name;
    document.querySelectorAll(`.appearance button[data-${kind}]`).forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset[kind] === name));
    });
    if (persist) {
      try { localStorage.setItem("portfolio-" + kind, name); }
      catch { /* The current page still works when storage is unavailable. */ }
    }
  }
  for (const kind of Object.keys(choices)) select(kind, read(kind));
  document.addEventListener("click", event => {
    const button = event.target.closest?.(".appearance button");
    if (!button) return;
    for (const kind of Object.keys(choices)) {
      if (button.dataset[kind]) select(kind, button.dataset[kind], true);
    }
  });
  addEventListener("storage", event => {
    for (const kind of Object.keys(choices)) {
      if (event.key === "portfolio-" + kind || event.key === null)
        select(kind, read(kind));
    }
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

  // Readers retain the exact authored title and its casing. Only a presentation
  // span is added; source notebook cells and generated scientific output stay intact.
  function prepareReaderTitle() {
    const title = document.querySelector(".notebook-reader > header h1");
    if (!title || title.querySelector(".title-accent")) return;
    const text = title.textContent;
    const split = text.indexOf(" — ");
    const accent = document.createElement("span");
    accent.className = "title-accent";
    accent.textContent = split < 0 ? text : text.slice(split + 3);
    title.replaceChildren(...(split < 0 ? [] : [document.createTextNode(text.slice(0, split + 3))]), accent);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", prepareReaderTitle);
  else prepareReaderTitle();
})();
