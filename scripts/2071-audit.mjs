import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { auditPhoneTopologySelection } from "./topology-browser-audit.mjs";

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

async function auditSearchMetadataMatches(browser) {
  const context = await browser.newContext();
  await context.route("**/pagefind/pagefind.js", route => route.fulfill({
    contentType: "text/javascript",
    body: `
      export async function options() {}
      export async function init() {}
      export async function search() {
        const item = (title, words, matchedMetaFields) => ({
          words, matchedMetaFields,
          data: async () => ({ url: "/research/", meta: { title }, excerpt: title })
        });
        return { results: [
          ...Array.from({ length: 9 }, () => item("Image URL only", [], ["image"])),
          item("Title-only match", [], ["title"]),
          item("Body match with image metadata", [1], ["image"]),
          item("Image description match", [], ["image_alt"])
        ] };
      }
    `,
  }));
  const page = await context.newPage();
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Control+K");
  await page.locator("#portfolio-search").fill("metadata fixture");
  await expect(page.locator(".search-status")).toHaveText("3 results.");
  await expect(page.locator(".search-results strong")).toHaveText([
    "Title-only match", "Body match with image metadata", "Image description match",
  ]);
  await context.close();
}

async function auditSearchDialog(page, hasPagefind, manifest) {
  await page.keyboard.press("Control+K");
  const dialog = page.locator("dialog.search-dialog");
  await expect(dialog).toBeVisible();
  const input = page.locator("#portfolio-search");
  await expect(input).toBeFocused();
  if (hasPagefind) {
    const results = page.locator(".search-results");
    await expect(page.locator(".search-status")).toHaveText("Type at least two characters.");
    for (const query of ["portfolio-no-match-48271", "qzxvkjwbnm48271"]) {
      await input.fill("");
      await expect(page.locator(".search-status")).toHaveText("Type at least two characters.");
      await input.fill(query);
      await expect(page.locator(".search-status")).toHaveText("No matching research.", { timeout: 10000 });
      await expect(results.locator("li")).toHaveCount(0);
    }
    await input.fill("");
    await expect(page.locator(".search-status")).toHaveText("Type at least two characters.");
    await expect(results.locator("li")).toHaveCount(0);
    await input.fill("hypersphere");
    await expect(page.locator(".search-status")).toContainText(/result/i, { timeout: 10000 });
    const target = manifest?.articles?.find(article => article.slug === "005-unit-hypersphere-anomaly");
    const result = target
      ? results.locator(`a[href="${target.url}?highlight=hypersphere"]`).first()
      : results.getByRole("link").first();
    await expect(result).toBeVisible();
    const destination = await result.getAttribute("href");
    assert.ok(destination, "search result has an article destination");
    await result.click();
    await expect(page).toHaveURL(new URL(destination, base).href);
    await expect(page.locator("article.myst-reader h1")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(base + "/");
    await expect(page.locator("[data-digital-home], .machine-landing").first()).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(new URL(destination, base).href);
    await expect(page.locator("article.myst-reader h1")).toBeVisible();
  }

  if (!hasPagefind) console.log("Pagefind result states not exercised: this exact site surface has no bundled /pagefind/pagefind.js index.");
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  const close = page.getByRole("button", { name: "Close search" });
  const trigger = page.getByRole("button", { name: /Search/ });
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) await trigger.tap();
  else await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) await trigger.tap();
  else await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) await close.tap();
  else await close.click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

async function auditVisibleMachine(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const engineRequests = [];
  page.on("request", request => {
    if (request.url().includes("three@0.186.1")) engineRequests.push(request.url());
  });
  await page.goto(base + "/?model-audit=1", { waitUntil: "networkidle" });
  const machine = page.locator("[data-model-machine]").first();
  await expect(machine).toBeVisible();
  if (await machine.getAttribute('data-digital-home') === null) {
    assert.equal(engineRequests.length, 0, 'Below-fold viewer defers the engine');
    await machine.scrollIntoViewIfNeeded();
  } else {
    await expect(machine.locator('.digital-visual')).toBeInViewport();
    assert.equal(engineRequests.length,0,'Homepage renderer waits for explicit Start intent');
    await page.getByRole('button',{name:'Start interactive model'}).focus();
    await page.keyboard.press('Enter');
  }
  await expect(machine).toHaveAttribute("data-render", /webgl|fallback/, { timeout: 30000 });
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
  await expect(machine).toHaveAttribute("data-background-motion", "static");
  await expect(page.locator(".digital-model-loop-poster")).toBeVisible();
  await expect(page.locator(".digital-machine-audit-surface")).toBeHidden();
  assert.equal(await page.evaluate(() => Boolean(window.PortfolioModelStartup)), false,
    "Normal reduced-motion homepage does not initialize the audit-only renderer");
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

async function auditPhoneTopologyKeyboard(page,nodes,layout) {
  assert.ok(layout.boxes.every((box) => box.left >= layout.viewport.left - 1 && box.right <= layout.viewport.right + 1),
    `phone topology node escaped its viewport: ${JSON.stringify(layout)}`);
  await nodes.first().focus();
  await nodes.first().press("ArrowDown");
  await expect(nodes.nth(1)).toBeFocused();
  await expect(nodes.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-topology-detail] h3")).toBeVisible();
  await nodes.nth(1).press("Home");
  await expect(nodes.first()).toBeFocused();
  await expect(nodes.first()).toHaveAttribute("aria-pressed", "true");
  await nodes.first().press("End");
  await expect(nodes.last()).toBeFocused();
  await expect(nodes.last()).toHaveAttribute("aria-pressed", "true");
}

async function auditPhoneTopology(page,nodes,layout,articles) {
  if (!(await page.evaluate(() => innerWidth <= 640))) return;
  await auditPhoneTopologyKeyboard(page,nodes,layout);
  await auditPhoneTopologySelection(page,articles,base);
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
  await auditPhoneTopology(page,nodes,layout,manifest.articles);
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
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const manifest = await optionalJson(context, "/publication.json");
  const hasPagefind = await pagefindAvailable(context);
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.evaluate(()=>document.fonts.ready);
  await auditPaintedText(page,['.person-intro .lede','.proof-line','.actions a','.program-grid article p','.menu-toggle']);
  await auditSearchDialog(page, hasPagefind, manifest);
  await auditTopology(page, manifest);
  if(manifest?.articles?.length)await auditPaintedText(page,['.topology-node strong','.topology-node small']);
  await auditArticleMachine(page, manifest);
  await auditPagefindBoundaries(page, manifest);
  await context.close();
  await auditVisibleMachine(browser);
  await auditReducedMotionMachine(browser);
  await auditSearchMetadataMatches(browser);
  console.log(`2071 audit passed${manifest ? " for exact publication bundle" : " for source surface"}.`);
} finally {
  await browser.close();
}
