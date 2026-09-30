import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.PORTFOLIO_AUDIT_URL || "http://127.0.0.1:4173";
const widths = [320, 412, 768, 1366];

async function paths(context) {
  const result = ["/", "/research/", "/about/", "/atlas/"];
  const response = await context.request.get(base + "/publication.json");
  if (response.ok() && response.headers()["content-type"]?.includes("json")) {
    const manifest = await response.json();
    if (manifest.articles?.[0]) result.push(manifest.articles[0].url);
    if (manifest.notebooks?.[0]) result.push("/notebooks/" + manifest.notebooks[0].slug + "/");
  }
  return result;
}

async function auditTheme(page, width, path, theme) {
  await page.locator("html").evaluate((node, value) => { node.dataset.theme = value; }, theme);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${width} ${path} ${theme}: horizontal overflow ${overflow}px`);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"])
    .analyze();
  assert.deepEqual(
    axe.violations.map(v => ({ id:v.id, targets:v.nodes.map(n=>n.target) })),
    [],
    `${width} ${path} ${theme}: accessibility`,
  );
}

async function auditThemePersistence(page) {
  await page.goto(base + "/", { waitUntil:"networkidle" });
  const toggle = page.locator("[data-theme-toggle]");
  await toggle.click();
  const chosen = await page.locator("html").getAttribute("data-theme");
  assert.ok(["light","dark"].includes(chosen));
  await page.goto(base + "/research/", { waitUntil:"networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", chosen);
}

async function auditMotionContract(page) {
  await page.goto(base + "/", { waitUntil:"networkidle" });
  const duration = await page.locator(".token-chip").count() ? null : await page.evaluate(() => {
    const sample = document.querySelector(".page-title");
    return sample ? getComputedStyle(sample).transitionDuration : "";
  });
  assert.notEqual(duration, undefined);
}

const browser = await chromium.launch({ headless:true });
try {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport:{ width, height: width < 600 ? 880 : 900 },
      isMobile: width < 600,
      hasTouch: width < 900,
      reducedMotion:"reduce",
    });
    const page = await context.newPage();
    for (const path of await paths(context)) {
      await page.goto(base + path, { waitUntil:"networkidle" });
      for (const theme of ["light","dark"]) await auditTheme(page,width,path,theme);
    }
    await auditThemePersistence(page);
    await auditMotionContract(page);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("Single-direction appearance audit passed for light/dark, mobile/desktop, reduced motion, and accessibility.");