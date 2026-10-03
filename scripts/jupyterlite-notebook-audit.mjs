// This function is serialized into the browser by locator.evaluate, so keep its
// DOM helpers self-contained. Matching and Playwright readiness stay outside it.
async function collectNotebookSnapshots(panel) {
  const notebookNode = panel.querySelector(".jp-Notebook");
  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const ancestors = element => {
    const result = [];
    for (; element; element = element.parentElement) result.push(element);
    return result;
  };
  const isScrollContainer = element => element.clientHeight > 0 && /auto|scroll/.test(getComputedStyle(element).overflowY);
  const candidates = [...new Set([panel, ...panel.querySelectorAll("*"), ...ancestors(panel.parentElement), document.scrollingElement])].filter(Boolean);
  await nextPaint();
  // The nearest scrolling ancestor of a cell owns the virtual viewport. It may
  // not overflow yet, and an outer panel can have an unrelated scrollbar.
  const scroller = ancestors(notebookNode.querySelector(".jp-Cell")?.parentElement || notebookNode).find(isScrollContainer) || document.scrollingElement;
  const snapshot = () => [...notebookNode.querySelectorAll(".jp-Cell")].map(cell => ({
    id: cell.getAttribute("data-cell-id") || cell.dataset.id || "",
    type: cell.classList.contains("jp-CodeCell") ? "code" : "markdown",
    text: (cell.querySelector(cell.classList.contains("jp-CodeCell") ? ".cm-content" : ".jp-RenderedHTMLCommon") || cell).innerText || "",
  }));
  const settledTopSnapshot = async () => {
    let cells, previousState, stableFrames = 0;
    for (let index = 0; index < 60; index += 1) {
      scroller.scrollTop = 0;
      await nextPaint();
      cells = snapshot();
      const state = JSON.stringify([scroller.scrollTop, scroller.scrollHeight, cells]);
      stableFrames = scroller.scrollTop <= 1 && state === previousState ? stableFrames + 1 : 0;
      previousState = state;
      if (stableFrames >= 2) break;
    }
    return cells;
  };
  // Restored scroll positions must be reset before recording the first window;
  // await virtual rendering so a stale mid-document snapshot cannot omit the top.
  const snapshots = [await settledTopSnapshot()];
  const step = Math.max(160, Math.floor(scroller.clientHeight * 0.7));
  let stableBottomFrames = 0, previousHeight = scroller.scrollHeight;
  for (let index = 0; index < 100; index += 1) {
    // Virtual panels grow near their current end: recompute it on every scroll.
    scroller.scrollTop = Math.min(scroller.scrollTop + step, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    await nextPaint();
    snapshots.push(snapshot());
    const height = scroller.scrollHeight;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= height - 1;
    stableBottomFrames = atBottom && height === previousHeight ? stableBottomFrames + 1 : 0;
    previousHeight = height;
    if (stableBottomFrames >= 2) break;
  }
  const describe = element => ({ tag: element.tagName, className: String(element.className || ""),
    clientHeight: element.clientHeight, scrollHeight: element.scrollHeight });
  return { snapshots, scroller: describe(scroller), scrollContainers: candidates.filter(isScrollContainer).slice(0, 20)
    .map(element => ({ ...describe(element), overflowY: getComputedStyle(element).overflowY })) };
}

function matchNotebookCells(expected, snapshots) {
  const normalize = value => value.replace(/\s+/g, " ").trim();
  return expected.map(cell => {
    const source = normalize(cell.source);
    const exactCellId = cell.id && snapshots.some(snapshot => snapshot.some(rendered => rendered.id === cell.id));
    if (exactCellId) return true;
    if (cell.type === "code") {
      return snapshots.some(snapshot => snapshot.some(rendered => rendered.type === "code" && normalize(rendered.text).includes(source)));
    }
    // Markdown quote markers allow at most three leading spaces. Escaped or
    // indented literal greater-than content must remain part of the comparison.
    const firstHeading = cell.source.split(/\r?\n/).find(line => line.trim())
      ?.replace(/^(?: {0,3}>[ \t]?)+/, "").replace(/^#{1,6}\s*/, "").replace(/[\\*_`]/g, "").trim() || "";
    return Boolean(firstHeading) && snapshots.some(snapshot => snapshot.some(rendered => rendered.type === "markdown" && normalize(rendered.text).includes(normalize(firstHeading))));
  });
}

export async function collectNotebookCellCoverage(panel, expected) {
  // A visible NotebookPanel can precede both the notebook and its virtual cells.
  // Playwright bounds readiness even when a missing notebook cannot animate.
  await panel.locator(".jp-Notebook").waitFor({ state: "visible", timeout: 30000 });
  if (expected.length) await panel.locator(".jp-Notebook .jp-Cell").first().waitFor({ state: "attached", timeout: 30000 });
  const { snapshots, ...diagnostics } = await panel.evaluate(collectNotebookSnapshots);
  const seen = new Set(snapshots.flat().map(cell => cell.id || `${cell.type}:${cell.text.replace(/\s+/g, " ").trim()}`));
  return { expected: expected.length, matched: matchNotebookCells(expected, snapshots),
    scrollStates: snapshots.length, distinctRenderedCells: seen.size,
    renderedPerState: snapshots.map(snapshot => snapshot.length), ...diagnostics };
}
