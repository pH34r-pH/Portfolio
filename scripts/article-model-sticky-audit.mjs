import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.PORTFOLIO_AUDIT_URL || "http://127.0.0.1:4173";
const articleSlug = "012-natural-source-distinctions";
const manifestResponse = await fetch(`${base}/publication.json`);
assert.ok(manifestResponse.ok, "Leaf04 audit requires a finished publication bundle");
assert.match(manifestResponse.headers.get("content-type") || "", /json/);
const manifest = await manifestResponse.json();
const article = manifest.articles?.find(item => item.slug === articleSlug);
assert.ok(article, `Finished bundle must contain ${articleSlug}`);
assert.ok(article.modelFocus, "The selected published article must carry source-owned model context");
const articleUrl = `${base}${article.url}`;
const views = [
  { name: "phone-360", width: 360, height: 800, dpr: 3 },
  { name: "phone-412", width: 412, height: 915, dpr: 2 },
  { name: "tablet", width: 820, height: 1180, dpr: 1 },
  { name: "desktop", width: 1366, height: 768, dpr: 1 },
];
const browser = await chromium.launch({ headless: true });
const evidence = [];

async function snapshot(page) {
  return page.evaluate(() => {
    const reader = document.querySelector(".article-sticky-reader");
    const model = reader?.querySelector(".article-model-machine[data-model-machine]");
    const stage = model?.querySelector("[data-machine-stage]");
    const host = model?.querySelector(".machine-spatial-host");
    const target = host?.dataset.instruments === "spatial" ? host : stage;
    const rect = target?.getBoundingClientRect();
    const stageRect = stage?.getBoundingClientRect();
    const header = document.querySelector(".topbar")?.getBoundingClientRect();
    return {
      scrollY,
      readerHeight: reader?.getBoundingClientRect().height ?? 0,
      readerTop: reader?.getBoundingClientRect().top ?? 0,
      readerBottom: reader?.getBoundingClientRect().bottom ?? 0,
      stageTop: stageRect?.top ?? 0,
      stageHeight: stageRect?.height ?? 0,
      stageDocumentTop: (stageRect?.top ?? 0) + scrollY,
      targetTop: rect?.top ?? 0,
      targetBottom: rect?.bottom ?? 0,
      targetHeight: rect?.height ?? 0,
      targetPosition: target ? getComputedStyle(target).position : null,
      headerBottom: header?.bottom ?? 58,
      mode: host?.dataset.instruments ?? null,
      context: model?.dataset.articleContext ?? null,
      initialFocus: model?.dataset.modelFocus ?? null,
      render: model?.dataset.render ?? null,
      horizontalModel: getComputedStyle(model?.querySelector(".machine-axis-labels") || stage).flexDirection,
      pageWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
    };
  });
}

async function scrollHeading(page, heading) {
  const data = await heading.evaluate(node => ({
    top: node.getBoundingClientRect().top + scrollY,
    focus: node.dataset.modelContext,
  }));
  const targetHeight = await page.evaluate(() => {
    const model = document.querySelector(".article-model-machine");
    const stage = model.querySelector("[data-machine-stage]");
    const host = model.querySelector(".machine-spatial-host");
    return host.dataset.instruments === "spatial" ? host.getBoundingClientRect().height : stage.getBoundingClientRect().height;
  });
  const view = await page.evaluate(() => ({
    height: innerHeight,
    header: document.querySelector(".topbar")?.getBoundingClientRect().height || 58,
    spatial: document.querySelector(".machine-spatial-host")?.dataset.instruments === "spatial",
  }));
  await page.evaluate(({ top, line }) => scrollTo({ top: Math.max(0, top - line), behavior: "instant" }), {
    top: data.top,
    line: Math.min(view.height - 3, view.header + targetHeight + (view.spatial ? 28 : 72)),
  });
  await expect(page.locator(".article-model-machine")).toHaveAttribute("data-article-context", data.focus);
  return data.focus;
}

