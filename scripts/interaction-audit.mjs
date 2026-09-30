import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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

async function auditArticle(page, manifest, path, width) {
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
  if (article.slug === "005-unit-hypersphere-anomaly") {
    const packageLink = 'a[href="https://experiments.tyharbin.com/experiments/muon-unit-hypersphere-depth3-multiseed-v1-final-87409154/"]';
    await expect(page.locator('article.myst-reader').locator(packageLink)).toHaveCount(1);
    await expect(page.locator('aside[aria-label="Compiled experiment reference"]').locator(packageLink)).toHaveCount(1);
  }
  if (article.slug === "accessible-does-not-imply-used") {
    await expect(page.locator('a[href*="experiments.tyharbin.com/experiments/"]')).toHaveCount(0);
    await expect(page.locator("article.myst-reader")).toContainText("An exact frozen-model replay package is not currently published.");
  }
}

async function auditNotebook(page) {
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "← Research index" }).first())
    .toHaveAttribute("href", "/research/");
  for (const code of await page.locator(".highlight").all()) {
    await code.focus();
    await expect(code).toBeFocused();
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

async function auditArticleEnhancements(page) {
  await page.setContent('<main><figure id="unit-circle-readout"><img alt="Synthetic unit-circle fallback" src="/static.svg"><figcaption>Synthetic only.</figcaption></figure><section data-article-execution><button type="button" data-load-browser-runtime>Load browser Python</button><p data-runtime-status role="status" aria-live="polite">Browser code has not been loaded.</p></section></main>');
  await page.addScriptTag({ path: "site/assets/article-runtime.js" });
  await expect(page.locator("#unit-circle-readout img")).toBeHidden();
  const slider = page.getByRole("slider", { name: "Rotate the synthetic readout direction" });
  await expect(slider).toHaveAttribute("aria-describedby", "projection-help projection-value");
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("5");
  await expect(page.locator("#projection-value")).toContainText("Angle 5°. Synthetic projection: 1.00.");
  await page.getByRole("button", { name: "Reset direction" }).click();
  await expect(slider).toHaveValue("0");
  await expect(page.locator("[data-load-browser-runtime]")).toBeEnabled();
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
  await auditOverflow(page, width, path);
  await auditAccessibility(page, width, path);
  if (path === "/atlas/") await auditAtlasCompatibility(page);
  if (path.startsWith("/notebooks/")) await auditNotebook(page);
  if (path.startsWith("/articles/")) await auditArticle(page, manifest, path, width);
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
  await auditNavigationPersistence(page);
  await auditArticleEnhancements(page);
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
