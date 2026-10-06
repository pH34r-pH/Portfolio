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
assert.ok(manifestResponse.ok, `Pages publication manifest returned ${manifestResponse.status}`);
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
  await home.goto(new URL('?model-audit=1', projectBase).href, { waitUntil: 'networkidle' });
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
  await expect(home.locator('[data-startup]')).toHaveAttribute('data-startup', 'ready', { timeout: 30000 });
  await expect(home.locator('[data-model-machine]')).toHaveAttribute('data-render', 'webgl');
  await expect(home.locator('[data-machine-canvas]')).toBeVisible();

  const article = manifest.articles[0];
  await home.goto(new URL(article.url, base.origin).href, { waitUntil: 'networkidle' });
  await expect(home.locator('article.myst-reader h1')).toHaveText(article.title);
  const canonical = await home.locator('link[rel="canonical"]').getAttribute('href');
  const canonicalPath = article.url.slice(basePath.length);
  const expectedCanonical = new URL(canonicalPath, 'https://tyharbin.com').href;
  assert.equal(canonical, expectedCanonical,
    `Pages article canonical URL remains on the current domain and route: ${expectedCanonical}`);
  for (const asset of await home.locator('article.myst-reader img[src], article.myst-reader source[src]').evaluateAll(
    nodes => nodes.map(node => node.getAttribute('src')).filter(Boolean))) {
    assert.ok(asset.startsWith(`${basePath}/`) || /^https?:\/\//.test(asset),
      `Article asset must use the Pages project path: ${asset}`);
  }
  const pdfPath = article.downloads?.pdf;
  assert.ok(pdfPath?.startsWith(`${basePath}/`), `PDF link includes the project path: ${pdfPath}`);
  const pdfResponse = await home.request.get(new URL(pdfPath, base.origin).href);
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
  await home.goto(labUrl.href, { waitUntil: 'domcontentloaded' });
  await expect(home.locator('#jupyter-config-data')).toHaveCount(1);
  await expect(home.locator('.jp-NotebookPanel')).toBeVisible({ timeout: 90000 });
  const kernelDialog = home.getByRole('dialog');
  if (await kernelDialog.isVisible().catch(() => false)) {
    await expect(kernelDialog).toContainText('Select Kernel');
    await kernelDialog.locator('select').selectOption({ label: 'Python (Pyodide)' });
    await kernelDialog.getByRole('button', { name: 'Select Kernel' }).click();
  }
  const labIdentity = await home.evaluate(async selectedPath => {
    const configNode = document.querySelector('#jupyter-config-data');
    const liteRoot = new URL(configNode?.dataset.jupyterLiteRoot || '.', location.href);
    const parentPath = selectedPath.includes('/') ? selectedPath.slice(0, selectedPath.lastIndexOf('/')) : '';
    const apiUrl = new URL(`api/contents/${parentPath ? `${parentPath}/` : ''}all.json`, liteRoot);
    const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
    const listing = response.ok ? await response.json() : null;
    const notebookUrl = new URL(`files/${selectedPath}`, liteRoot);
    const notebookResponse = await fetch(notebookUrl, { headers: { Accept: 'application/json' } });
    const data = notebookResponse.ok ? await notebookResponse.json() : null;
    await Promise.race([navigator.serviceWorker.ready, new Promise(resolve => setTimeout(resolve, 30000))]);
    const registrations = await navigator.serviceWorker.getRegistrations();
    return { apiPath: apiUrl.pathname, status: response.status,
      listedNotebook: listing?.content?.some(item => item.path === selectedPath),
      notebookPath: notebookUrl.pathname, notebookStatus: notebookResponse.status, data,
      crossOriginIsolated: globalThis.crossOriginIsolated,
      serviceWorkers: registrations.map(registration => registration.scope) };
  }, selectedJupyterPath);
  assert.ok(labIdentity.apiPath.startsWith(`${basePath}/`),
    `JupyterLite API remains within the project path: ${labIdentity.apiPath}`);
  assert.equal(labIdentity.status, 200, `JupyterLite contents index resolves under the project path`);
  assert.ok(labIdentity.listedNotebook, `JupyterLite contents index lists the selected notebook`);
  assert.ok(labIdentity.notebookPath.startsWith(`${basePath}/`),
    `JupyterLite notebook file remains within the project path: ${labIdentity.notebookPath}`);
  assert.equal(labIdentity.notebookStatus, 200, `JupyterLite can read the selected notebook file`);
  assert.ok(Array.isArray(labIdentity.data?.cells), 'JupyterLite file access returns a notebook document');
  assert.deepEqual(labIdentity.data.cells.map(cell => ({
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
  await codeEditor.fill(`print('${smokeMarker}')`);
  await expect(codeEditor).toContainText(smokeMarker);
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
  await mobile.goto(projectBase.href, { waitUntil: 'networkidle' });
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
  await reduced.goto(projectBase.href, { waitUntil: 'networkidle' });
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
