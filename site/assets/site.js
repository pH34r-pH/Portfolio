async function loadPublication() {
  const target = document.querySelector("#provenance-data"),
    list = document.querySelector("#notebook-list"),
    build = document.querySelector("#build-id");
  try {
    const response = await fetch("/publication.json", { cache: "no-store" });
    if (!response.ok) throw new Error();
    const manifest = await response.json(),
      sources = manifest.sources || {};
    if (target)
      target.textContent = Object.entries(sources)
        .map(([k, v]) => k + "  " + String(v.commit || "").slice(0, 12))
        .join("\n");
    if (build)
      build.textContent = sources.portfolio?.commit
        ? " / " + sources.portfolio.commit.slice(0, 8)
        : "";
    if (list && manifest.notebooks?.length) {
      const notebooks = [...manifest.notebooks]
        .filter((n) => n.slug !== "visual_intuition_atlas")
        .sort((a, b) => {
          if (a.sequence && b.sequence && a.sequence !== b.sequence)
            return b.sequence - a.sequence;
          return (b.path || "").localeCompare(a.path || "", undefined, {
            numeric: true,
          });
        });
      list.replaceChildren(
        ...notebooks.map((n, i) => {
          const a = document.createElement("article");
          a.className = "card";
          a.dataset.index = String(i + 1).padStart(2, "0");
          const h = document.createElement("h3");
          h.textContent = n.title || n.path;
          const meta = document.createElement("p");
          meta.className = "card-meta";
          meta.textContent = n.exampleKind === "illustrative"
            ? "Readable notebook · illustrative code"
            : "Readable notebook · executable source";
          const question = document.createElement("p");
          question.className = "card-question";
          question.textContent = n.question || "";
          const links = document.createElement("div");
          links.className = "links";
          const read = document.createElement("a");
          read.href =
            "/notebooks/" +
            encodeURIComponent(
              n.slug ||
                n.path
                  .split("/")
                  .pop()
                  .replace(/\.ipynb$/, ""),
            ) +
            "/";
          read.textContent = "Read notebook";
          const lab = document.createElement("a");
          lab.href =
            "/lab/lab/index.html?path=" +
            encodeURIComponent(
              n.jupyterPath || n.path.replace(/^publication\/notebooks\//, ""),
            );
          lab.textContent = n.exampleKind === "illustrative"
            ? "Run example ↗" : "Inspect in Lab ↗";
          links.append(read, lab);
          a.append(h, question, meta, links);
          return a;
        }),
      );
    }
  } catch (e) {
    if (list) list.innerHTML = "<p>Publication catalog unavailable.</p>";
    if (target) target.textContent = "Build metadata unavailable.";
  }
}
loadPublication();
async function loadExperimentPackages() {
  const link = document.querySelector("#experiment-download"),
    status = document.querySelector("#experiment-download-status");
  if (!link) return;
  // An unavailable package must have no navigable/downloadable destination,
  // including before the index responds and when JavaScript is unavailable.
  link.removeAttribute("href");
  try {
    const r = await fetch("/experiments/index.json", { cache: "no-store" });
    if (!r.ok) throw new Error();
    const index = await r.json(),
      pkg = index.packages?.find((p) => p.id === "issue-164-adamw");
    if (!pkg) throw new Error();
    if (pkg.status === "qualified") link.href = pkg.download;
    link.setAttribute("aria-disabled", String(pkg.status !== "qualified"));
    status.textContent =
      pkg.status === "qualified"
        ? "Qualified · SHA-256 " + pkg.sha256.slice(0, 12) + "…"
        : "Qualification pending · download unavailable";
    const meta = document.querySelector("#package-metadata");
    if (meta && pkg.status === "qualified") {
      const rows = [
        ["Profile", pkg.profile],
        ["Standards", (pkg.standards || []).join(" · ")],
        ["Reproduction", pkg.reproductionLevel],
        ["Agent entry", pkg.entrypoints?.metadata],
        ["Receipt", pkg.receipt?.status],
      ];
      meta.replaceChildren(
        ...rows.flatMap(([k, v]) => {
          const dt = document.createElement("dt"),
            dd = document.createElement("dd");
          dt.textContent = k;
          dd.textContent = v || "pending";
          return [dt, dd];
        }),
      );
      meta.hidden = false;
    }
    if (pkg.status !== "qualified")
      link.addEventListener("click", (e) => e.preventDefault());
  } catch (e) {
    link.setAttribute("aria-disabled", "true");
    status.textContent = "Package index unavailable";
    link.addEventListener("click", (e) => e.preventDefault());
  }
}
loadExperimentPackages();
