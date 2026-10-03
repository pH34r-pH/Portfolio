import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { auditCompiledCatalogNavigation } from './compiled-catalog-audit.mjs';

const manifest = JSON.parse(readFileSync(new URL('../design/interaction-coverage.json', import.meta.url), 'utf8'));
const allowed = new Set(['automated', 'automated-with-fixture-limit', 'automated-artifact-only', 'automated-sampled-downloads', 'uncovered', 'manual', 'separate-owner']);
assert.equal(manifest.schemaVersion, 1);
assert.ok(manifest.coverage.length >= 10, 'The interaction inventory should cover the requested route and state families');
for (const test of manifest.testRunners) {
  assert.ok(existsSync(new URL(`../${test}`, import.meta.url)), `Missing listed runner ${test}`);
}
const ids = new Set();
for (const area of manifest.coverage) {
  assert.ok(area.id && !ids.has(area.id), `Coverage entries need unique IDs: ${area.id}`);
  ids.add(area.id);
  assert.ok(allowed.has(area.status), `${area.id}: unknown status ${area.status}`);
  assert.ok(Array.isArray(area.surfaces) && area.surfaces.length, `${area.id}: identify its real surface`);
  assert.ok(Array.isArray(area.tests), `${area.id}: tests must be listed explicitly`);
  assert.ok(area.status !== 'uncovered' || area.limits?.length, `${area.id}: uncovered coverage needs a reason`);
  for (const test of area.tests) {
    const path = test.startsWith('.github/') || test === 'lighthouserc.cjs'
      ? `../${test}`
      : `../scripts/${test.replace(/^scripts\//, '')}`;
    assert.ok(existsSync(new URL(path, import.meta.url)), `${area.id}: missing test runner ${test}`);
  }
}
console.log(`Interaction coverage manifest passed: ${manifest.coverage.length} areas; ${ids.size} unique IDs.`);

const base = process.env.PORTFOLIO_AUDIT_URL || 'http://127.0.0.1:4173';
const article = { title: 'Compiled catalog navigation fixture', url: '/articles/catalog-fixture/',
  compiled_experiment: { ref: 'exact-pinned-experiment' } };
const externalUrl = `https://experiments.tyharbin.com/experiments/${article.compiled_experiment.ref}/`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });

async function catalogFixture() {
  const context = await browser.newContext();
  await context.route(`${base}/**`, route => route.fulfill({ contentType: 'text/html', body: `
    <!doctype html><html lang="en"><title>${article.title}</title><body>
      <article class="myst-reader"><h1>${article.title}</h1>
        <a href="${externalUrl}" target="_blank" rel="noreferrer">Catalog in a new tab</a>
      </article>
      <aside aria-label="Compiled experiment reference"><a href="${externalUrl}">Catalog in this tab</a></aside>
    </body></html>` }));
  const page = await context.newPage();
  await page.goto(base + article.url);
  return { context, page };
}

try {
  const { context, page } = await catalogFixture();
  try {
    // Reproduce the original assertion on a real target=_blank click: the
    // destination opens correctly, but asserting against the reader must fail.
    await context.route(externalUrl, route => route.fulfill({ contentType: 'text/html', body: '<h1>Original destination</h1>' }));
    const [opened] = await Promise.all([page.waitForEvent('popup'), page.locator('article a').click()]);
    await expect(opened).toHaveURL(externalUrl);
    await expect(opened.getByRole('heading', { name: 'Original destination' })).toBeVisible();
    await assert.rejects(expect(page).toHaveURL(externalUrl, { timeout: 100 }), /toHaveURL/);
    await expect(page).toHaveURL(base + article.url);
    await opened.close();
    await context.unroute(externalUrl);
    await auditCompiledCatalogNavigation(page, context, article, article.url, base);
    await expect(page).toHaveURL(base + article.url);
    assert.equal(context.pages().length, 1, 'the passing audit leaves only the original reader');
  } finally { await context.close(); }

  for (const failure of ['wrong-popup-destination', 'unsafe-opener', 'wrong-sidebar-destination']) {
    const { context, page } = await catalogFixture();
    try {
      await page.evaluate(failure => {
        const link = document.querySelector(failure === 'wrong-sidebar-destination' ? 'aside a' : 'article a');
        // Mutate during the genuine click so valid initial markup cannot hide
        // a wrong destination or an opener leak from the behavioral audit.
        link.addEventListener('click', () => {
          if (failure === 'unsafe-opener') link.rel = 'opener';
          else link.href = link.href.replace('exact-pinned-experiment', 'wrong-experiment');
        });
      }, failure);
      await assert.rejects(auditCompiledCatalogNavigation(page, context, article, article.url, base),
        failure === 'unsafe-opener' ? /without disclosing a referrer|window.opener/ : /toHaveURL/,
        `The catalog audit must reject ${failure}`);
      assert.equal(context.pages().length, 1, `${failure}: failed audit closes the catalog popup`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log('Compiled catalog navigation passed: original wrong-tab regression, exact popup destination, opener/referrer isolation, unchanged reader history, close/return, sidebar Back/Forward and negative destination/security checks.');
await import('./test-article-browser-audit.mjs');
