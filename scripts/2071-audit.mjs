import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const base = process.env.PORTFOLIO_AUDIT_URL || "http://127.0.0.1:4173";

async function optionalJson(context, path) {
  const response = await context.request.get(base + path);
  if (!response.ok()) return undefined;
  const type = response.headers()["content-type"] || "";
  return type.includes("json") ? response.json() : undefined;
}

async function pagefindAvailable(context) {
  const response = await context.request.get(base + "/pagefind/pagefind.js");
  return response.ok();
}

async function auditSearchDialog(page, hasPagefind) {
  await page.keyboard.press("Control+K");
  const dialog = page.locator("dialog.search-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#portfolio-search")).toBeFocused();
  if (hasPagefind) {
    await page.locator("#portfolio-search").fill("hypersphere");
    await expect(page.locator(".search-status")).toContainText(/result/i, { timeout: 10000 });
    await expect(page.locator(".search-results li").first()).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

async function auditLazyMachine(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const engineRequests = [];
  page.on("request", request => {
    if (request.url().includes("three@0.186.1")) engineRequests.push(request.url());
  });
  await page.goto(base + "/", { waitUntil: "networkidle" });
  assert.equal(engineRequests.length, 0, "Three.js must not enter the initial homepage load");
  const machine = page.locator("[data-model-machine]").first();
  await expect(machine).toBeVisible();
  await machine.scrollIntoViewIfNeeded();
  await expect(machine).toHaveAttribute("data-render", /webgl|fallback/, { timeout: 10000 });
  await context.close();
}

async function auditReducedMotionMachine(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  let engineRequested = false;
  page.on("request", request => {
    if (request.url().includes("three@0.186.1")) engineRequested = true;
  });
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const machine = page.locator("[data-model-machine]").first();
  await machine.scrollIntoViewIfNeeded();
  await expect(machine).toHaveAttribute("data-render", "fallback", { timeout: 5000 });
  await expect(machine.locator("[data-machine-fallback]")).toBeVisible();
  assert.equal(engineRequested, false, "Reduced motion must not load the 3D engine");
  await context.close();
}

function expectedEdges(articles) {
  const slugs = new Set(articles.map(article => article.slug));
  return articles.reduce(
    (sum, article) => sum + (article.dependsOn || []).filter(slug => slugs.has(slug)).length,
    0,
  );
}

async function auditTopology(page, manifest) {
  if (!manifest?.articles?.length) return;
  await page.goto(base + "/research/", { waitUntil: "networkidle" });
  const nodes = page.locator(".topology-node");
  await expect(nodes).toHaveCount(manifest.articles.length);
  await expect(page.locator(".topology-edges path")).toHaveCount(expectedEdges(manifest.articles));
  const frontier = [...manifest.articles].reverse()
    .find(article => article.frontierOpen?.length || article.frontierNext?.length);
  if (frontier) {
    await expect(page.locator(`.topology-node[data-slug="${frontier.slug}"]`)).toHaveClass(/is-selected/);
    await expect(page.locator("[data-topology-detail]")).toContainText(frontier.shortTitle || frontier.title);
  }
  await expect(page.locator("[data-topology-list] li")).toHaveCount(manifest.articles.length);
}

async function auditArticleMachine(page, manifest) {
  if (!manifest?.articles?.length) return;
  const article = manifest.articles.find(item => item.modelFocus) || manifest.articles[0];
  await page.goto(base + article.url, { waitUntil: "networkidle" });
  const machine = page.locator("article.myst-reader [data-model-machine]");
  await expect(machine).toHaveCount(1);
  const expected = {
    tokenization: "tokenizer",
    architecture: "representation",
    "recurrent-state": "representation",
    representation: "representation",
    normalization: "representation",
    consumer: "consumer",
    output: "output",
    full: "all",
  }[article.modelFocus] || "all";
  await expect(machine).toHaveAttribute("data-model-focus", expected);
}

async function auditPagefindBoundaries(page, manifest) {
  if (!manifest) return;
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main[data-pagefind-body]")).toHaveCount(1);
  await expect(page.locator("[data-model-machine][data-pagefind-ignore]")).toHaveCount(1);
  await page.goto(base + "/research/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".research-topology[data-pagefind-ignore]")).toHaveCount(1);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await context.newPage();
  const manifest = await optionalJson(context, "/publication.json");
  const hasPagefind = await pagefindAvailable(context);
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await auditSearchDialog(page, hasPagefind);
  await auditTopology(page, manifest);
  await auditArticleMachine(page, manifest);
  await auditPagefindBoundaries(page, manifest);
  await context.close();
  await auditLazyMachine(browser);
  await auditReducedMotionMachine(browser);
  console.log(`2071 audit passed${manifest ? " for exact publication bundle" : " for source surface"}.`);
} finally {
  await browser.close();
}
