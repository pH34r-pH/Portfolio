export async function collectNotebookCellCoverage(panel, expected) {
  const notebookNode = panel.querySelector(".jp-Notebook");
  if (!notebookNode) return { expected: expected.length, matched: [], scrollStates: 0, scroller: "missing .jp-Notebook" };
  const candidates = [panel, ...panel.querySelectorAll("*"), panel.parentElement, panel.parentElement?.parentElement, document.scrollingElement]
    .filter(Boolean);
  const scrollContainers = candidates.filter(element => {
    const style = getComputedStyle(element);
    return element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(style.overflowY);
  });
  const scroller = scrollContainers.find(element => element === notebookNode || element.contains(notebookNode))
    || scrollContainers.find(element => notebookNode.contains(element))
    || document.scrollingElement;
  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const step = Math.max(160, Math.floor(scroller.clientHeight * 0.7));
  const positions = [];
  for (let top = 0; top < maxScroll; top += step) positions.push(top);
  positions.push(maxScroll);
  const snapshots = [];
  for (const top of [...new Set(positions)]) {
    scroller.scrollTop = top;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    snapshots.push([...notebookNode.querySelectorAll(".jp-Cell")].map(cell => ({
      id: cell.getAttribute("data-cell-id") || cell.dataset.id || "",
      type: cell.classList.contains("jp-CodeCell") ? "code" : "markdown",
      text: (cell.querySelector(cell.classList.contains("jp-CodeCell") ? ".cm-content" : ".jp-RenderedHTMLCommon") || cell).innerText || "",
    })));
  }
  const normalize = value => value.replace(/\s+/g, " ").trim();
  const matched = expected.map(cell => {
    const source = normalize(cell.source);
    const exactCellId = cell.id && snapshots.some(snapshot => snapshot.some(rendered => rendered.id === cell.id));
    if (exactCellId) return true;
    if (cell.type === "code") {
      return snapshots.some(snapshot => snapshot.some(rendered => rendered.type === "code" && normalize(rendered.text).includes(source)));
    }
    const firstHeading = cell.source.split(/\r?\n/).find(line => line.trim())
      ?.replace(/^#{1,6}\s*/, "").replace(/[\\*_`]/g, "").trim() || "";
    return Boolean(firstHeading) && snapshots.some(snapshot => snapshot.some(rendered => rendered.type === "markdown" && normalize(rendered.text).includes(normalize(firstHeading))));
  });
  return {
    expected: expected.length,
    matched,
    scrollStates: snapshots.length,
    renderedPerState: snapshots.map(snapshot => snapshot.length),
    scroller: { tag: scroller.tagName, className: String(scroller.className || ""), clientHeight: scroller.clientHeight, scrollHeight: scroller.scrollHeight },
    scrollContainers: scrollContainers.slice(0, 20).map(element => ({
      tag: element.tagName,
      className: String(element.className || ""),
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    })),
  };
}
