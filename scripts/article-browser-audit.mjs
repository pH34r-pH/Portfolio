import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function auditArticleProjection(page, path) {
  const figure = page.locator("article.myst-reader #unit-circle-readout");
  await expect(figure, `${path}: published article includes its synthetic projection figure`).toHaveCount(1);
  await expect(figure.locator("img")).toBeHidden();
  const slider = page.getByRole("slider", { name: "Rotate the synthetic readout direction" });
  await expect(slider).toHaveAttribute("aria-describedby", "projection-help projection-value");
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("5");
  await expect(page.locator("#projection-value")).toContainText("Angle 5°. Synthetic projection: 1.00.");
  const reset = page.getByRole("button", { name: "Reset direction" });
  await reset.click();
  await expect(slider).toHaveValue("0");
  await expect(slider).toBeFocused();
  await expect(page.locator("#projection-value")).toContainText("Angle 0°. Synthetic projection: 1.00.");
}

async function auditAttachedBrowserKernel(page) {
  const state = await page.evaluate(() => ({
    label: document.querySelector("[data-load-browser-runtime]")?.textContent,
    status: document.querySelector("[data-runtime-status]")?.textContent,
    hasKernel: Boolean(window.thebe?.notebook?.session?.kernel),
    codeCells: window.thebe?.notebook?.code?.length || 0,
  }));
  if (state.label !== "Browser Python ready") {
    return { outcome: "blocked-runtime", status: state.status };
  }
  assert.ok(state.hasKernel, "published article runtime reports ready only with an attached browser kernel");
  assert.ok(state.codeCells > 0, "published article attached executable MyST cells to the kernel");
  const marker = "portfolio-browser-kernel-smoke-7d51";
  const result = await page.evaluate(async markerValue => {
    const cell = window.thebe.notebook.code[0];
    cell.source = `print('${markerValue}')`;
    return cell.execute(cell.source);
  }, marker);
  assert.ok(result && !result.error, `real browser kernel execution completes: ${JSON.stringify(result)}`);
  await expect(page.locator("[data-output]")).toContainText(marker, { timeout: 15000 });
  return { outcome: "executed", marker };
}

export async function auditPublishedBrowserPython(page) {
  const button = page.getByRole("button", { name: "Load browser Python", exact: true });
  const status = page.locator("[data-runtime-status]");
  let liteAttempts = 0;
  let coreAttempts = 0;
  let releaseCoreRequest;
  let coreRequestStarted;
  const coreStarted = new Promise(resolve => { coreRequestStarted = resolve; });
  const externalFailures = [];
  page.on("requestfailed", request => {
    if (/pyodide|\.wasm(?:\?|$)/i.test(request.url())) {
      externalFailures.push({ url: request.url(), error: request.failure()?.errorText || "unknown network failure" });
    }
  });

  await page.route("**/assets/thebe/thebe-lite.min.js", async route => {
    liteAttempts++;
    if (liteAttempts === 1) await route.abort("failed");
    else await route.continue();
  });
  await page.route("**/assets/thebe/index.js", async route => {
    coreAttempts++;
    if (coreAttempts === 1) {
      coreRequestStarted();
      await new Promise(resolve => { releaseCoreRequest = resolve; });
      await route.abort("failed");
    } else await route.continue();
  });

  await button.click();
  await expect(button).toHaveText("Try browser Python again");
  await expect(status).toContainText("could not start");
  await button.click();
  await coreStarted;
  await expect(button).toBeDisabled();
  await expect(button).toHaveText("Starting browser Python…");
  await button.evaluate(element => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(coreAttempts, 1, "duplicate click while the real article bootstrap is pending does not retry it");
  releaseCoreRequest();
  await expect(button).toHaveText("Try browser Python again");
  await expect(button).toBeEnabled();
  await expect(status).toContainText("could not start");
  assert.equal(liteAttempts, 2, "failed local lite asset is retried");
  assert.equal(coreAttempts, 1, "one pending core request is observed before retry");

  await page.unroute("**/assets/thebe/thebe-lite.min.js");
  await page.unroute("**/assets/thebe/index.js");
  await button.click();
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-load-browser-runtime]");
    return button?.textContent === "Browser Python ready" || button?.textContent === "Try browser Python again";
  }, undefined, { timeout: 90000 });
  const outcome = await auditAttachedBrowserKernel(page);
  if (outcome.outcome === "executed") return outcome;
  assert.match(outcome.status || "", /could not start/i, "blocked runtime is reported to the actual article user");
  assert.ok(externalFailures.length > 0,
    `article runtime failed only with a captured Pyodide/network block; status was ${outcome.status}; requests: ${JSON.stringify(externalFailures)}`);
  return { ...outcome, networkFailures: externalFailures };
}
