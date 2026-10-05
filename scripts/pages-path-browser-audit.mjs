#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const base = new URL(process.env.PORTFOLIO_PAGES_AUDIT_URL || 'http://127.0.0.1:4174/Portfolio/',
  process.env.PORTFOLIO_PAGES_AUDIT_URL || 'http://127.0.0.1:4174/Portfolio/');
const basePath = base.pathname.replace(/\/$/, '');
assert.ok(basePath.startsWith('/') && basePath.length > 1, `Expected a project path, got ${base.pathname}`);
const projectBase = new URL(`${basePath}/`, base.origin);
const localFailures = [];
const pageErrors = [];

function pageUrl(route) {
  const normalized = route.startsWith('/') ? route : `/${route}`;
  return new URL(`${basePath}${normalized}`, base.origin).href;
}

function collectNetworkFailures(page) {
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.origin === base.origin) localFailures.push(`${url.pathname}: ${request.failure()?.errorText || 'request failed'}`);
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === base.origin && response.status() >= 400) {
      localFailures.push(`${url.pathname}: HTTP ${response.status()}`);
    }
  });
  page.on('pageerror', error => pageErrors.push(error.message));
}

const manifestResponse = await fetch(new URL('publication.json', projectBase));
assert.ok(manifestResponse.ok, `Pages publication manifest returned ${manifestResponse.status()}`);
const manifest = await manifestResponse.json();
assert.ok(manifest.articles?.length, 'Prepared Pages manifest must include article routes');
assert.ok(manifest.notebooks?.length, 'Prepared Pages manifest must include notebook routes');
assert.ok(manifest.articles[0].url.startsWith(`${basePath}/`),
  `Prepared article route must include the project path: ${manifest.articles[0].url}`);

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const home = await desktop.newPage();
  collectNetworkFailures(home);
  await home.goto(new URL('?model-audit=1', projectBase), { waitUntil: 'networkidle' });
  await expect(home.locator('main h1')).toBeVisible();
  await expect(home.locator('.digital-model-loop')).toBeAttached();
  const hasPrefixedNavigation = await home.locator('.topbar a[href]').evaluateAll((links, prefix) =>
    links.some(link => new URL(link.href).pathname.startsWith(`${prefix}/`)), basePath);
  assert.ok(hasPrefixedNavigation, `Homepage navigation uses the project path ${basePath}`);
  const homeMotion = await home.evaluate(() => window.PortfolioHomepageBackground?.snapshot());
  assert.ok(homeMotion, 'Homepage motion controller loaded under the project path');
  await expect(home.locator('[data-model-start]')).toBeVisible({ timeout: 30000 });
  await home.locator('[data-model-start]').click();
  await expect(home.locator('[data-model-start]')).toHaveJSProperty('hidden', true, { timeout: 30000 });
  await expect(home.locator('[data-machine-canvas]')).toBeVisible({ timeout: 30000 });
  await home.waitForFunction(() => document.querySelector('[data-startup]')?.dataset.startup === 'ready',
    undefined, { timeout: 30000 });

  const article = manifest.articles[0];
  await home.goto(new URL(article.url, base.origin), { waitUntil: 'networkidle' });
  await expect(home.locator('article.myst-reader h1')).toHaveText(article.title);
  const canonical = await home.locator('link[rel="canonical"]').getAttribute('href');
  assert.ok(canonical?.startsWith('https://tyharbin.com/'), `Canonical URL remains on the current domain: ${canonical}`);
  for (const asset of await home.locator('article.myst-reader img[src], article.myst-reader source[src]').evaluateAll(
    nodes => nodes.map(node => node.getAttribute('src')).filter(Boolean))) {
    assert.ok(asset.startsWith(`${basePath}/`) || /^https?:\/\//.test(asset),
      `Article asset must use the Pages project path: ${asset}`);
  }
  const pdfPath = article.downloads?.pdf;
  assert.ok(pdfPath?.startsWith(`${basePath}/`), `PDF link includes the project path: ${pdfPath}`);
  const pdfResponse = await home.request.get(new URL(pdfPath, base.origin));
  assert.ok(pdfResponse.ok(), `Article PDF resolves under the Pages path (${pdfResponse.status()})`);
  assert.ok((await pdfResponse.body()).subarray(0, 5).toString('ascii') === '%PDF-', 'Article PDF has a valid PDF signature');

  const notebook = manifest.notebooks[0];
  const notebookPath = notebook.path || notebook.url;
  assert.ok(notebookPath, 'Publication manifest names a preserved notebook');
  const notebookResponse = await home.request.get(pageUrl(notebookPath));
  assert.ok(notebookResponse.ok(), `Preserved notebook resolves under the Pages path (${notebookResponse.status()})`);
  const notebookBytes = await notebookResponse.body();
  if (notebook.sha256) assert.equal(createHash('sha256').update(notebookBytes).digest('hex'), notebook.sha256,
    'Pages deployment preserves the published notebook bytes and digest');
  const sourceNotebook = JSON.parse(notebookBytes.toString('utf8'));
  const selectedJupyterPath = notebook.jupyterPath || notebookPath.replace(/^publication\//, '');
  const labUrl = new URL('lab/lab/', projectBase);
  labUrl.searchParams.set('path', selectedJupyterPath);
  await home.goto(labUrl, { waitUntil: 'domcontentloaded' });
  await expect(home.locator('#jupyter-config-data')).toHaveCount(1);
  await expect(home.locator('.jp-NotebookPanel')).toBeVisible({ timeout: 90000 });
  const labIdentity = await home.evaluate(async selectedPath => {
    const config = JSON.parse(document.querySelector('#jupyter-config-data')?.textContent || '{}');
    const baseUrl = config.baseUrl || '/lab/';
    const apiUrl = new URL(`api/contents/${selectedPath}`, new URL(baseUrl, location.origin));
    const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
    const data = response.ok ? await response.json() : null;
    await Promise.race([navigator.serviceWorker.ready, new Promise(resolve => setTimeout(resolve, 30000))]);
    const registrations = await navigator.serviceWorker.getRegistrations();
    return { apiPath: apiUrl.pathname, status: response.status, data,
      crossOriginIsolated: globalThis.crossOriginIsolated,
      serviceWorkers: registrations.map(registration => registration.scope) };
  }, selectedJupyterPath);
  assert.ok(labIdentity.apiPath.startsWith(`${basePath}/`),
    `JupyterLite API remains within the project path: ${labIdentity.apiPath}`);
  assert.equal(labIdentity.status, 200, `JupyterLite can read its selected notebook through its contents API`);
  assert.deepEqual(labIdentity.data.content.cells?.map(cell => ({
    id: cell.id || '',
    type: cell.cell_type,
    source: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
  })), sourceNotebook.cells.map(cell => ({
    id: cell.id || '',
    type: cell.cell_type,
    source: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
  })), 'JupyterLite file access returns the exact source notebook cells');
  assert.equal(labIdentity.crossOriginIsolated, false,
    'Pages path works without cross-origin isolation headers');
  assert.ok(labIdentity.serviceWorkers.some(scope => new URL(scope).pathname.startsWith(`${basePath}/`)),
    `JupyterLite service worker is scoped inside the project path: ${JSON.stringify(labIdentity.serviceWorkers)}`);
  const codeEditor = home.locator('.jp-CodeCell .cm-content').first();
  await expect(codeEditor).toBeVisible({ timeout: 30000 });
  const smokeMarker = 'portfolio-pages-browser-kernel-smoke-2026';
  await codeEditor.click();
  await home.keyboard.press('Control+A');
  await home.keyboard.insertText(`print('${smokeMarker}')`);
  await home.keyboard.press('Shift+Enter');
  await expect(home.locator('.jp-CodeCell').first().locator('.jp-OutputArea-output'))
    .toContainText(smokeMarker, { timeout: 120000 });

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await mobileContext.newPage();
  collectNetworkFailures(mobile);
  await mobile.goto(projectBase, { waitUntil: 'networkidle' });
  const dimensions = await mobile.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  assert.ok(dimensions.document <= dimensions.viewport + 1,
    `Mobile Pages path has no horizontal overflow: ${JSON.stringify(dimensions)}`);
  const menu = mobile.locator('.menu-toggle');
  await menu.tap();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  const mobileResearch = mobile.locator('#site-menu a[href$="/research/"]').first();
  await expect(mobileResearch).toBeVisible();
  await mobileResearch.tap();
  await expect(mobile).toHaveURL(pageUrl('/research/'));
  await expect(mobile.locator('main h1')).toBeVisible();
  await mobileContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    reducedMotion: 'reduce',
  });
  const reduced = await reducedContext.newPage();
  collectNetworkFailures(reduced);
  await reduced.goto(projectBase, { waitUntil: 'networkidle' });
  const reducedState = await reduced.evaluate(() => ({
    preference: matchMedia('(prefers-reduced-motion: reduce)').matches,
    motion: window.PortfolioHomepageBackground?.snapshot(),
  }));
  assert.equal(reducedState.preference, true);
  assert.equal(reducedState.motion?.quiet, true, 'Reduced-motion preference reaches the site motion controller');
  assert.equal(reducedState.motion?.paused, true, 'Homepage video remains paused for reduced motion');
  await reducedContext.close();

  assert.deepEqual(localFailures, [], `Same-origin asset requests stay under ${basePath}: ${localFailures.join('; ')}`);
  assert.deepEqual(pageErrors, [], `Pages routes report no uncaught browser errors: ${pageErrors.join('; ')}`);
  console.log(`Pages-path browser audit passed at ${projectBase.href}: homepage/model, article/PDF, JupyterLite file access and Python execution, mobile navigation, reduced motion.`);
  await desktop.close();
} finally {
  await browser.close();
}
