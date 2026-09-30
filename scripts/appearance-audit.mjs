import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PORTFOLIO_AUDIT_URL || 'http://127.0.0.1:4173';
const styles = ['orbit', 'register', 'overprint', 'hinge'];
const palettes = ['nacre', 'oxide', 'violet', 'high-contrast'];
const shots = process.env.PORTFOLIO_STYLE_SCREENSHOTS;

async function discoverPaths(context) {
  const paths = ['/', '/research/', '/atlas/', '/about/'];
  const response = await context.request.get(base + '/publication.json');
  if (response.ok() && response.headers()['content-type']?.includes('json')) {
    const manifest = await response.json();
    if (manifest.notebooks?.length) paths.push('/notebooks/' + manifest.notebooks[0].slug + '/');
  }
  return paths;
}

async function choose(page, locator, width) {
  if (width < 600) await locator.tap();
  else await locator.click();
}

async function auditPalette(page, width, path, style, palette) {
  const paletteButton = page.locator(`.appearance button[data-palette="${palette}"]`);
  await choose(page, paletteButton, width);
  await expect(page.locator('html')).toHaveAttribute('data-style', style);
  await expect(page.locator('html')).toHaveAttribute('data-palette', palette);
  await expect(paletteButton).toHaveAttribute('aria-pressed', 'true');
  const overflowing = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  assert.equal(overflowing, false, `${width} ${path} ${style}/${palette}: overflow`);
  if (width !== 412 && width !== 1366) return;
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  assert.deepEqual(
    axe.violations.map(v => ({
      id: v.id,
      nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })),
    })),
    [],
    `${width} ${path} ${style}/${palette}: axe`,
  );
}

async function captureStyle(page, width, path, style) {
  if (!shots || ![412, 1366].includes(width) || !['/', '/research/'].includes(path)) return;
  await page.locator('.appearance button[data-palette="nacre"]').click();
  if (path === '/' && style === 'orbit') {
    await page.screenshot({ path: `${shots}/settings-${width}.png` });
  }
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${shots}/${style}-${path === '/' ? 'home' : 'research'}-${width}.png`,
  });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
}

async function auditStyle(page, width, path, title, style) {
  const previousPalette = await page.locator('html').getAttribute('data-palette');
  const styleButton = page.locator(`.appearance button[data-style="${style}"]`);
  await choose(page, styleButton, width);
  await expect(styleButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-palette', previousPalette);
  for (const palette of palettes) await auditPalette(page, width, path, style, palette);
  assert.equal(await page.locator('h1').innerText(), title, 'Changing appearance must preserve the title text');
  await captureStyle(page, width, path, style);
}

async function auditPath(page, width, path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  const title = await page.locator('h1').innerText();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Style', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Palette', exact: true })).toBeVisible();
  for (const style of styles) await auditStyle(page, width, path, title, style);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
}

async function auditPersistence(page) {
  await page.goto(base + '/');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.locator('.appearance button[data-style="register"]').click();
  await page.locator('.appearance button[data-palette="oxide"]').click();
  await page.getByRole('navigation', { name: 'Site', exact: true })
    .getByRole('link', { name: 'Research', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'register');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'oxide');
}

async function auditViewport(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 915 : 900 },
    hasTouch: width < 900,
    isMobile: width < 600,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const paths = await discoverPaths(context);
  for (const path of paths) await auditPath(page, width, path);
  await auditPersistence(page);
  assert.deepEqual(errors, [], `${width}: runtime errors`);
  console.log(`Appearance: ${width}px, four styles × four palettes, ${paths.length} routes`);
  await context.close();
}

async function auditDeniedStorage(browser) {
  const restricted = await browser.newContext();
  await restricted.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  const page = await restricted.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.locator('.appearance button[data-style="hinge"]').click();
  await page.locator('.appearance button[data-palette="violet"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'hinge');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'violet');
  assert.deepEqual(errors, []);
  await restricted.close();
  console.log('Storage-denied appearance controls passed');
}

if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 412, 768, 1366]) await auditViewport(browser, width);
  await auditDeniedStorage(browser);
} finally {
  await browser.close();
}
