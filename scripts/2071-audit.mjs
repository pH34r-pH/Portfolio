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

async function auditVisibleMachine(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const engineRequests = [];
  page.on("request", request => {
    if (request.url().includes("three@0.186.1")) engineRequests.push(request.url());
  });
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const machine = page.locator("[data-model-machine]").first();
  await expect(machine).toBeVisible();
  if (await machine.getAttribute('data-digital-home') === null) {
    assert.equal(engineRequests.length, 0, 'Below-fold viewer defers the engine');
    await machine.scrollIntoViewIfNeeded();
  } else {
    await expect(machine.locator('.digital-visual')).toBeInViewport();
  }
  await expect(machine).toHaveAttribute("data-render", /webgl|fallback/, { timeout: 10000 });
  const loaded = [...engineRequests];
  assert.deepEqual(loaded.map(url=>new URL(url).pathname).sort(), [
    '/assets/vendor/three@0.186.1/three.core.js',
    '/assets/vendor/three@0.186.1/three.module.js',
  ], 'One locked, locally served engine and its core module');
  await page.locator('#projects').scrollIntoViewIfNeeded();
  await page.evaluate(()=>scrollTo(0,0));
  assert.deepEqual(engineRequests, loaded, 'Native chapter navigation reuses the engine');
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

function topologyLayout(root) {
    const viewport = root.getBoundingClientRect();
    const boxes = [...root.querySelectorAll(".topology-node")].map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    });
    const overlaps = boxes.reduce((count, box, index) => count + boxes.slice(index + 1).filter((other) =>
      box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top,
    ).length, 0);
    return {
      viewport: { left: viewport.left, right: viewport.right },
      boxes,
      overlaps,
      background: getComputedStyle(document.body).backgroundImage,
    };
}

async function auditPaintedText(page,selectors) {
  const metrics=await page.evaluate(selectors=>selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map(node=>{
    const range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect();
    return {selector,content:node.textContent.trim(),width:text.width,height:text.height,visible:node.checkVisibility()};
  })),selectors);
  assert.ok(metrics.length>0,'required text must exist');
  assert.ok(metrics.every(item=>item.content&&item.width>0&&item.height>0&&item.visible),`Required text must paint: ${JSON.stringify(metrics)}`);
}

async function auditFrontierSelection(page,articles) {
  const frontier = [...articles].reverse()
    .find(article => article.frontierOpen?.length || article.frontierNext?.length);
  if (frontier) {
    await expect(page.locator(`.topology-node.is-selected[data-slug="${frontier.slug}"]`)).toHaveCount(1);
    await expect(page.locator("[data-topology-detail]")).toContainText(frontier.shortTitle || frontier.title);
  }
  await expect(page.locator("[data-topology-list] li")).toHaveCount(articles.length);
}

async function auditPhoneTopology(page,nodes,layout) {
  if (await page.evaluate(() => innerWidth <= 640)) {
    assert.ok(layout.boxes.every((box) => box.left >= layout.viewport.left - 1 && box.right <= layout.viewport.right + 1),
      `phone topology node escaped its viewport: ${JSON.stringify(layout)}`);
    await nodes.first().focus();
    await nodes.first().press("ArrowDown");
    await expect(nodes.nth(1)).toBeFocused();
  }
}

async function auditTopology(page, manifest) {
  if (!manifest?.articles?.length) return;
  await page.goto(base + "/research/", { waitUntil: "networkidle" });
  const nodes = page.locator(".topology-node");
  await expect(nodes).toHaveCount(manifest.articles.length);
  await expect(page.locator(".topology-edges path")).toHaveCount(expectedEdges(manifest.articles));
  const layout = await page.locator("[data-research-topology]").evaluate(topologyLayout);
  assert.equal(layout.overlaps, 0, "topology nodes must not overlap");
  assert.ok(layout.background.includes("radial-gradient"), "the page field should use dimensional gradients");
  assert.ok(!layout.background.includes("repeating-linear-gradient"), "the page field must not be a gridline texture");
  await auditFrontierSelection(page,manifest.articles);
  await auditPhoneTopology(page,nodes,layout);
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
  if (await page.locator('[data-digital-home]').count()) {
    await expect(page.locator('.digital-visual[data-pagefind-ignore]')).toHaveCount(1);
    await expect(page.locator('.digital-replay-disclosure[data-pagefind-ignore]')).toHaveCount(1);
    assert.equal(await page.locator('#introduction .lede').evaluate(node=>Boolean(node.closest('[data-pagefind-ignore]'))), false, 'Real homepage prose remains searchable');
    assert.equal(await page.locator('#research-chapter .proof-line').evaluate(node=>Boolean(node.closest('[data-pagefind-ignore]'))), false, 'Research claims remain searchable');
    const homeResults=await page.evaluate(async()=>{
      const {search}=await import('/pagefind/pagefind.js');
      const {results}=await search('strange');
      return Promise.all(results.map(async result=>(await result.data()).url));
    });
    assert.ok(homeResults.some(url=>new URL(url,base).pathname==='/'),'Built index contains the real homepage title');
  } else await expect(page.locator('[data-model-machine][data-pagefind-ignore]')).toHaveCount(1);
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
  await page.evaluate(()=>document.fonts.ready);
  await auditPaintedText(page,['.person-intro .lede','.proof-line','.actions a','.program-grid article p','.menu-toggle']);
  await auditSearchDialog(page, hasPagefind);
  await auditTopology(page, manifest);
  if(manifest?.articles?.length)await auditPaintedText(page,['.topology-node strong','.topology-node small']);
  await auditArticleMachine(page, manifest);
  await auditPagefindBoundaries(page, manifest);
  await context.close();
  await auditVisibleMachine(browser);
  await auditReducedMotionMachine(browser);
  console.log(`2071 audit passed${manifest ? " for exact publication bundle" : " for source surface"}.`);
} finally {
  await browser.close();
}
