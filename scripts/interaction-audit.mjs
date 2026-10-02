import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { auditArticleProjection, auditPublishedBrowserPython } from "./article-browser-audit.mjs";

const base = process.env.PORTFOLIO_AUDIT_URL || "http://127.0.0.1:4173";
const views = [[360, 780], [412, 915], [768, 1016], [1366, 768]];
const themes = ["light", "dark"];
async function loadManifest(context) {
  const response = await context.request.get(base + "/publication.json");
  if (!response.ok() || !response.headers()["content-type"]?.includes("json")) return undefined;
  return response.json();
}

function routePaths(manifest) {
  const paths = ["/", "/research/", "/atlas/"];
  if (!manifest?.notebooks?.length) return paths;
  paths.push("/notebooks/" + manifest.notebooks[0].slug + "/");
  if (manifest.notebooks.some(n => n.slug === "visual_intuition_atlas")) {
    paths.push("/notebooks/visual_intuition_atlas/");
  }
  for (const article of manifest.articles || []) paths.push(article.url);
  return paths;
}

async function clickForViewport(locator, width) {
  if (width < 600) await locator.tap();
  else await locator.click();
}

async function auditMenuAndThemes(page, width) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await clickForViewport(menu, width);
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Site", exact: true })).toBeVisible();
  for (const theme of themes) {
    const button = page.locator(`button[data-theme-choice="${theme}"]`);
    await clickForViewport(button, width);
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme-mode", theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  const firstMenuLink = page.getByRole("navigation", { name: "Site", exact: true }).getByRole("link").first();
  await expect(firstMenuLink).toBeFocused();
  const secondMenuLink = page.getByRole("navigation", { name: "Site", exact: true }).getByRole("link").nth(1);
  await page.keyboard.press("Tab");
  await expect(secondMenuLink).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(firstMenuLink).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
}

async function auditOverflow(page, width, path) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 1, `${width}${path}: page overflows by ${overflow}px`);
}

async function auditAccessibility(page, width, path) {
  for (const theme of themes) {
    await page.locator("html").evaluate((el, value) => {
      el.dataset.themeMode = value;
      el.dataset.theme = value;
    }, theme);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    assert.deepEqual(
      axe.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })),
      [],
      `${width}${path}/${theme}: axe`,
    );
  }
}

async function auditSliderTouch(page, locator, width, options) {
  if (width >= 600) return;
  await locator.scrollIntoViewIfNeeded();
  const track = await locator.boundingBox();
  await page.touchscreen.tap(track.x + track.width / 2, track.y + track.height / 2);
  const value = await locator.inputValue();
  assert.ok(Number(value) > options.min && Number(value) < options.max, options.message);
  await expect(page.locator(options.output)).toHaveText(value + options.suffix);
}

async function auditAtlasCompatibility(page) {
  const destinations = {
    sphere: "/articles/005-unit-hypersphere-anomaly/",
    tangent: "/articles/007-derive-before-training/",
    consumer: "/articles/accessible-does-not-imply-used/",
    horizon: "/articles/008-frozen-mechanism-tests/",
    evidence: "/articles/009-theorem-ledger-method/",
    architecture: "/articles/002-locating-representation-loss/",
    ledger: "/articles/009-theorem-ledger-method/",
  };
  for (const [anchor, destination] of Object.entries(destinations)) {
    const topic = page.locator(`#${anchor}`);
    await expect(topic).toHaveCount(1);
    await expect(topic.getByRole("link")).toHaveAttribute("href", destination);
  }
  await expect(page.locator('header.topbar a[href="/atlas/"]')).toHaveCount(0);
}

async function auditArticleLinks(page, manifest, path) {
  const nativeRoutes = new Set(manifest.articles.map(article => '/' + article.slug.replace(/^\d{3}-/, '')));
  const articleRoutes = new Set(manifest.articles.map(article => article.url));
  for (const link of await page.locator('article.myst-reader a[href]').all()) {
    const href = await link.getAttribute('href');
    if (!href.startsWith('/')) continue;
    const url = new URL(href, base);
    if (url.origin !== new URL(base).origin) continue;
    assert.ok(!nativeRoutes.has(url.pathname.replace(/\/$/, '')), `${path}: unadapted MyST route ${href}`);
    const response = await page.request.get(url.href);
    assert.ok(response.ok(), `${path}: broken local link ${href} (${response.status()})`);
    if (articleRoutes.has(url.pathname)) {
      assert.ok((await response.text()).includes('myst-reader'), `${path}: article link resolved to a different surface`);
    }
  }
}

