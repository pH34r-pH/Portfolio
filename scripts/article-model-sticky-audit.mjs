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
      horizontalModel: model?.querySelector(".machine-axis-labels")
        ? getComputedStyle(model.querySelector(".machine-axis-labels")).flexDirection : null,
      fallbackDirection: stage ? getComputedStyle(stage.querySelector(".machine-fallback")).flexDirection : null,
      // Headless Chromium reserves a narrow classic scrollbar gutter even in
      // mobile emulation. Compare the document extent with the CSS viewport,
      // which is also the width used by viewport-relative fixed navigation.
      pageWidth: innerWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
    };
  });
}

async function scrollHeading(page, heading) {
  const data = await heading.evaluate(node => ({
    top: node.getBoundingClientRect().top + scrollY,
  }));
  const targetHeight = await page.evaluate(() => {
    const model = document.querySelector(".article-model-machine");
    const stage = model.querySelector("[data-machine-stage]");
    const host = model.querySelector(".machine-spatial-host");
    return host?.dataset.instruments === "spatial" ? host.getBoundingClientRect().height : stage.getBoundingClientRect().height;
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
  const expected = await contextAtReadingLine(page);
  await expect(page.locator(".article-model-machine")).toHaveAttribute("data-article-context", expected);
  return expected;
}

async function contextAtReadingLine(page) {
  return page.evaluate(() => {
    const model = document.querySelector(".article-model-machine");
    const stage = model.querySelector("[data-machine-stage]");
    const host = model.querySelector(".machine-spatial-host");
    const spatial = host?.dataset.instruments === "spatial";
    const target = spatial ? host : stage;
    const header = document.querySelector(".topbar")?.getBoundingClientRect().height || 58;
    const line = Math.min(innerHeight - 3, header + target.getBoundingClientRect().height
      + (spatial ? 28 : 72));
    return [...document.querySelectorAll(".article-sticky-reader [data-model-context]")]
      .filter(heading => heading.getBoundingClientRect().top <= line)
      .at(-1)?.dataset.modelContext || model.dataset.modelFocus || "all";
  });
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
    const startButton = model.locator("[data-model-start]");
    await expect(model).toHaveCount(1);
    await expect(stage).toHaveCount(1);
    await expect(model).toHaveAttribute("data-startup", "idle");
    await expect(startButton).toBeVisible();

    const initial = await snapshot(page);
    assert.equal(initial.initialFocus, "representation", `${view.name}: source-owned article focus was lost`);
    assert.ok(initial.stageDocumentTop > initial.headerBottom + 200, `${view.name}: the model must start in article flow`);
    assert.equal(initial.render, null, `${view.name}: the WebGL renderer must remain idle until Start`);
    assert.equal(initial.fallbackDirection, "row", `${view.name}: static phone and desktop diagrams stay horizontal`);
    assert.ok(initial.readerHeight > initial.stageHeight * 2, `${view.name}: the sticky boundary must contain article prose`);
    assert.ok(initial.pageScrollWidth <= initial.pageWidth + 1, `${view.name}: article overflowed horizontally`);

    if (view.name === "phone-360" || view.name === "desktop") {
      const staticAxe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      assert.deepEqual(staticAxe.violations.map(item => ({
        id: item.id,
        targets: item.nodes.map(node => node.target),
      })), [], `${view.name}: manual-start article accessibility`);
    }

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

    await startButton.scrollIntoViewIfNeeded();
    await startButton.click();
    await expect(model).toHaveAttribute("data-startup", /^(ready|fallback)$/, { timeout: 30000 });
    const lifecycle = await page.evaluate(() => document.querySelector(".article-model-machine").machineController.startup.snapshot());
    assert.equal(lifecycle.started, true, `${view.name}: manual Start records the started state`);
    assert.equal(lifecycle.durationMs, 1800, `${view.name}: the existing ignition duration is preserved`);
    sticky = await snapshot(page);
    if (sticky.render === "webgl") {
      assert.equal(lifecycle.ignitionComplete, true, `${view.name}: the retained 1.8-second ignition completes`);
    } else {
      assert.equal(sticky.render, "fallback", `${view.name}: an unavailable WebGL renderer keeps the static model`);
    }
    assert.equal(sticky.horizontalModel, "row", `${view.name}: replay axes remain left-to-right`);
    assert.ok(["webgl", "fallback"].includes(sticky.render), `${view.name}: the renderer reports its live or static path`);

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
    const researchContext = page.locator("[data-model-context]").filter({ hasText: "Research context" }).first();
    await expect(researchContext).toHaveCount(1);
    const researchReadingFocus = await scrollHeading(page, researchContext);
    assert.notEqual(researchReadingFocus, initial.initialFocus,
      `${view.name}: scrolling to a new article section must gently change the model context`);
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
    const canvasBox = await page.locator("[data-machine-canvas]").boundingBox();
    assert.ok(canvasBox, `${view.name}: the inspection canvas remains available while sticky`);
    const cameraX = canvasBox.x + canvasBox.width / 2;
    const cameraY = canvasBox.y + canvasBox.height / 2;
    await page.mouse.move(cameraX, cameraY);
    await page.mouse.down();
    await page.mouse.move(cameraX + 38, cameraY + 20, { steps: 4 });
    await page.mouse.up();
    await expect(model).toHaveAttribute("data-article-context", beforePointer);

    const sourceLink = page.locator('.article-source-links a[href*="research-notes/blob/"]');
    await expect(sourceLink).toHaveCount(1);
    await expect(sourceLink).toHaveAttribute("href", new RegExp("research-notes/blob/"));

    if (view.name === "phone-360") {
      await scrollHeading(page, benchmark);
      const previousScrollY = await page.evaluate(() => scrollY);
      await expect(model).toHaveAttribute("data-article-context", benchmarkFocus);
      const hashHeading = page.locator("[data-model-context]").filter({ hasText: "Research context" }).first();
      const hashId = await hashHeading.getAttribute("id");
      assert.ok(hashId, "Finished MyST headings retain their hash IDs");
      await page.goto(`${articleUrl}#${hashId}`, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(new RegExp(`#${hashId}$`));
      await expect.poll(() => contextAtReadingLine(page)).not.toBe(benchmarkFocus);
      const hashFocus = await contextAtReadingLine(page);
      await expect(model).toHaveAttribute("data-article-context", hashFocus);
      await page.goBack();
      await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
      await expect.poll(() => page.evaluate(y => Math.abs(scrollY - y) < 4, previousScrollY)).toBe(true);
      await expect.poll(() => contextAtReadingLine(page)).toBe(benchmarkFocus);
      await expect(model).toHaveAttribute("data-article-context", benchmarkFocus);
      await page.goForward();
      await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#${hashId}`);
      await expect.poll(() => contextAtReadingLine(page)).toBe(hashFocus);
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

      if (lifecycle.ignitionComplete) {
        await page.reload({ waitUntil: "networkidle" });
        await expect(model).toHaveAttribute("data-startup", "ready", { timeout: 30000 });
        const retained = await page.evaluate(() => document.querySelector(".article-model-machine").machineController.startup.snapshot());
        assert.equal(retained.started, true, "A started article model is retained for the browser session");
        assert.equal(retained.ignitionComplete, true, "Completed ignition is retained after article reload");
        await expect(startButton).toBeHidden();
      }

      await page.setViewportSize({ width: 412, height: 915 });
      await page.waitForTimeout(100);
      const resized = await snapshot(page);
      assert.equal(resized.targetPosition, "sticky", "Viewport resize retains native sticky positioning");
      assert.ok(Math.abs(resized.targetTop - (resized.headerBottom + 8)) < 2,
        "Viewport resize retains the catch below fixed navigation");
      await page.setViewportSize({ width: 915, height: 412 });
      await page.waitForTimeout(100);
      const landscape = await snapshot(page);
      assert.equal(landscape.targetPosition, "sticky", "Landscape rotation retains native sticky positioning");
      assert.equal(landscape.horizontalModel, "row", "Landscape rotation retains left-to-right model axes");
      assert.ok(Math.abs(landscape.targetTop - (landscape.headerBottom + 8)) < 2,
        "Landscape rotation retains the catch below fixed navigation");
      assert.ok(landscape.pageScrollWidth <= landscape.pageWidth + 1,
        "Landscape rotation does not introduce horizontal page overflow");
      await expect(model).toHaveAttribute("data-article-context", await contextAtReadingLine(page));
      await page.setViewportSize({ width: 412, height: 915 });
    }

    const reader = page.locator(".article-sticky-reader");
    // The real bundle's short footer can cap the browser's maximum scroll
    // before the article boundary reaches the sticky box. Add audit-only tail
    // room so the page can traverse the final boundary and prove the model
    // releases at the reader, rather than at an unrelated later footer.
    await page.evaluate(() => {
      const tail = document.createElement("div");
      tail.setAttribute("aria-hidden", "true");
      tail.style.cssText = "height:700px;clear:both";
      document.body.append(tail);
    });
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
      contextChangedByHeading: researchReadingFocus !== initial.initialFocus,
      contextUnchangedByCameraPointer: beforePointer,
      releasedAtArticleEnd: true,
      rendering: atEnd.render,
      dpr: view.name === "phone-360" ? "native-DPR policy checked when WebGL is available" : undefined,
    });
  } finally {
    await context.close();
  }
}

