import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.PORTFOLIO_AUDIT_URL || "http://127.0.0.1:4173";
const views = [[320,568],[360,800],[430,932],[768,1016],[1366,768]];

async function manifest(context) {
  const response = await context.request.get(base + "/publication.json");
  if (!response.ok() || !response.headers()["content-type"]?.includes("json")) return null;
  return response.json();
}

function routes(data) {
  const result = ["/","/research/","/about/","/atlas/"];
  if (data?.articles?.length) result.push(...data.articles.map(article => article.url));
  if (data?.notebooks?.length) result.push("/notebooks/" + data.notebooks[0].slug + "/");
  return [...new Set(result)];
}

async function noOverflow(page, width, path) {
  const amount = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(amount <= 1, `${width} ${path}: horizontal overflow ${amount}px`);
}

async function accessible(page, width, path) {
  for (const theme of ["light","dark"]) {
    await page.locator("html").evaluate((node,value) => { node.dataset.theme=value; }, theme);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"])
      .analyze();
    assert.deepEqual(
      result.violations.map(v => ({ id:v.id, targets:v.nodes.map(n=>n.target) })),
      [],
      `${width} ${path} /${theme}: axe`,
    );
  }
}

async function shell(page, width) {
  await expect(page.getByRole("link", { name:/TJHG/ })).toBeVisible();
  await expect(page.locator("[data-search-open]")).toBeVisible();
  await page.locator("[data-search-open]").click();
  await expect(page.locator("#site-search")).toHaveAttribute("open", "");
  await expect(page.locator("#site-search-input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#site-search")).not.toHaveAttribute("open", "");

  const toggle = page.locator("[data-theme-toggle]");
  const before = await page.locator("html").getAttribute("data-theme");
  await toggle.click();
  const after = await page.locator("html").getAttribute("data-theme");
  assert.notEqual(after,before,"theme toggle must change environmental appearance");

  const menu = page.getByRole("button",{name:"Menu",exact:true});
  if (width <= 760) {
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded","true");
    await expect(page.getByRole("navigation",{name:"Site",exact:true})).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded","false");
    await expect(menu).toBeFocused();
  }
}

async function homeModel(page) {
  const root = page.locator("[data-model-lab]").first();
  if (!await root.count()) return;
  await expect(root).toBeVisible();
  await root.locator("[data-model-input]").fill("attention follows useful state");
  await root.locator("[data-model-submit]").click();
  await expect(root.locator("[data-token-rail] .token-chip").first()).toBeVisible();
  await expect(root.locator("[data-model-output]")).not.toHaveText("");
  await expect(root.locator("[data-output-rail] .output-chip").first()).toBeVisible();
}

async function researchMap(page, data, width) {
  if (!data?.articles?.length) return;
  if (width <= 760) {
    const records = page.locator("#research-topology .graph-list-record");
    await expect(records.first()).toBeVisible();
    await expect(records).toHaveCount(data.articles.length);
  } else {
    const graph = page.locator("#research-topology svg");
    await expect(graph).toBeVisible();
    await expect(graph.locator(".graph-node")).toHaveCount(data.articles.length);
  }
  await expect(page.locator("#research-frontier")).toBeVisible();
}

async function articleLinks(page, data, path) {
  if (!data?.articles?.length) return;
  const nativeRoutes = new Set(data.articles.map(article => "/" + article.slug.replace(/^\\d{3}-/, "")));
  const articleRoutes = new Set(data.articles.map(article => article.url));
  for (const link of await page.locator("article.myst-reader a[href]").all()) {
    const href = await link.getAttribute("href");
    if (!href?.startsWith("/")) continue;
    const url = new URL(href, base);
    if (url.origin !== new URL(base).origin) continue;
    assert.ok(!nativeRoutes.has(url.pathname.replace(/\\/$/, "")), `${path}: unadapted MyST route ${href}`);
    const response = await page.request.get(url.href);
    assert.ok(response.ok(), `${path}: broken local link ${href} (${response.status()})`);
    if (articleRoutes.has(url.pathname)) {
      assert.ok((await response.text()).includes("myst-reader"), `${path}: article link resolved to a different surface`);
    }
  }
}

