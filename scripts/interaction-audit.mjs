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

async function generatedArticle(page, path) {
  if (!path.startsWith("/articles/")) return;
  await expect(page.locator("article.myst-reader")).toBeVisible();
  await expect(page.locator("[data-article-model]")).toBeVisible();
  await expect(page.getByRole("link",{name:/Canonical MyST source/})).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
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
  await generatedArticle(page,path);
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