async function auditBrowserDownload(page, link, href, label, format) {
  await expect(link).toHaveAttribute("href", href);
  await expect(link).toHaveAttribute("download", "");
  const pageUrl = page.url();
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  const filename = decodeURIComponent(new URL(href, base).pathname.split("/").pop());
  assert.equal(download.suggestedFilename(), filename, `${label}: expected downloaded filename`);
  assert.equal(await download.failure(), null, `${label}: browser download must complete`);
  assert.equal(page.url(), pageUrl, `${label}: download must not navigate away from the reader`);
  const path = await download.path();
  assert.ok(path, `${label}: browser should materialize a downloaded file`);
  const bytes = await readFile(path);
  assert.ok(bytes.length > 0, `${label}: downloaded file is nonempty`);
  if (format === "pdf") assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  if (format === "zip") assert.equal(bytes.subarray(0, 2).toString(), "PK");
  if (format === "xml") assert.match(bytes.toString("utf8", 0, Math.min(bytes.length, 256)), /<\?xml|<article/i);
  if (format === "json") {
    const notebook = JSON.parse(bytes.toString("utf8"));
    assert.ok(Array.isArray(notebook.cells), `${label}: downloaded notebook contains cells`);
  }
  return { filename, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function auditArticleDownloads(page, article) {
  if (!article.downloads) return;
  const nav = page.getByRole("navigation", { name: "Article source and downloads", exact: true });
  const results = [];
  for (const [kind, label, format] of [
    ["pdf", "PDF", "pdf"],
    ["docx", "Word", "zip"],
    ["latex", "LaTeX source", "zip"],
    ["jats", "JATS XML", "xml"],
  ]) {
    const href = article.downloads[kind];
    assert.ok(href, `${article.slug}: finished publication manifest lacks ${kind} download`);
    const link = nav.getByRole("link", { name: label, exact: true });
    results.push(await auditBrowserDownload(page, link, href, label, format));
  }
  return results;
}

async function auditPublishedArticleHistory(page, manifest) {
  if (!manifest?.articles?.length) return;
  await page.goto(base + "/research/", { waitUntil: "networkidle" });
  const article = manifest.articles[0];
  const articleLink = page.locator(`#article-list a[href="${article.url}"]`).first();
  await expect(articleLink).toBeVisible();
  await articleLink.click();
  await expect(page).toHaveURL(base + article.url);
  await expect(page.locator("article.myst-reader h1")).toHaveText(article.title);

  const fragment = page.locator('article.myst-reader a[href^="#"]').first();
  await expect(fragment).toBeVisible();
  const hashHref = await fragment.getAttribute("href");
  assert.ok(hashHref && hashHref.length > 1, `${article.url}: same-page anchor has a fragment`);
  await fragment.click();
  await expect(page).toHaveURL(base + article.url + hashHref);
  const targetId = decodeURIComponent(hashHref.slice(1));
  const target = page.locator(`[id=${JSON.stringify(targetId)}]`);
  await expect(target).toBeVisible();
  const [targetBox, topbarBox] = await Promise.all([target.boundingBox(), page.locator(".topbar").boundingBox()]);
  assert.ok(targetBox && topbarBox && targetBox.y >= topbarBox.height - 2,
    `${article.url}${hashHref}: anchor target should clear the sticky site header`);

  await page.goBack();
  await expect(page).toHaveURL(base + article.url);
  await expect(page.locator("article.myst-reader h1")).toHaveText(article.title);
  await page.goBack();
  await expect(page).toHaveURL(base + "/research/");
  await expect(page.locator("#article-list")).toContainText(article.title);
  await page.goForward();
  await expect(page).toHaveURL(base + article.url);
  await expect(page.locator("article.myst-reader h1")).toHaveText(article.title);
  await page.goForward();
  await expect(page).toHaveURL(base + article.url + hashHref);
  await expect(target).toBeVisible();
  const restored = await target.boundingBox();
  assert.ok(restored && restored.y >= topbarBox.height - 2,
    `${article.url}${hashHref}: Forward restores the hash target below the sticky header`);
  assert.ok(await page.evaluate(() => scrollY > 0), `${article.url}${hashHref}: Forward restores anchor scroll position`);
}

async function auditCompiledCatalogNavigation(page, context, article, path) {
  const packagePath = `/experiments/${article.compiled_experiment.ref}/`;
  const externalUrl = `https://experiments.tyharbin.com${packagePath}`;
  const contentLink = page.locator(`article.myst-reader a[href="${externalUrl}"]`).first();
  await expect(contentLink).toHaveCount(1);
  await expect(page.locator(`aside[aria-label="Compiled experiment reference"] a[href="${externalUrl}"]`)).toHaveCount(1);
  let intercepted = false;
  const handler = async route => {
    intercepted = route.request().url() === externalUrl;
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html lang=\"en\"><title>Compiler destination fixture</title><body><h1>Compiler destination fixture</h1></body></html>",
    });
  };
  await context.route("https://experiments.tyharbin.com/experiments/**", handler);
  try {
    await contentLink.click();
    await expect(page).toHaveURL(externalUrl);
    await expect(page.getByRole("heading", { name: "Compiler destination fixture" })).toBeVisible();
    assert.equal(intercepted, true, "catalog navigation is served from the explicit local fixture");
    await page.goBack();
    await expect(page).toHaveURL(base + path);
    await expect(page.locator("article.myst-reader h1")).toHaveText(article.title);
  } finally {
    await context.unroute("https://experiments.tyharbin.com/experiments/**", handler);
  }
}

