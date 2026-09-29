const ARTICLE_SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function articleSvgElement(tag, attributes = {}) {
  const element = document.createElementNS(ARTICLE_SVG_NAMESPACE, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function addProjectionControl(figure) {
  if (!figure || figure.dataset.interactionReady === "true") return;
  const image = figure.querySelector("img");
  if (!image) return;
  figure.dataset.interactionReady = "true";

  const control = document.createElement("div");
  control.className = "synthetic-projection-control";
  const graphic = articleSvgElement("svg", {
    viewBox: "0 0 360 240",
    role: "img",
    "aria-labelledby": "projection-title projection-description",
  });
  const title = articleSvgElement("title", { id: "projection-title" });
  title.textContent = "Synthetic signal and readout directions";
  const description = articleSvgElement("desc", { id: "projection-description" });
  description.textContent = "The blue signal direction stays fixed. The orange dashed readout direction rotates with the slider.";
  graphic.append(title, description);
  graphic.append(articleSvgElement("circle", { cx: "120", cy: "120", r: "86", fill: "none", stroke: "currentColor", "stroke-opacity": ".45", "stroke-width": "2" }));
  graphic.append(articleSvgElement("line", { x1: "34", y1: "120", x2: "206", y2: "120", stroke: "currentColor", "stroke-opacity": ".35" }));
  graphic.append(articleSvgElement("line", { x1: "120", y1: "34", x2: "120", y2: "206", stroke: "currentColor", "stroke-opacity": ".35" }));
  graphic.append(articleSvgElement("line", { x1: "120", y1: "120", x2: "192", y2: "120", stroke: "#287a9b", "stroke-width": "8", "stroke-linecap": "round" }));
  const readout = articleSvgElement("line", { x1: "120", y1: "120", x2: "192", y2: "120", stroke: "#a43f2b", "stroke-width": "4", "stroke-dasharray": "7 6", "stroke-linecap": "round" });
  graphic.append(readout, articleSvgElement("circle", { cx: "120", cy: "120", r: "5", fill: "currentColor" }));

  const label = document.createElement("label");
  label.htmlFor = "projection-angle";
  label.textContent = "Rotate the synthetic readout direction";
  const slider = document.createElement("input");
  slider.id = "projection-angle";
  slider.type = "range";
  slider.min = "0";
  slider.max = "360";
  slider.step = "5";
  slider.value = "0";
  slider.setAttribute("aria-describedby", "projection-help projection-value");
  const help = document.createElement("p");
  help.id = "projection-help";
  help.className = "control-help";
  help.textContent = "Rotate the readout to see how alignment changes the projection.";
  const result = document.createElement("output");
  result.id = "projection-value";
  result.setAttribute("aria-live", "polite");
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset direction";

  function update() {
    const angle = Number(slider.value) * Math.PI / 180;
    const x = 120 + 72 * Math.cos(angle);
    const y = 120 - 72 * Math.sin(angle);
    readout.setAttribute("x2", x.toFixed(2));
    readout.setAttribute("y2", y.toFixed(2));
    result.textContent = `Angle ${slider.value}°. Synthetic projection: ${Math.cos(angle).toFixed(2)}.`;
  }
  slider.addEventListener("input", update);
  reset.addEventListener("click", () => {
    slider.value = "0";
    update();
    slider.focus();
  });

  control.append(graphic, label, slider, result, reset, help);
  const caption = figure.querySelector("figcaption");
  figure.insertBefore(control, caption || null);
  image.hidden = true;
  update();
}
addProjectionControl(document.getElementById("unit-circle-readout"));
(() => {
  const scripts = new Map();

  function loadScript(source) {
    if (scripts.has(source)) return scripts.get(source);
    const pending = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        scripts.delete(source);
        reject(new Error(`Could not load ${source}`));
      };
      document.head.append(script);
    });
    scripts.set(source, pending);
    return pending;
  }

  function loadStyle(source) {
    if (document.querySelector(`link[href="${source}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = source;
    document.head.append(link);
  }

  function setupBrowserExecution() {
    document.querySelectorAll("[data-article-execution]").forEach((panel) => {
      const button = panel.querySelector("[data-load-browser-runtime]");
      const status = panel.querySelector("[data-runtime-status]");
      if (!button || !status) return;
      let ready = false;
      button.addEventListener("click", async () => {
        if (button.disabled || ready) return;
        button.disabled = true;
        button.textContent = "Starting browser Python…";
        status.textContent = "Loading the local JupyterLite and Thebe runtime.";
        loadStyle("/assets/thebe/thebe.css");
        loadStyle("/assets/thebe/thebe-core.css");
        const placeholders = [];
        const outputs = [];
        try {
          await loadScript("/assets/thebe/thebe-lite.min.js");
          await loadScript("/assets/thebe/index.js");
          if (!window.thebe?.bootstrap) throw new Error("Thebe did not initialize.");
          // Thebe replaces source placeholders before the kernel is ready.
          // Retain their positions so a failed bootstrap can render them again.
          document.querySelectorAll("[data-executable]").forEach((source) => {
            const marker = document.createComment("browser Python source");
            source.before(marker);
            placeholders.push({ source, marker });
          });
          document.querySelectorAll("[data-output]").forEach((output) => {
            outputs.push({ output, children: Array.from(output.childNodes, child => child.cloneNode(true)) });
          });
          await window.thebe.bootstrap({
            useBinder: false,
            useJupyterLite: true,
            selector: "[data-executable]",
            outputSelector: "[data-output]",
            requestKernel: true,
          });
          ready = true;
          placeholders.forEach(({ marker }) => marker.remove());
          button.textContent = "Browser Python ready";
          status.textContent = "Your local Python session is ready. Edit the cell and use its Run control.";
        } catch (error) {
          if (placeholders.length) {
            window.thebe.notebook?.dispose?.();
            window.thebe.server?.dispose?.();
            placeholders.forEach(({ source, marker }) => {
              if (marker.nextSibling !== source) marker.nextSibling?.replaceWith(source);
              marker.remove();
            });
            outputs.forEach(({ output, children }) => output.replaceChildren(...children));
          }
          button.disabled = false;
          button.textContent = "Try browser Python again";
          status.textContent = `The browser session could not start: ${error.message}`;
        }
      });
    });
  }

  setupBrowserExecution();
})();
