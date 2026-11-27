#!/usr/bin/env node
// Capture one responsive-accessibility fixture from an exact publication candidate.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { release } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import AxeBuilder from '@axe-core/playwright';
import { chromium, expect } from '@playwright/test';
import { createHandler } from './serve-lhci.mjs';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const digestScript = fileURLToPath(new URL('./digest_bundle.py', import.meta.url));
const route = '/research/';
const views = [
  { name: 'phone', width: 360, height: 780, mobile: true },
  { name: 'desktop', width: 1366, height: 768, mobile: false },
];

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function verifyBundle(bundle, expected) {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const { stdout } = await execute(python, ['-B', digestScript, bundle, '--expect', expected], { timeout: 60000 });
  assert.equal(stdout.trim(), expected);
}

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

async function mobileMenuCheck(page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await menu.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Site', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
}

async function collectDiagnostics(context, page, base) {
  const phases = Object.fromEntries(['page', 'accessibilityAudit'].map(name => [name, {
    events: [], counts: { blockedRequests: 0, localResponses: 0, localRequestFailures: 0, pageErrors: 0, droppedEvents: 0 },
  }]));
  let phase = phases.page;
  function event(kind, detail) {
    if (phase.events.length < 128) phase.events.push({ kind, detail: detail.slice(0, 512) });
    else phase.counts.droppedEvents += 1;
  }
  await context.route('**/*', async handler => {
    const request = handler.request();
    const url = new URL(request.url());
    if (url.origin === base.origin && ['GET', 'HEAD'].includes(request.method())) {
      await handler.continue();
    } else {
      phase.counts.blockedRequests += 1;
      event('blocked', url.origin);
      await handler.abort();
    }
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) event(message.type(), message.text());
  });
  page.on('pageerror', error => {
    phase.counts.pageErrors += 1;
    event('page-error', error.message);
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.origin !== base.origin) return;
    phase.counts.localRequestFailures += 1;
    event('request-failed', url.pathname + ' ' + request.failure()?.errorText);
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== base.origin) return;
    phase.counts.localResponses += 1;
    if (response.status() >= 400) phase.counts.localRequestFailures += 1;
    event('http', url.pathname + ' ' + response.status());
  });
  return { phases, beginAccessibilityAudit: () => { phase = phases.accessibilityAudit; } };
}

