import { ModelStartup } from "./model-startup.js";

const root = document.querySelector(".myst-reader .article-model-machine[data-model-startup]");
if (root) {
  const startup = new ModelStartup(root);
  root.modelStartup = startup;

  startup.onStart = async () => {
    await import("./model-machine.js");
    const controller = root.machineController;
    root.dispatchEvent(new CustomEvent("portfolio:model-ready"));
    root.dispatchEvent(new CustomEvent("portfolio:model-focus", {
      detail: { part: root.dataset.articleContext || root.dataset.modelFocus || "all", source: "article" },
    }));
    return controller?.boot() ?? null;
  };

  startup.onQuietChange = quiet => {
    if (quiet && root.machineController) root.machineController.fallback("quiet-mode", true);
    else if (!quiet && startup.started) startup.start({ retained: true });
  };

  if (!startup.quiet && startup.started) startup.start({ retained: true });
}
