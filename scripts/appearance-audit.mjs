import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PORTFOLIO_AUDIT_URL || 'http://127.0.0.1:4173';
const modes = ['auto', 'light', 'dark'];
const shots = process.env.PORTFOLIO_STYLE_SCREENSHOTS;

async function discoverPaths(context) {
  const paths = ['/', '/research/', '/atlas/', '/about/'];
  const response = await context.request.get(base + '/publication.json');
  if (response.ok() && response.headers()['content-type']?.includes('json')) {
    const manifest = await response.json();
    if (manifest.articles?.length) paths.push(manifest.articles[0].url);
    if (manifest.notebooks?.length) paths.push('/notebooks/' + manifest.notebooks[0].slug + '/');
  }
  return paths;
}

async function choose(page, locator, width) {
  if (width < 600) await locator.tap();
  else await locator.click();
}

async function auditMode(page, width, path, mode, title) {
  const button = page.locator(`.appearance button[data-theme-choice="${mode}"]`);
  await choose(page, button, width);
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', mode);
  await expect(button).toHaveAttribute('aria-pressed', 'true');

  const theme = await page.locator('html').getAttribute('data-theme');
  assert.ok(theme === 'light' || theme === 'dark', `${path}: resolved theme must be light/dark`);
  if (mode !== 'auto') assert.equal(theme, mode);

  assert.equal(await page.locator('h1').innerText(), title, 'Changing environment must preserve title text');

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const width = root.clientWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .map(element => {
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          classes: [...element.classList].slice(0, 4),
          left: Math.round(box.left * 10) / 10,
          right: Math.round(box.right * 10) / 10,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      })
      .filter(item => item.left < -1 || item.right > width + 1 || item.scrollWidth > item.clientWidth + 1)
      .slice(0, 12);
    return { scrollWidth: root.scrollWidth, clientWidth: width, offenders };
  });
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `${width} ${path} ${mode}: overflow ${JSON.stringify(overflow)}`,
  );

  if (width === 412 || width === 1366) {
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    assert.deepEqual(
      axe.violations.map(v => ({
        id: v.id,
        nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })),
      })),
      [],
      `${width} ${path} ${mode}: axe`,
    );
  }
}

async function capture(page, width, path) {
  if (!shots || ![412, 1366].includes(width) || !['/', '/research/'].includes(path)) return;
  await page.locator('.appearance button[data-theme-choice="light"]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${shots}/2071-light-${path === '/' ? 'home' : 'research'}-${width}.png`,
    fullPage: false,
  });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.locator('.appearance button[data-theme-choice="dark"]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${shots}/2071-dark-${path === '/' ? 'home' : 'research'}-${width}.png`,
    fullPage: false,
  });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
}

async function auditPath(page, width, path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  const title = await page.locator('h1').innerText();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Theme', exact: true })).toBeVisible();

  for (const mode of modes) await auditMode(page, width, path, mode, title);
  await capture(page, width, path);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
}

async function auditPersistence(page) {
  await page.goto(base + '/');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.locator('.appearance button[data-theme-choice="dark"]').click();
  await page.getByRole('navigation', { name: 'Site', exact: true })
    .getByRole('link', { name: 'Research', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
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
  console.log(`Appearance: ${width}px, 2071 auto/light/dark, ${paths.length} routes`);
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
  await page.locator('.appearance button[data-theme-choice="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  assert.deepEqual(errors, []);
  await restricted.close();
  console.log('Storage-denied 2071 environment controls passed');
}

if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 412, 768, 1366]) await auditViewport(browser, width);
  await auditDeniedStorage(browser);
} finally {
  await browser.close();
}