async function auditWorklogDisclosures(page, width, path) {
  const evidence = page.locator(".compiled-experiment-evidence");
  if (!(await evidence.count())) return;
  const minimumHeight = await page.evaluate(() => matchMedia("(pointer: coarse)").matches ? 48 : 44);
  for (const summary of await evidence.locator("details > summary").all()) {
    await summary.scrollIntoViewIfNeeded();
    const box = await summary.boundingBox();
    assert.ok(box && box.height >= minimumHeight, `${width}${path}: evidence disclosure target is smaller than ${minimumHeight}px`);
    const details = summary.locator("..");
    await clickForViewport(summary, width);
    await expect(details).toHaveJSProperty("open", true);
    await expect(details.locator(":scope > :not(summary)").first()).toBeVisible();
    const protocol = details.locator('pre[aria-label="Full authoritative experiment protocol"]');
    if (await protocol.count()) await expect(protocol).toBeVisible();
    await auditOverflow(page, width, path);
    const overflow = await evidence.evaluate(element => element.scrollWidth - element.clientWidth);
    assert.ok(overflow <= 1, `${width}${path}: expanded evidence overflows by ${overflow}px`);
    await summary.focus();
    await expect(summary).toBeFocused();
    await summary.press("Enter");
    await expect(details).toHaveJSProperty("open", false);
    await expect(summary).toBeFocused();
  }
}