async function capture(browser, base, output, view, theme) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height }, deviceScaleFactor: 1,
    isMobile: view.mobile, hasTouch: view.mobile, locale: 'en-US', timezoneId: 'UTC',
    colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  context.setDefaultTimeout(10000);
  try {
    const page = await context.newPage();
    const { phases, beginAccessibilityAudit } = await collectDiagnostics(context, page, base);
    const response = await page.goto(new URL(route, base).href, { waitUntil: 'networkidle' });
    const failures = [];
    const checks = {
      httpStatus: response?.status() ?? null, visibleMainHeading: false,
      requestedThemeApplied: false, mobileMenuRestoredFocus: view.mobile ? false : null,
    };
    try {
      assert.equal(checks.httpStatus, 200);
      await expect(page.locator('main h1')).toBeVisible();
      checks.visibleMainHeading = true;
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      checks.requestedThemeApplied = true;
      if (view.mobile) {
        await mobileMenuCheck(page);
        checks.mobileMenuRestoredFocus = true;
      }
    } catch (error) {
      failures.push(String(error.message).slice(0, 1024));
    }
    const observed = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      return {
        title: document.title,
        documentLanguage: document.documentElement.lang,
        resolvedTheme: document.documentElement.dataset.theme,
        overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        navigation: navigation && {
          durationMs: navigation.duration, domContentLoadedMs: navigation.domContentLoadedEventEnd,
          loadMs: navigation.loadEventEnd, transferredBytes: navigation.transferSize,
        },
      };
    });
    const name = view.name + '-' + theme;
    const image = name + '.png';
    const tree = name + '.aria.yaml';
    const diagnostics = name + '.events.json';
    const aria = await page.locator('body').ariaSnapshot();
    const screenshot = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    // Axe may issue its own stylesheet requests. Keep those visible without
    // attributing them to the observed page and keyboard interaction.
    beginAccessibilityAudit();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    const violations = axe.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }));
    const diagnosticsSnapshot = json(phases);
    const counts = { ...phases.page.counts };
    const auditCounts = { ...phases.accessibilityAudit.counts };
    await writeFile(path.join(output, image), screenshot, { flag: 'wx' });
    await writeFile(path.join(output, tree), aria, { flag: 'wx' });
    await writeFile(path.join(output, diagnostics), diagnosticsSnapshot, { flag: 'wx' });
    return {
      viewport: { width: view.width, height: view.height, mobile: view.mobile },
      theme, checks, observed, failures, violations, diagnosticCounts: counts,
      accessibilityAuditCounts: auditCounts,
      outcome: failures.length || violations.length || observed.overflowPx > 1
        || counts.pageErrors || counts.localRequestFailures ? 'failed' : 'passed',
      files: Object.fromEntries(await Promise.all([image, tree, diagnostics].map(async file =>
        [file, await sha256(path.join(output, file))]))),
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    bundle: { type: 'string' }, 'expected-sha256': { type: 'string' }, output: { type: 'string' },
  } });
  const expected = values['expected-sha256'];
  assert.ok(values.bundle && values.output && /^[0-9a-f]{64}$/.test(expected ?? ''),
    'Provide --bundle, --expected-sha256 and a new --output directory');
  const bundle = await realpath(values.bundle);
  const output = path.join(await realpath(path.dirname(path.resolve(values.output))), path.basename(values.output));
  const relative = path.relative(bundle, output);
  assert.ok(path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep),
    'Keep evidence outside the publication directory');
  await verifyBundle(bundle, expected);
  const manifestPath = path.join(bundle, 'publication.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.ok(/^[0-9a-f]{40}$/.test(manifest.sources?.portfolio?.commit ?? ''),
    'Expected a source-qualified Portfolio candidate');
  const binary = chromium.executablePath();
  const executableSha256 = await sha256(binary);
  await mkdir(output);
  const server = createServer(createHandler(bundle));
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: binary });
    const base = new URL(`http://127.0.0.1:${server.address().port}`);
    const captures = [];
    for (const view of views) {
      for (const theme of ['light', 'dark']) captures.push(await capture(browser, base, output, view, theme));
    }
    await verifyBundle(bundle, expected);
    assert.equal(await sha256(binary), executableSha256, 'Browser executable changed during capture');
    const outcome = captures.every(capture => capture.outcome === 'passed') ? 'passed' : 'failed';
    const receipt = {
      schemaVersion: 1, kind: 'portfolio-browser-evidence', scope: 'local-publication-candidate',
      capturedAt: new Date().toISOString(), outcome, route,
      candidate: {
        treeSha256: expected, publicationManifestSha256: await sha256(manifestPath),
        sources: manifest.sources, compilerProjection: manifest.compilerProjection,
      },
      captureTool: {
        nodeVersion: process.version, scriptSha256: await sha256(fileURLToPath(import.meta.url)),
        digestScriptSha256: await sha256(digestScript),
        serverScriptSha256: await sha256(fileURLToPath(new URL('./serve-lhci.mjs', import.meta.url))),
        packageLockSha256: await sha256(fileURLToPath(new URL('../package-lock.json', import.meta.url))),
      },
      browser: {
        name: 'chromium', version: browser.version(), executableSha256,
        playwrightVersion: require('playwright/package.json').version,
        platform: process.platform, architecture: process.arch, osRelease: release(),
      },
      locale: 'en-US', timezone: 'UTC', deviceScaleFactor: 1, reducedMotion: 'reduce', captures,
    };
    const receiptPath = path.join(output, 'browser-evidence.json');
    await writeFile(receiptPath, json(receipt), { flag: 'wx' });
    console.log(json({ outcome, receiptSha256: await sha256(receiptPath), captures: captures.length }).trimEnd());
    if (outcome === 'failed') process.exitCode = 1;
  } finally {
    try { await browser?.close(); }
    finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
