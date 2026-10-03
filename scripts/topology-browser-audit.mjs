import assert from "node:assert/strict";
import { expect } from "@playwright/test";

function currentTopologySelection() {
  return history.state?.topologySelection;
}

export async function auditPhoneTopologySelection(page,articles,base) {
  const selectedArticle = articles.find(article => (article.dependsOn && article.dependsOn.length)
    || articles.some(candidate => candidate.dependsOn && candidate.dependsOn.includes(article.slug))) || articles[0];
  const node = page.locator('.topology-node[data-slug="' + selectedArticle.slug + '"]');
  await node.tap();
  await expect(node).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-research-topology]")).toHaveAttribute("data-selected", selectedArticle.slug);
  assert.ok(await page.locator(".topology-edges path.is-active").count() > 0,
    "touch-selected connected milestone activates its dependency edge");
  const heading = selectedArticle.shortTitle || (selectedArticle.title && selectedArticle.title.replace(/^Milestone\s+\d+\s+[—-]\s+/i, "")) || selectedArticle.slug;
  await expect(page.locator("[data-topology-detail] h3")).toHaveText(heading);
  const readArticle = page.locator(".topology-detail-actions a");
  await expect(readArticle).toHaveAttribute("href", selectedArticle.url);
  await readArticle.tap();
  await expect(page).toHaveURL(base + selectedArticle.url);
  await expect(page.locator("article.myst-reader h1")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(base + "/research/");
  await expect(page.locator(".topology-node")).toHaveCount(articles.length);
  await expect(node).toHaveAttribute("aria-pressed", "true");
  await expect(node).toHaveClass(/is-selected/);
  await expect(page.locator("[data-research-topology]")).toHaveAttribute("data-selected", selectedArticle.slug);
  await expect(page.locator("[data-topology-detail] h3")).toHaveText(heading);
  assert.equal(await page.evaluate(currentTopologySelection), selectedArticle.slug,
    "Back restores the selected research milestone in its history entry");
  assert.ok(await page.locator(".topology-edges path.is-active").count() > 0,
    "Back restores active dependency edges for the selected milestone");
}
