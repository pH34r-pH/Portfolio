import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { collectNotebookCellCoverage } from "./jupyterlite-notebook-audit.mjs";

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
const page = await browser.newPage();
const cells = Array.from({ length: 12 }, (_, index) => ({
  id: index % 3 === 0 ? `cell-${index}` : "",
  type: index % 2 === 0 ? "markdown" : "code",
  source: index % 2 === 0 ? `# Heading ${index}\n\nNotebook explanation ${index}` : `value_${index} = ${index}\nprint(value_${index})`,
}));
// JupyterLite omits cell IDs from some rendered Markdown, including blockquotes.
cells[4].source = "> **Quoted heading 4**\n\nNotebook explanation 4";
cells[8].source = "> > ## Nested heading 8";
cells[10].source = "\\> Literal threshold 10";

try {
  for (const delayedNotebook of [false, true]) {
    await page.setContent(`
      <style>
        .jp-NotebookPanel { height: 360px; width: 500px; overflow-y: auto; }
        .notebook-scroll { height: 200px; overflow-y: auto; }
        .jp-Notebook { position: relative; }
        .jp-Cell { position: absolute; height: 100px; width: 100%; }
      </style>
      <div class="jp-NotebookPanel">
        <div class="notebook-scroll">${delayedNotebook ? "" : '<div class="jp-Notebook"></div>'}</div>
        <div style="height:600px">Outer panel scroll trap</div>
      </div>
    `);
    await page.evaluate(({ cells, delayedNotebook }) => {
      const scroller = document.querySelector(".notebook-scroll");
      let notebook = scroller.querySelector(".jp-Notebook");
      let materialized = 8;
      let previousTop = 400;
      window.fixture = { growths: 0, resets: 0 };
      const render = () => {
        if (scroller.scrollTop + scroller.clientHeight >= materialized * 100 - 1 && materialized < cells.length) {
          materialized = cells.length;
          notebook.style.height = `${materialized * 100}px`;
          window.fixture.growths += 1;
        }
        const first = Math.floor(scroller.scrollTop / 100);
        notebook.replaceChildren(...cells.slice(first, Math.min(first + 3, materialized)).map((cell, offset) => {
          const node = document.createElement("div");
          node.className = `jp-Cell ${cell.type === "code" ? "jp-CodeCell" : "jp-MarkdownCell"}`;
          node.style.top = `${(first + offset) * 100}px`;
          if (cell.id) node.setAttribute((first + offset) % 2 ? "data-id" : "data-cell-id", cell.id);
          const content = document.createElement("div");
          content.className = cell.type === "code" ? "cm-content" : "jp-RenderedHTMLCommon";
          const quotedText = { 4: "Quoted heading 4\n\nNotebook explanation 4", 8: "Nested heading 8", 10: "> Literal threshold 10" };
          content.innerText = quotedText[first + offset] ?? (cell.type === "code" ? cell.source : cell.source.replace(/^# /, ""));
          node.append(content);
          return node;
        }));
      };
      scroller.addEventListener("scroll", () => {
        if (previousTop > 0 && scroller.scrollTop === 0) window.fixture.resets += 1;
        previousTop = scroller.scrollTop;
        // A virtual window updates after scrolling, not at scrollTop assignment.
        requestAnimationFrame(() => requestAnimationFrame(render));
      });
      setTimeout(() => {
        if (delayedNotebook) {
          notebook = document.createElement("div");
          notebook.className = "jp-Notebook";
          scroller.append(notebook);
        }
        notebook.style.height = `${materialized * 100}px`;
        scroller.scrollTop = 400;
        render();
      }, 200);
    }, { cells, delayedNotebook });
    const coverage = await collectNotebookCellCoverage(page.locator(".jp-NotebookPanel"), [
      ...cells,
      { id: "absent", type: "code", source: "missing_source = True" },
      { id: "wrong-type", type: "code", source: "Heading 0" },
      { id: "wrong-quote-type", type: "code", source: "Quoted heading 4" },
      { id: "absent-quote", type: "markdown", source: "> **Missing quote**" },
      { id: "changed-quote", type: "markdown", source: "> **Quoted heading 4 changed**" },
      { id: "escaped-literal", type: "markdown", source: "\\> Quoted heading 4" },
      { id: "indented-literal", type: "markdown", source: "    > Quoted heading 4" },
    ]);
    assert.deepEqual(coverage.matched, [...cells.map(() => true), false, false, false, false, false, false, false],
      `Every cell must be visited after ${delayedNotebook ? "notebook" : "cell"} materialization, without inventing source/type coverage`);
    assert.equal(coverage.scroller.className, "notebook-scroll", "The nearest cell scroller wins over a scrollable outer panel");
    assert.equal(coverage.distinctRenderedCells, cells.length, "Restored scrolling must not omit the first cells");
    assert.ok(coverage.renderedPerState[0] > 0, "The first snapshot is a materialized top window");
    assert.ok(coverage.scrollStates > 2, "Coverage traverses the virtual notebook");
    assert.deepEqual(await page.evaluate(() => window.fixture), { growths: 1, resets: 1 },
      "The restored position is reset and traversal follows the expanding virtual height");
  }
} finally {
  await browser.close();
}

console.log("JupyterLite cell coverage passed: delayed notebook/cells, restored top window, nested scroller, growing height, IDs, blockquotes and source/type fallbacks.");