async function auditArticle(page, context, manifest, path, width) {
  const article = manifest.articles.find(item => item.url === path);
  assert.ok(article, `${path}: article must exist in the exact publication manifest`);
  await auditArticleLinks(page, manifest, path);
  await auditWorklogDisclosures(page, width, path);
  await expect(page.locator("article.myst-reader h1")).toHaveText(article.title);
  await expect(page.locator("article.myst-reader [data-executable]")).toHaveCount(1);
  await expect(page.locator("article.myst-reader [data-output][aria-label^='Your session output']"))
    .toHaveCount(1);
  await expect(page.locator("article.myst-reader")).toContainText("Saved output:");
  await expect(page.locator('article.myst-reader a[aria-label="Link to this Section"]')).toHaveCount(0);
  await expect(page.locator('article.myst-reader button.myst-code-copy-icon')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to Article', exact: true })).toHaveCount(0);
  await expect(page.locator('#what-this-does-not-show')).toHaveCount(1);
  for (const icon of await page.locator('article.myst-reader svg[data-slot="icon"]').all()) {
    const box = await icon.boundingBox();
    assert.ok(box && box.width <= 32 && box.height <= 32, `${path}: inline icon exceeds text size`);
  }
  if (await page.locator('article.myst-reader .katex').count()) {
    await expect(page.locator('link[href="/assets/katex/katex.min.css"]')).toHaveCount(1);
    const accessibleLayers = await page.locator('article.myst-reader .katex-mathml').evaluateAll(elements =>
      elements.map(element => ({
        position: getComputedStyle(element).position,
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
    );
    assert.ok(accessibleLayers.every(layer => layer.position === 'absolute' && layer.width <= 2 && layer.height <= 2),
      `${path}: MathML accessibility layer must not duplicate the visible equation`);
    await expect(page.locator('article.myst-reader .katex-html').first()).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Load browser Python" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Canonical MyST source ↗" }))
    .toHaveAttribute("href", new RegExp("research-notes/blob/" + manifest.sources.researchNotes.commit));
  if (width === 1366 && article.url === manifest.articles[0].url) {
    await auditArticleDownloads(page, article);
  }
  if (article.slug === "005-unit-hypersphere-anomaly") {
    const packageLink = 'a[href="https://experiments.tyharbin.com/experiments/muon-unit-hypersphere-depth3-multiseed-v1-final-87409154/"]';
    await expect(page.locator('article.myst-reader').locator(packageLink)).toHaveCount(1);
    await expect(page.locator('aside[aria-label="Compiled experiment reference"]').locator(packageLink)).toHaveCount(1);
    if (width === 1366 && article.compiled_experiment?.ref) {
      await auditCompiledCatalogNavigation(page, context, article, path);
    }
  }
  if (article.slug === "accessible-does-not-imply-used") {
    await expect(page.locator('a[href*="experiments.tyharbin.com/experiments/"]')).toHaveCount(0);
    await expect(page.locator("article.myst-reader")).toContainText("An exact frozen-model replay package is not currently published.");
    if (width === 1366) {
      await auditArticleProjection(page, path);
      const browserPython = await auditPublishedBrowserPython(page);
      console.log(`${path}: MyST browser Python ${browserPython.outcome}: ${JSON.stringify(browserPython)}`);
    }
  }
}

async function auditNotebook(page, manifest, path, width) {
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "← Research index" }).first())
    .toHaveAttribute("href", "/research/");
  for (const code of await page.locator(".highlight").all()) {
    await code.focus();
    await expect(code).toBeFocused();
  }
  const notebook = manifest?.notebooks?.find(item => path === `/notebooks/${item.slug}/`);
  if (!notebook) return;
  const labLink = page.locator('a[href^="/lab/lab/?path="]');
  await expect(labLink).toHaveCount(1, `${path}: notebook reader exposes its local JupyterLite link`);
  await expect(labLink).toHaveAccessibleName(/(?:Run illustrative example|Inspect or run) in Lab/);
  const labHref = await labLink.getAttribute("href");
  assert.ok(labHref?.startsWith("/lab/lab/?path="), `${path}: notebook links to the slash-terminated JupyterLite app route`);
  if (width === 1366) {
    assert.match(notebook.path || "", /^publication\/notebooks\/[^/]+\.ipynb$/,
      `${path}: publication manifest names the preserved notebook URL`);
    const sourceResponse = await page.request.get(`${base}/${notebook.path}`);
    assert.ok(sourceResponse.ok(), `${path}: preserved notebook source resolves (${sourceResponse.status()})`);
    const sourceNotebook = await sourceResponse.json();
    const expectedCells = sourceNotebook.cells.map(cell => ({
      type: cell.cell_type,
      source: Array.isArray(cell.source) ? cell.source.join("") : cell.source,
    }));
    const expectedJupyterPath = notebook.jupyterPath || notebook.path.replace(/^publication\//, "");
    const labNavigation = page.waitForRequest(request => {
      if (!request.isNavigationRequest()) return false;
      const target = new URL(request.url());
      return target.pathname === "/lab/lab/" && target.searchParams.get("path") === expectedJupyterPath;
    });
    await labLink.click();
    const request = await labNavigation;
    assert.equal(new URL(request.url()).searchParams.get("path"), expectedJupyterPath,
      `${path}: clicked JupyterLite navigation requests the intended notebook path`);
    await page.waitForURL(url => url.pathname === "/lab/lab/");
    await expect(page.locator("#jupyter-config-data")).toHaveCount(1);
    await expect(page.locator(".jp-NotebookPanel")).toBeVisible({ timeout: 30000 });
    const cellCoverage = await page.locator(".jp-NotebookPanel").evaluate(async (panel, expected) => {
      const notebookNode = panel.querySelector(".jp-Notebook");
      if (!notebookNode) return { expected: expected.length, matched: [], scrollStates: 0, scroller: "missing .jp-Notebook" };
      let scroller = notebookNode;
      while (scroller && scroller !== panel.parentElement) {
        const style = getComputedStyle(scroller);
        if (scroller.scrollHeight > scroller.clientHeight + 1 && /auto|scroll/.test(style.overflowY)) break;
        scroller = scroller.parentElement;
      }
      if (!scroller || scroller === panel.parentElement) scroller = document.scrollingElement;
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
          type: cell.classList.contains("jp-CodeCell") ? "code" : "markdown",
          text: (cell.querySelector(cell.classList.contains("jp-CodeCell") ? ".cm-content" : ".jp-RenderedHTMLCommon") || cell).innerText || "",
        })));
      }
      const normalize = value => value.replace(/\s+/g, " ").trim();
      const matched = expected.map(cell => {
        const source = normalize(cell.source);
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
      };
    }, expectedCells);
    console.log(`${path}: JupyterLite selected-notebook cell coverage ${cellCoverage.matched.filter(Boolean).length}/${cellCoverage.expected}; ${cellCoverage.scrollStates} scroll states; rendered ${JSON.stringify(cellCoverage.renderedPerState)}; scroller ${JSON.stringify(cellCoverage.scroller)}`);
    assert.equal(cellCoverage.matched.filter(Boolean).length, sourceNotebook.cells.length, `${path}: exact selected notebook model cell count`);
    assert.ok(cellCoverage.matched.every(Boolean), `${path}: JupyterLite exposes every selected notebook cell source across the scrollable notebook`);
    await page.goBack();
    await expect(page).toHaveURL(base + path);
    await expect(page.locator("main h1")).toHaveText(notebook.title);
  }
  if (width === 1366 && notebook.path) {
    const href = `/publication/notebooks/${encodeURIComponent(notebook.path.split("/").pop())}`;
    const link = page.getByRole("link", { name: "Download preserved notebook", exact: true });
    const result = await auditBrowserDownload(page, link, href, "preserved notebook", "json");
    if (notebook.sha256) assert.equal(result.sha256, notebook.sha256, `${path}: downloaded notebook digest matches publication manifest`);
  }
}