async function auditReducedMotion() {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    const response = await page.goto(articleUrl, { waitUntil: "networkidle" });
    assert.ok(response?.ok(), "Reduced-motion audit uses the finished publication article");
    const model = page.locator(".article-model-machine[data-model-machine]");
    const button = model.locator("[data-model-start]");
    await expect(model).toHaveAttribute("data-startup", "quiet");
    await expect(button).toBeHidden();
    const initial = await snapshot(page);
    assert.equal(initial.render, null, "Reduced motion leaves WebGL idle");
    assert.equal(initial.fallbackDirection, "row", "Reduced-motion diagram stays horizontal");

    const headerBottom = await page.locator(".topbar").evaluate(node => node.getBoundingClientRect().bottom);
    await page.evaluate(({ top, headerBottom }) => scrollTo({ top: top - headerBottom - 8, behavior: "instant" }), {
      top: initial.stageDocumentTop,
      headerBottom,
    });
    await expect.poll(async () => (await snapshot(page)).targetTop).toBeGreaterThanOrEqual(headerBottom + 7);
    await expect.poll(async () => (await snapshot(page)).targetTop).toBeLessThanOrEqual(headerBottom + 10);
    const heading = page.locator("[data-model-context]").filter({ hasText: "Research context" }).first();
    const readingFocus = await scrollHeading(page, heading);
    assert.notEqual(readingFocus, initial.initialFocus, "Reduced-motion users still receive article-driven model context");

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    assert.deepEqual(axe.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), [],
      "Reduced-motion manual-start article accessibility");
    assert.deepEqual(pageErrors, [], "Reduced-motion article has no browser runtime errors");
    evidence.push({
      view: "phone-360-reduced-motion",
      manualStartAvailable: false,
      rendererRemainsIdle: true,
      horizontalStaticModel: true,
      stickyCatchTop: headerBottom + 8,
      contextChangedByHeading: true,
      accessibility: "axe clean",
    });
  } finally {
    await context.close();
  }
}

try {
  for (const view of views) await auditView(view);
  await auditReducedMotion();
  console.log(JSON.stringify({ article: article.slug, source: "finished publication bundle", views: evidence }, null, 2));
} finally {
  await browser.close();
}