async function auditView(view) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: view.dpr,
    isMobile: view.width < 600,
    hasTouch: view.width < 900,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    const response = await page.goto(articleUrl, { waitUntil: "networkidle" });
    assert.ok(response?.ok(), `${view.name}: finished article returned ${response?.status()}`);
    const model = page.locator(".article-model-machine[data-model-machine]");
    const stage = model.locator("[data-machine-stage]");
    await expect(model).toHaveCount(1);
    await expect(stage).toHaveCount(1);
    await page.waitForFunction(() => document.querySelector(".article-model-machine")?.classList.contains("model-machine-replay"));

    const initial = await snapshot(page);
    assert.equal(initial.initialFocus, "representation", `${view.name}: source-owned article focus was lost`);
    assert.ok(initial.stageDocumentTop > initial.headerBottom + 200, `${view.name}: the model must start in article flow`);
    assert.ok(initial.readerHeight > initial.stageHeight * 2, `${view.name}: the sticky boundary must contain article prose`);
    assert.ok(initial.pageScrollWidth <= initial.pageWidth + 1, `${view.name}: article overflowed horizontally`);
    assert.equal(initial.horizontalModel, "row", `${view.name}: the model axes must remain left-to-right`);

    const host = model.locator(".machine-spatial-host");
    const headerBottom = await page.locator(".topbar").evaluate(node => node.getBoundingClientRect().bottom);
    const stageDocumentTop = initial.stageDocumentTop;
    const stickyTop = headerBottom + 8;
    await page.evaluate(({ top, stickyTop }) => scrollTo({ top: Math.max(0, top - stickyTop), behavior: "instant" }), {
      top: stageDocumentTop,
      stickyTop,
    });
    await expect.poll(async () => (await snapshot(page)).targetTop).toBeGreaterThanOrEqual(headerBottom + 7);
    await expect.poll(async () => (await snapshot(page)).targetTop).toBeLessThanOrEqual(headerBottom + 10);
    let sticky = await snapshot(page);
    assert.equal(sticky.targetPosition, "sticky", `${view.name}: the live article viewer must use native sticky positioning`);

    const headings = page.locator(".article-sticky-reader [data-model-context]");
    await expect(headings).toHaveCount(7);
    const contexts = await headings.evaluateAll(nodes => nodes.map(node => ({
      id: node.id,
      label: node.textContent.trim(),
      focus: node.dataset.modelContext,
    })));
    assert.ok(new Set(contexts.map(item => item.focus)).size >= 3, `${view.name}: article context annotations must vary across the real article`);
    const benchmark = page.locator("[data-model-context]").filter({ hasText: "Building a benchmark that can fail" }).first();
    await expect(benchmark).toHaveCount(1);
    const benchmarkFocus = await scrollHeading(page, benchmark);
    sticky = await snapshot(page);
    assert.ok(Math.abs(sticky.targetTop - (sticky.headerBottom + 8)) < 2, `${view.name}: article scrolling moved the sticky model away from its catch point`);
    const benchmarkRect = await benchmark.boundingBox();
    assert.ok(benchmarkRect && benchmarkRect.y >= sticky.targetBottom - 2 && benchmarkRect.y < view.height,
      `${view.name}: article text must remain readable below the sticky model`);

    const interpretation = page.locator("[data-model-context]").filter({ hasText: "Interpretation" }).first();
    await expect(interpretation).toHaveCount(1);
    await scrollHeading(page, interpretation);
    const beforePointer = await model.getAttribute("data-article-context");
    await page.locator("[data-machine-canvas]").dispatchEvent("pointerdown", {
      pointerId: 91, pointerType: "touch", clientX: 90, clientY: 160, buttons: 1,
    });
    await page.locator("[data-machine-canvas]").dispatchEvent("pointermove", {
      pointerId: 91, pointerType: "touch", clientX: 128, clientY: 180, buttons: 1,
    });
    await page.locator("[data-machine-canvas]").dispatchEvent("pointerup", {
      pointerId: 91, pointerType: "touch", clientX: 128, clientY: 180, buttons: 0,
    });
    await expect(model).toHaveAttribute("data-article-context", beforePointer);

    const sourceLink = page.locator('.article-source-links a[href*="research-notes/blob/"]');
    await expect(sourceLink).toHaveCount(1);
    await expect(sourceLink).toHaveAttribute("href", new RegExp("research-notes/blob/"));

    if (view.name === "phone-360") {
      const hashHeading = page.locator("[data-model-context]").filter({ hasText: "Research context" }).first();
      const hashId = await hashHeading.getAttribute("id");
      assert.ok(hashId, "Finished MyST headings retain their hash IDs");
      const focusBeforeHash = await model.getAttribute("data-article-context");
      await page.goto(`${articleUrl}#${hashId}`, { waitUntil: "networkidle" });
      const hashFocus = await hashHeading.getAttribute("data-model-context");
      await expect(model).toHaveAttribute("data-article-context", hashFocus);
      await page.goBack();
      await expect(model).toHaveAttribute("data-article-context", focusBeforeHash);
      await page.goForward();
      await expect(model).toHaveAttribute("data-article-context", hashFocus);

      const nativeQuality = await page.evaluate(() => {
        const controller = document.querySelector(".article-model-machine").machineController;
        const diagnostic = controller?.scene?.diagnostics?.();
        const resolution = diagnostic?.resolution;
        if (!resolution) return null;
        const expected = Math.min(resolution.nativeDPR,
          resolution.limits.maxTargetDimension / Math.max(resolution.cssWidth, resolution.cssHeight));
        return { effective: resolution.effectiveDPR, expected, native: resolution.nativeDPR };
      });
      if (nativeQuality) {
        assert.ok(Math.abs(nativeQuality.effective - nativeQuality.expected) < 0.01,
          "Sticky sizing must retain the renderer's native-DPR policy");
      }

      await page.setViewportSize({ width: 412, height: 915 });
      await page.waitForTimeout(100);
      const resized = await snapshot(page);
      assert.equal(resized.targetPosition, "sticky", "Viewport resize retains native sticky positioning");
      assert.ok(Math.abs(resized.targetTop - (resized.headerBottom + 8)) < 2,
        "Viewport resize retains the catch below fixed navigation");
    }

    const reader = page.locator(".article-sticky-reader");
    await page.evaluate(() => {
      const readerNode = document.querySelector(".article-sticky-reader");
      const host = document.querySelector(".article-model-machine .machine-spatial-host");
      const stageNode = document.querySelector(".article-model-machine [data-machine-stage]");
      const target = host?.dataset.instruments === "spatial" ? host : stageNode;
      const bounds = readerNode.getBoundingClientRect();
      const targetHeight = target.getBoundingClientRect().height;
      const stickyTop = (document.querySelector(".topbar")?.getBoundingClientRect().bottom || 58) + 8;
      const articleBottom = bounds.bottom + scrollY;
      const wanted = articleBottom - targetHeight - stickyTop + 40;
      scrollTo({ top: wanted, behavior: "instant" });
      return { wanted, targetHeight };
    });
    await page.waitForTimeout(80);
    const atEnd = await snapshot(page);
    assert.ok(atEnd.readerBottom <= atEnd.headerBottom + atEnd.stageHeight + 50,
      `${view.name}: article container end must approach the viewport before release`);
    assert.ok(atEnd.targetBottom <= atEnd.readerBottom + 2,
      `${view.name}: sticky model must remain inside its finished-article container`);
    assert.ok(atEnd.targetTop < atEnd.headerBottom + 7,
      `${view.name}: the model must release with its article container, not stick past it`);

    if (view.name === "phone-360" || view.name === "desktop") {
      await reader.evaluate(node => scrollTo({ top: 0, behavior: "instant" }));
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      assert.deepEqual(axe.violations.map(item => ({
        id: item.id,
        targets: item.nodes.map(node => node.target),
      })), [], `${view.name}: finished-article accessibility audit`);
    }

    assert.deepEqual(pageErrors, [], `${view.name}: browser runtime errors`);
    evidence.push({
      view: view.name,
      finishedArticle: article.slug,
      startingModelFocus: initial.initialFocus,
      stickyCatchTop: stickyTop,
      stickyDuringArticle: true,
      contextCount: new Set(contexts.map(item => item.focus)).size,
      contextChangedByHeading: benchmarkFocus !== initial.initialFocus,
      contextUnchangedByCameraPointer: beforePointer,
      releasedAtArticleEnd: true,
      rendering: atEnd.render,
      dpr: view.name === "phone-360" ? "native-DPR policy checked when WebGL is available" : undefined,
    });
  } finally {
    await context.close();
  }
}

try {
  for (const view of views) await auditView(view);
  console.log(JSON.stringify({ article: article.slug, source: "finished publication bundle", views: evidence }, null, 2));
} finally {
  await browser.close();
}