async function auditResearch(page, manifest) {
  await expect(page.getByRole("link", { name: /publication map and Atlas-to-article crosswalk/ }))
    .toHaveAttribute("href", "https://github.com/pH34r-pH/research-notes/blob/main/PUBLICATION-DISPOSITIONS.md");
  if (!manifest?.notebooks?.length) return;
  await expect(page.locator("#notebook-list")).not.toContainText("Updated");
  if (manifest.notebooks[0].question) {
    await expect(page.locator("#notebook-list .card-question").first())
      .toHaveText(manifest.notebooks[0].question);
  }
}

async function auditLegacyExperimentsRedirect(browser) {
  const context = await browser.newContext();
  await context.route("https://experiments.tyharbin.com/**", route => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html lang=\"en\"><title>Compiler destination fixture</title><body><h1>Compiler destination fixture</h1></body></html>",
  }));
  const page = await context.newPage();
  await page.goto(base + "/reproduce/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL("https://experiments.tyharbin.com/");
  await expect(page.getByRole("heading", { name: "Compiler destination fixture" })).toBeVisible();
  await context.close();
}

async function auditRoute(page, context, width, path, manifest, errors) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  assert.deepEqual(errors, [], `${width}${path}: page errors`);
  await auditMenuAndThemes(page, width);
  const reducedMotion = await page.evaluate(() => ({
    enabled: matchMedia("(prefers-reduced-motion: reduce)").matches,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
  }));
  assert.equal(reducedMotion.enabled, true, `${width}${path}: audit context exercises reduced motion`);
  assert.equal(reducedMotion.scrollBehavior, "auto", `${width}${path}: reduced-motion disables smooth document scrolling`);
  await auditOverflow(page, width, path);
  await auditAccessibility(page, width, path);
  if (path === "/atlas/") await auditAtlasCompatibility(page);
  if (path.startsWith("/notebooks/")) await auditNotebook(page, manifest, path, width);
  if (path.startsWith("/articles/")) await auditArticle(page, context, manifest, path, width);
  if (path === "/research/") await auditResearch(page, manifest);
  if (path === "/research/") {
    await page.locator(".skip-link").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  }
  assert.deepEqual(errors, [], `${width}${path}: page errors after interaction`);
}

async function auditNavigationPersistence(page) {
  await page.goto(base + "/");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await page.locator('button[data-theme-choice="dark"]').click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  const research = page.getByRole("navigation", { name: "Site", exact: true })
    .getByRole("link", { name: "Research", exact: true });
  await expect(research).toHaveAttribute("href", "/research/");
  await page.goto(base + "/research/", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(base + "/research/");
  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
}

async function auditView(browser, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 600,
    hasTouch: width < 900,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const manifest = await loadManifest(context);
  for (const path of routePaths(manifest)) {
    await auditRoute(page, context, width, path, manifest, errors);
  }
  if (width === 1366) await auditPublishedArticleHistory(page, manifest);
  await auditNavigationPersistence(page);
  console.log(
    `Route and interaction audit passed: ${width} × ${height}${manifest ? " with published notebook" : ""}`,
  );
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of views) await auditView(browser, width, height);
  await auditLegacyExperimentsRedirect(browser);
} finally {
  await browser.close();
}
