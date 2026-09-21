import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const sizes = [
  ['small-phone', 320, 568],
  ['phone', 360, 800],
  ['large-phone', 430, 932],
  ['fold-cover', 344, 882],
  ['fold-unfolded-portrait', 768, 1016],
  ['fold-unfolded-landscape', 1016, 768],
  ['tablet-portrait', 820, 1180],
  ['tablet-landscape', 1180, 820],
  ['laptop', 1366, 768],
  ['desktop', 1920, 1080],
  ['ultrawide', 2560, 1080],
];
const palettes = ['nacre', 'oxide', 'violet', 'high-contrast'];
const browser = await chromium.launch({ headless: true });
const failures = [];

for (const [name, width, height] of sizes) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 600,
    hasTouch: width < 900,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (metrics.scrollWidth > metrics.clientWidth + 1) {
    failures.push(`${name}: horizontal overflow ${JSON.stringify(metrics)}`);
  }

  for (const palette of palettes) {
    await page.evaluate((value) => { document.documentElement.dataset.palette = value; }, palette);
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    if (axe.violations.length) {
      failures.push(`${name}/${palette}: axe ${axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} => ${n.failureSummary}`).join(' | ')}`).join(' || ')}`);
    }
  }

  const downloadLink = page.locator('#experiment-download');
  if (await downloadLink.count()) {
    const download = await downloadLink.getAttribute('aria-disabled');
    if (download !== 'true') failures.push(`${name}: fixture experiment download unexpectedly enabled`);
  }

  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    const style = element ? getComputedStyle(element) : null;
    return {
      tag: element?.tagName ?? null,
      outlineStyle: style?.outlineStyle ?? null,
      outlineWidth: style?.outlineWidth ?? null,
    };
  });
  if (!focus.tag || focus.outlineStyle === 'none' || focus.outlineWidth === '0px') {
    failures.push(`${name}: missing visible keyboard focus ${JSON.stringify(focus)}`);
  }

  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`UX matrix passed: ${sizes.map(([name]) => name).join(', ')}`);
