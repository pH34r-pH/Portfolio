import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// This audit covers routes and behavior that Home-only axe checks cannot see.
// A local publication bundle may be supplied to include generated notebook pages.
const base = process.env.PORTFOLIO_AUDIT_URL || "http://127.0.0.1:4173";
const views = [
  [360, 780],
  [412, 915],
  [768, 1016],
  [1366, 768],
];
const palettes = ["nacre", "oxide", "violet", "high-contrast"];
const catalogFixture = {
  schemaVersion: 1,
  experiments: [{
    schemaVersion: 1,
    id: "audit-fixture",
    title: "Audit fixture",
    profile: "compiled-experiment-v1",
    hypothesis: "Can the catalog render derived experiment metadata?",
    question: "Does the public catalog remain interactive?",
    method: "Use a synthetic browser-only fixture.",
    acceptance: {},
    result: {
      acceptancePassed: true,
      metrics: {evalMse: {numerator: 1, denominator: 1000}},
    },
    environment: {python: ">=3.11,<4", networkRequired: false, accelerator: "none"},
    resources: {
      ram: {observedMaximumBytes: 20971520, planningRamBytes: 33554432},
      accelerator: {peakVramBytes: 0},
    },
    contents: {
      embedded: [{item: "test input", path: "experiment/input.json"}],
      publicImmutableReferences: [],
      unavailable: [],
    },
    reproduction: {entrypoint: "experiment/reproduce.py", networkRequired: false},
    source: {repository: "example/research", commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
    standards: {croissant: "1.1", roCrate: "1.3", processRunCrate: "0.6"},
    package: {sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", size: 14010},
    packageUrl: "https://example.test/package.zip",
    qualificationReceiptUrl: "https://example.test/receipt.json",
  }],
};

const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of views) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width < 600,
      hasTouch: width < 900,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const manifestResponse = await context.request.get(
      base + "/publication.json",
    );
    let manifest;
    if (
      manifestResponse.ok() &&
      manifestResponse.headers()["content-type"]?.includes("json")
    ) {
      manifest = await manifestResponse.json();
    }
    const paths = ["/", "/research/", "/atlas/", "/reproduce/"];
    if (manifest?.notebooks?.length) {
      paths.push("/notebooks/" + manifest.notebooks[0].slug + "/");
      if (manifest.notebooks.some(n => n.slug === "visual_intuition_atlas"))
        paths.push("/notebooks/visual_intuition_atlas/");
    }
    for (const path of paths) {
      if (path === "/reproduce/") {
        await page.route("**/data/experiment-catalog.json", route =>
          route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(catalogFixture)}),
        );
      }
      await page.goto(base + path, { waitUntil: "networkidle" });
      assert.deepEqual(errors, [], `${width}${path}: page errors`);
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      if (width < 600) await menu.tap();
      else await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.getByRole("navigation", { name: "Site", exact: true }),
      ).toBeVisible();
      for (const palette of palettes) {
        const button = page.locator(`button[data-palette="${palette}"]`);
        if (width < 600) await button.tap();
        else await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("html")).toHaveAttribute(
          "data-palette",
          palette,
        );
      }
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(menu).toBeFocused();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      assert.ok(
        overflow <= 1,
        `${width}${path}: page overflows by ${overflow}px`,
      );
      for (const palette of palettes) {
        await page.locator("html").evaluate((el, value) => {
          el.dataset.palette = value;
        }, palette);
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        assert.deepEqual(
          axe.violations.map((v) => ({
            id: v.id,
            targets: v.nodes.map((n) => n.target),
          })),
          [],
          `${width}${path}/${palette}: axe`,
        );
      }
      if (path === "/atlas/") {
        const meters = page.locator("#consumer-data meter");
        await expect(meters).toHaveCount(2);
        const evidence = await (
          await context.request.get(base + "/data/atlas-evidence.json")
        ).json();
        const metrics = evidence.series.find(
          (s) => s.id === "revision-branch-utilization",
        ).metrics;
        for (const metric of metrics) {
          await expect(
            page.getByRole("meter", { name: metric.label, exact: true }),
          ).toHaveAttribute("value", String(metric.value));
        }
        const sphere = page.locator("#sphere-canvas");
        await sphere.scrollIntoViewIfNeeded();
        await sphere.focus();
        const before = await sphere.screenshot();
        await sphere.press("ArrowRight");
        assert.ok(
          !before.equals(await sphere.screenshot()),
          "Sphere must visibly rotate by keyboard",
        );
        const box = await sphere.boundingBox();
        const rotated = await sphere.screenshot();
        await page.mouse.move(
          box.x + box.width * 0.4,
          box.y + box.height * 0.5,
        );
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width * 0.7,
          box.y + box.height * 0.5,
          { steps: 8 },
        );
        await page.mouse.up();
        assert.ok(
          !rotated.equals(await sphere.screenshot()),
          "Sphere must visibly rotate by dragging",
        );
        const tangent = page.locator("#tangent-slider");
        await tangent.press("Home");
        await expect(page.locator("#tangent-value")).toHaveText("0%");
        await tangent.press("End");
        await expect(page.locator("#tangent-value")).toHaveText("100%");
        assert.equal(
          await page
            .locator(".radial-vector")
            .evaluate((el) => getComputedStyle(el).width),
          "0px",
          "A fully tangent update has no radial component",
        );
        const vectorsFit = await page.locator("#vector-viz").evaluate((el) => {
          const frame = el.getBoundingClientRect();
          return [...el.children].every((vector) => {
            const bounds = vector.getBoundingClientRect();
            return (
              bounds.top >= frame.top &&
              bounds.bottom <= frame.bottom &&
              bounds.left >= frame.left &&
              bounds.right <= frame.right
            );
          });
        });
        assert.ok(
          vectorsFit,
          "Vector components must remain inside the diagram, clear of the slider",
        );
        await expect(page.locator("#vector-viz")).toHaveAttribute(
          "aria-label",
          /100 percent/,
        );
        if (width < 600) {
          await tangent.scrollIntoViewIfNeeded();
          const track = await tangent.boundingBox();
          await page.touchscreen.tap(
            track.x + track.width / 2,
            track.y + track.height / 2,
          );
          const value = await tangent.inputValue();
          assert.ok(
            Number(value) > 35 && Number(value) < 65,
            "A touch tap must move the tangent slider",
          );
          await expect(page.locator("#tangent-value")).toHaveText(value + "%");
        }
        const horizon = page.locator("#horizon-slider");
        await horizon.press("Home");
        const short = await page
          .locator(".trajectory-nuisance")
          .evaluate((el) => getComputedStyle(el).transform);
        await expect(page.locator("#horizon-value")).toHaveText("1 layer");
        await horizon.press("End");
        await expect(page.locator("#horizon-value")).toHaveText("12 layers");
        assert.notEqual(
          await page
            .locator(".trajectory-nuisance")
            .evaluate((el) => getComputedStyle(el).transform),
          short,
          "Horizon must change the diagram, not only its label",
        );
        if (width < 600) {
          await horizon.scrollIntoViewIfNeeded();
          const track = await horizon.boundingBox();
          await page.touchscreen.tap(
            track.x + track.width / 2,
            track.y + track.height / 2,
          );
          const value = await horizon.inputValue();
          assert.ok(
            Number(value) > 1 && Number(value) < 12,
            "A touch tap must move the horizon slider",
          );
          await expect(page.locator("#horizon-value")).toHaveText(
            value + " layers",
          );
        }
        for (const [group, detail] of [
          [".evidence-map", "#evidence-detail"],
          [".architecture-flow", "#architecture-detail"],
          [".ledger-grid", "#ledger-detail"],
        ]) {
          for (const button of await page.locator(group + " button").all()) {
            const previous = await page.locator(detail).textContent();
            const selected =
              (await button.getAttribute("aria-pressed")) === "true";
            if (width < 600) await button.tap();
            else await button.click();
            await expect(button).toHaveAttribute("aria-pressed", "true");
            await expect(
              page.locator(group + ' button[aria-pressed="true"]'),
            ).toHaveCount(1);
            if (!selected)
              assert.notEqual(
                await page.locator(detail).textContent(),
                previous,
                "Selecting a stage must update its explanation",
              );
          }
        }
        await expect(
          page.getByRole("link", { name: "Browse research notebooks →" }),
        ).toHaveAttribute("href", "/research/");
      }
      if (path === "/reproduce/") {
        await expect(page.locator("#catalog-status")).toHaveText("1 compiled experiment available.");
        await expect(page.locator("#experiment-table-body")).toContainText("Audit fixture");
        await page.locator(".experiment-package-detail summary").click();
        await expect(page.locator(".experiment-package-detail")).toContainText("test input");
        await expect(page.locator(".experiment-package-detail")).toContainText("experiment/reproduce.py");
        const download = page.getByRole("link", {
          name: "Download compiled experiment ↓",
        });
        await expect(download).toHaveAttribute("href", "https://example.test/package.zip");
        await expect(page.locator(".package-info")).toHaveCount(0);
        await page.unroute("**/data/experiment-catalog.json");
      }
      if (path.startsWith("/notebooks/")) {
        await expect(page.locator("main")).toHaveCount(1);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(
          page.getByRole("link", { name: "← Research index" }).first(),
        ).toHaveAttribute("href", "/research/");
        for (const code of await page.locator(".highlight").all()) {
          await code.focus();
          await expect(code).toBeFocused();
        }
      }
      if (path === "/research/" && manifest?.notebooks?.length) {
        await expect(page.locator('#notebook-list')).not.toContainText('Updated');
        if (manifest.notebooks[0].question)
          await expect(page.locator('.card-question').first()).toHaveText(manifest.notebooks[0].question);
      }
      if (["/research/", "/reproduce/"].includes(path)) {
        await page.locator('.skip-link').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('main')).toBeFocused();
      }
      assert.deepEqual(
        errors,
        [],
        `${width}${path}: page errors after interaction`,
      );
    }
    // Test real menu navigation and palette persistence across documents.
    await page.goto(base + "/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Oxide", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Site", exact: true })
      .getByRole("link", { name: "Research", exact: true })
      .click();
    await expect(page).toHaveURL(base + "/research/");
    await expect(page.locator("html")).toHaveAttribute("data-palette", "oxide");
    console.log(
      `Route and interaction audit passed: ${width} × ${height}${manifest ? " with published notebook" : ""}`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
