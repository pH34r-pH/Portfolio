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