async function generatedArticle(page, path, data) {
  if (!path.startsWith("/articles/")) return;
  const article = data?.articles?.find(item => item.url === path);
  assert.ok(article, `${path}: article must exist in the exact publication manifest`);
  await articleLinks(page, data, path);
  await expect(page.locator("article.myst-reader")).toBeVisible();
  await expect(page.locator("[data-article-model]")).toBeVisible();
  await expect(page.locator("article.myst-reader h1")).toHaveText(article.title);
  await expect(page.locator("article.myst-reader [data-executable]")).toHaveCount(1);
  await expect(page.locator('article.myst-reader a[aria-label="Link to this Section"]')).toHaveCount(0);
  await expect(page.locator("article.myst-reader button.myst-code-copy-icon")).toHaveCount(0);
  await expect(page.getByRole("link",{name:/Canonical MyST source/}))
    .toHaveAttribute("href", new RegExp("research-notes/blob/" + data.sources.researchNotes.commit));
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  if (article.slug === "005-unit-hypersphere-anomaly") {
    const packageLink = 'a[href="https://experiments.tyharbin.com/experiments/muon-unit-hypersphere-depth3-multiseed-v1-final-87409154/"]';
    await expect(page.locator("article.myst-reader").locator(packageLink)).toHaveCount(1);
    await expect(page.locator('aside[aria-label="Compiled experiment reference"]').locator(packageLink)).toHaveCount(1);
  }
  if (article.slug === "accessible-does-not-imply-used") {
    await expect(page.locator('a[href*="experiments.tyharbin.com/experiments/"]')).toHaveCount(0);
    await expect(page.locator("article.myst-reader")).toContainText("An exact frozen-model replay package is not currently published.");
  }
}

async function worklogDisclosures(page, width, path) {
  const evidence = page.locator(".compiled-experiment-evidence");
  if (!(await evidence.count())) return;
  const minimumHeight = await page.evaluate(() => matchMedia("(pointer: coarse)").matches ? 48 : 44);
  for (const summary of await evidence.locator("details > summary").all()) {
    await summary.scrollIntoViewIfNeeded();
    const box = await summary.boundingBox();
    assert.ok(box && box.height >= minimumHeight, `${width} ${path}: evidence disclosure target is smaller than ${minimumHeight}px`);
    const details = summary.locator("..");
    await summary.click();
    await expect(details).toHaveJSProperty("open", true);
    await expect(details.locator(":scope > :not(summary)").first()).toBeVisible();
    const protocol = details.locator('pre[aria-label="Full authoritative experiment protocol"]');
    if (await protocol.count()) await expect(protocol).toBeVisible();
    await noOverflow(page, width, path);
    const overflow = await evidence.evaluate(element => element.scrollWidth - element.clientWidth);
    assert.ok(overflow <= 1, `${width} ${path}: expanded experiment evidence overflows by ${overflow}px`);
    await summary.focus();
    await expect(summary).toBeFocused();
    await summary.press("Enter");
    await expect(details).toHaveJSProperty("open", false);
    await expect(summary).toBeFocused();
  }
}

async function generatedNotebook(page, path) {
  if (!path.startsWith("/notebooks/")) return;
  await expect(page.locator(".notebook-content")).toBeVisible();
  await expect(page.getByRole("link",{name:/Research index/}).first()).toHaveAttribute("href","/research/");
  for (const region of await page.locator(".highlight, .jp-OutputArea-output").all()) {
    await region.focus();
    await expect(region).toBeFocused();
  }
}

async function routeAudit(page,width,path,data,errors) {
  await page.goto(base + path,{waitUntil:"networkidle"});
  assert.deepEqual(errors.splice(0),[],`${width} ${path}: page errors`);
  await shell(page,width);
  await noOverflow(page,width,path);
  await accessible(page,width,path);
  if (path==="/") await homeModel(page);
  if (path==="/research/") await researchMap(page,data,width);
  await generatedArticle(page,path,data);
  await worklogDisclosures(page,width,path);
  await generatedNotebook(page,path);
  assert.deepEqual(errors.splice(0),[],`${width} ${path}: page errors after interaction`);
}

async function persistence(page) {
  await page.goto(base+"/",{waitUntil:"networkidle"});
  await page.locator("[data-theme-toggle]").click();
  const chosen = await page.locator("html").getAttribute("data-theme");
  await page.goto(base+"/research/",{waitUntil:"networkidle"});
  await expect(page.locator("html")).toHaveAttribute("data-theme",chosen);
}

async function searchShortcut(page) {
  await page.goto(base+"/",{waitUntil:"networkidle"});
  await page.keyboard.press("Control+K");
  await expect(page.locator("#site-search-input")).toBeFocused();
  await page.locator("#site-search-input").fill("research");
  await expect(page.locator("#site-search-results .search-result").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("/");
  await expect(page.locator("#site-search-input")).toBeFocused();
  await page.keyboard.press("Escape");
}

const browser=await chromium.launch({headless:true});
try{
  for(const [width,height] of views){
    const context=await browser.newContext({
      viewport:{width,height},isMobile:width<600,hasTouch:width<900,reducedMotion:"reduce"
    });
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    const data=await manifest(context);
    for(const path of routes(data)) await routeAudit(page,width,path,data,errors);
    await persistence(page);
    await searchShortcut(page);
    await context.close();
    console.log(`Interaction audit passed: ${width}×${height}`);
  }
}finally{await browser.close();}