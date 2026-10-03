import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function auditCompiledCatalogNavigation(page, context, article, path, base) {
  const packagePath = `/experiments/${article.compiled_experiment.ref}/`;
  const externalUrl = `https://experiments.tyharbin.com${packagePath}`;
  const contentLink = page.locator(`article.myst-reader a[href="${externalUrl}"]`).first();
  const referenceLink = page.locator(`aside[aria-label="Compiled experiment reference"] a[href="${externalUrl}"]`);
  await expect(contentLink).toHaveCount(1);
  await expect(contentLink).toHaveAttribute("target", "_blank");
  await expect(contentLink).toHaveAttribute("rel", /(?:^|\s)noreferrer(?:\s|$)/);
  await expect(referenceLink).toHaveCount(1);
  assert.ok([null, "", "_self"].includes(await referenceLink.getAttribute("target")),
    "compiled-reference link navigates in the reader tab");
  const readerHistoryLength = await page.evaluate(() => history.length);
  const originalPages = context.pages();
  const intercepted = [];
  const handler = async route => {
    const request = route.request();
    intercepted.push({ url: request.url(), navigation: request.isNavigationRequest(), referer: request.headers().referer });
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html lang=\"en\"><title>Compiler destination fixture</title><body><h1>Compiler destination fixture</h1></body></html>",
    });
  };
  await context.route("https://experiments.tyharbin.com/experiments/**", handler);
  let catalogPage;
  try {
    [catalogPage] = await Promise.all([page.waitForEvent("popup", { timeout: 15000 }), contentLink.click()]);
    await expect(catalogPage).toHaveURL(externalUrl);
    await expect(catalogPage.getByRole("heading", { name: "Compiler destination fixture" })).toBeVisible();
    assert.deepEqual(intercepted, [{ url: externalUrl, navigation: true, referer: undefined }],
      "prose link requests the exact catalog fixture without disclosing a referrer");
    assert.equal(await catalogPage.evaluate(() => window.opener === null), true,
      "external catalog cannot access the reader through window.opener");
    assert.equal(context.pages().length, originalPages.length + 1, "prose link opens exactly one catalog tab");
    await expect(page).toHaveURL(base + path);
    assert.equal(await page.evaluate(() => history.length), readerHistoryLength,
      "opening the catalog leaves reader history unchanged");
    await expect(page.locator("article.myst-reader h1")).toHaveText(article.title);
    await catalogPage.close();
    await page.bringToFront();
    assert.deepEqual(context.pages(), originalPages, "closing the catalog returns to the existing reader tab");
    await expect(page.locator("article.myst-reader h1")).toBeVisible();

    await referenceLink.click();
    await expect(page).toHaveURL(externalUrl);
    await expect(page.getByRole("heading", { name: "Compiler destination fixture" })).toBeVisible();
    assert.equal(intercepted.length, 2, "sidebar click requests the explicit catalog fixture");
    assert.equal(intercepted[1].url, externalUrl, "sidebar reaches the exact catalog destination");
    assert.equal(intercepted[1].navigation, true, "sidebar performs a real document navigation");
    await page.goBack();
    await expect(page).toHaveURL(base + path);
    await expect(page.locator("article.myst-reader h1")).toHaveText(article.title);
    await page.goForward();
    await expect(page).toHaveURL(externalUrl);
    await expect(page.getByRole("heading", { name: "Compiler destination fixture" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(base + path);
    await expect(page.locator("article.myst-reader h1")).toHaveText(article.title);
  } finally {
    if (catalogPage && !catalogPage.isClosed()) await catalogPage.close();
    await context.unroute("https://experiments.tyharbin.com/experiments/**", handler);
  }
}
