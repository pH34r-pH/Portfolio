import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium, expect } from "@playwright/test";
import { auditPublishedBrowserPython } from "./article-browser-audit.mjs";

const runtime = await readFile(new URL("../site/assets/article-runtime.js", import.meta.url), "utf8");
const lite = `if (location.pathname.startsWith('/missing-core/')) {
  const append = document.head.append.bind(document.head);
  document.head.append = element => { if (!element.src?.endsWith('/index.js')) append(element); };
}`;
// Only the third-party kernel is a fixture. The published runtime owns the real
// button, retry, pending-request deduplication and output lifecycle in Chromium.
const core = `window.thebe = { bootstrap: async () => {
  const scenario = location.pathname.split('/')[1];
  if (scenario === 'network-block') await fetch('/pyodide-fixture.wasm');
  if (scenario === 'other-error') throw new Error('Non-network bootstrap failure');
  window.thebe.notebook = {
    session: { kernel: scenario === 'missing-kernel' ? null : {} },
    code: [{ execute: async source => {
      if (scenario === 'hung-execute' || scenario === 'late-network-block') {
        document.querySelector('[data-output]').textContent = 'Waiting for Python worker';
        if (scenario === 'late-network-block') await fetch('/pyodide-fixture.wasm').catch(() => {});
        return new Promise(() => {});
      }
      document.querySelector('[data-output]').textContent = source;
      return { error: false };
    } }]
  };
} };`;
const html = `<!doctype html><html lang="en"><title>Browser Python audit fixture</title><body>
  <section data-article-execution>
    <button data-load-browser-runtime>Load browser Python</button>
    <p data-runtime-status></p>
  </section>
  <pre data-executable>print(42)</pre><div data-output>Saved output</div>
  <script src="/article-runtime.js"></script>
</body></html>`;
const server = createServer((request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const javascript = path.endsWith(".js");
  const body = path === "/article-runtime.js" ? runtime
    : path === "/assets/thebe/index.js" ? core
    : path === "/assets/thebe/thebe-lite.min.js" ? lite
    : javascript || path.endsWith(".css") ? "" : html;
  const contentType = javascript ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html";
  response.writeHead(200, { "content-type": `${contentType}; charset=utf-8` });
  response.end(body);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const scenario of ["ready", "network-block", "missing-kernel", "other-error", "hung-execute", "late-network-block", "missing-core"]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.route("**/pyodide-fixture.wasm", route => route.abort("failed"));
      await page.goto(`http://127.0.0.1:${server.address().port}/${scenario}/`);
      const button = page.locator("[data-load-browser-runtime]");
      const originalButton = await button.elementHandle();
      let result;
      const expectedError = {
        "missing-kernel": /attached browser kernel/,
        "other-error": /captured Pyodide\/network block/,
        "hung-execute": /execution timed out.*Browser Python ready.*Waiting for Python worker.*"networkFailures":\[\]/,
        "late-network-block": /execution timed out.*Browser Python ready.*Waiting for Python worker.*pyodide-fixture\.wasm/,
        "missing-core": /core request timed out.*Starting browser Python.*Loading the local JupyterLite/,
      }[scenario];
      if (expectedError) {
        const deadlines = { executionTimeoutMs: 1000, ...(scenario === "missing-core" ? { coreTimeoutMs: 1000 } : {}) };
        await assert.rejects(auditPublishedBrowserPython(page, deadlines), expectedError,
          `The audit must reject ${scenario} rather than accepting a false ready/network-block result`);
      } else {
        result = await auditPublishedBrowserPython(page);
        assert.equal(result.outcome, scenario === "ready" ? "executed" : "blocked-runtime");
      }
      if (scenario === "network-block") {
        assert.equal(result.networkFailures.length, 1);
        assert.match(result.networkFailures[0].url, /\/pyodide-fixture\.wasm$/);
      }
      assert.equal(await originalButton.evaluate(element => element === document.querySelector("[data-load-browser-runtime]")), true,
        "all retry/starting/ready labels belong to the original button");
      const expectedLabel = scenario === "missing-core" ? "Starting browser Python…"
        : ["network-block", "other-error"].includes(scenario) ? "Try browser Python again" : "Browser Python ready";
      await expect(button).toHaveText(expectedLabel);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
console.log("Browser Python audit passed: stable button identity, retry/deduplication, attached-kernel execution, user-visible network block, and rejection of false readiness, unclassified failures, hung execution, late worker failure and missing core requests.");
