#!/usr/bin/env node
// Reproducible local-source measurement with an owned ephemeral-port server.
// Brotli and cache headers mirror the currently deployed tyharbin.com responses.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
}
const root = path.resolve(arg('root', path.join(project, 'site')));
const output = path.resolve(arg('output', '/tmp/portfolio-perf-study/source-fixture'));
const runsIndex = process.argv.indexOf('--runs');
const runs = Number(runsIndex < 0 ? '3' : process.argv[runsIndex + 1]);
const routeArgs = process.argv.flatMap((value, index) => value === '--route' && process.argv[index + 1] ? [process.argv[index + 1]] : []);
const sourceSha = arg('source-sha', 'a92e93cf91efabf4357c67bedb5a9e19486a1c71');
const profile = arg('profile', 'default');
const throughputKbps = arg('throttling-download-throughput-kbps', null);
const captureWarm = !process.argv.includes('--no-warm-cycles');
const chrome = process.env.CHROME_PATH;
const lighthouse = path.join(project, 'node_modules/.bin/lighthouse');
const defaultRoutes = [
  { id: 'homepage', path: '/' },
  { id: 'research-index', path: '/research/' },
];
const routes = routeArgs.length
  ? routeArgs.map((route) => ({ id: route === '/' ? 'homepage' : route.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-'), path: route.startsWith('/') ? route : `/${route}` }))
  : defaultRoutes;
if (!chrome || !Number.isInteger(runs) || runs < 1) throw new Error('Set CHROME_PATH and a positive --runs count.');
await mkdir(output, { recursive: true });

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'], ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'], ['.webmanifest', 'application/manifest+json'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf'], ['.otf', 'font/otf'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.gif', 'image/gif'], ['.ico', 'image/x-icon'],
]);
const compressible = /^(text\/|application\/(json|javascript|xml|manifest\+json)|image\/svg\+xml)/;
const results = [];

function runLighthouse(args, timeoutMs = 240_000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, HOME: process.env.BROWSER_HOME ?? process.env.HOME, CHROME_PATH: chrome },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ status: null, error: error.message, stderr });
    });
    child.once('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, error: signal ? `Lighthouse exited on ${signal}` : null, stderr });
    });
  });
}

async function ownedServer() {
  const requests = [];
  let phase = 'readiness';
  const state = { requests, get phase() { return phase; }, set phase(value) { phase = value; } };
  const server = createServer((req, res) => { void respondOwnedRequest(req, res, state); });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const readiness = await fetch(`${base}/`);
  if (readiness.status !== 200) throw new Error(`Owned server readiness returned ${readiness.status}`);
  await readiness.arrayBuffer();
  await fetch(`${base}/_benchmark/phase?name=measurement`);
  return { server, base, requests, async phase(name) { await fetch(`${base}/_benchmark/phase?name=${encodeURIComponent(name)}`); } };
}

async function respondOwnedRequest(req, res, state) {
  if (servePhaseRequest(req, res, state)) return;
  const pathname = requestPath(req, res);
  if (pathname === null) return;
  const file = safeFilePath(pathname, res);
  if (file === null) return;
  await serveOwnedFile(req, res, file, state);
}

function servePhaseRequest(req, res, state) {
  if (!req.url?.startsWith('/_benchmark/phase?')) return false;
  state.phase = new URL(req.url, 'http://127.0.0.1').searchParams.get('name') ?? state.phase;
  res.writeHead(204).end();
  return true;
}

function requestPath(req, res) {
  try { return decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400).end(); return null; }
}

function safeFilePath(pathname, res) {
  const file = path.resolve(root, `.${pathname}`);
  if (file === root || file.startsWith(`${root}${path.sep}`)) return file;
  res.writeHead(403).end();
  return null;
}

async function serveOwnedFile(req, res, initialFile, state) {
  try {
    const file = await resolveFile(initialFile);
    const source = await readFile(file);
    const { body, headers } = compressResponse(source, mime.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream', req.headers['accept-encoding']);
    headers['content-length'] = String(body.length);
    state.requests.push({ phase: state.phase, method: req.method, url: req.url, file: path.relative(root, file), status: 200, requestHeaders: req.headers, responseHeaders: headers, decodedBytes: source.length, transferBodyBytes: body.length });
    res.writeHead(200, headers);
    req.method === 'HEAD' ? res.end() : res.end(body);
  } catch (error) {
    state.requests.push({ phase: state.phase, method: req.method, url: req.url, status: 404, error: String(error) });
    res.writeHead(404, { 'cache-control': 'public, must-revalidate, max-age=30' }).end('Not found');
  }
}

async function resolveFile(file) {
  return (await stat(file)).isDirectory() ? path.join(file, 'index.html') : file;
}

function compressResponse(source, type, acceptEncoding = '') {
  const headers = { 'content-type': type, 'cache-control': 'public, must-revalidate, max-age=30' };
  if (!compressible.test(type) || !/(?:^|,)\s*br\s*(?:,|$)/i.test(acceptEncoding)) return { body: source, headers };
  headers['content-encoding'] = 'br';
  headers.vary = 'Accept-Encoding';
  return { body: brotliCompressSync(source, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }), headers };
}

async function captureWarmCycles(base, route, mode, server, stem) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: mode === 'mobile' ? { width: 390, height: 844 } : { width: 1350, height: 900 }, deviceScaleFactor: 1, isMobile: mode === 'mobile' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  let cycle = 'cold';
  const byRequest = new Map();
  cdp.on('Network.requestWillBeSent', (event) => byRequest.set(event.requestId, { cycle, url: event.request.url, resourceType: event.type }));
  cdp.on('Network.responseReceived', (event) => {
    const row = byRequest.get(event.requestId) ?? { cycle, url: event.response.url };
    Object.assign(row, { status: event.response.status, headers: event.response.headers, protocol: event.response.protocol, fromDiskCache: event.response.fromDiskCache, fromServiceWorker: event.response.fromServiceWorker, mimeType: event.response.mimeType });
    byRequest.set(event.requestId, row);
  });
  cdp.on('Network.requestServedFromCache', (event) => {
    const row = byRequest.get(event.requestId);
    if (row) row.servedFromCache = true;
  });
  cdp.on('Network.loadingFinished', (event) => {
    const row = byRequest.get(event.requestId);
    if (row) row.encodedDataLength = event.encodedDataLength;
  });
  cdp.on('Network.loadingFailed', (event) => {
    const row = byRequest.get(event.requestId);
    if (row) row.error = event.errorText;
  });
  const cycles = [];
  for (const name of ['cold', 'warm-repeat']) {
    cycle = name;
    await server.phase(name);
    let navigationError = null;
    try {
      await page.goto(`${base}${route.path}`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(300);
    } catch (error) { navigationError = String(error); }
    const rows = [...byRequest.values()].filter((row) => row.cycle === name);
    cycles.push({ name, url: page.url(), title: await page.title().catch(() => ''), navigationError, encodedBytes: rows.reduce((sum, row) => sum + (row.encodedDataLength ?? 0), 0), cacheHits: rows.filter((row) => row.servedFromCache || row.fromDiskCache || row.fromServiceWorker).length, requestCount: rows.length, requests: rows });
  }
  await writeFile(path.join(output, `${stem}.cold-warm.json`), `${JSON.stringify(cycles, null, 2)}\n`);
  await context.close();
  await browser.close();
}

async function addReportDetails(row, reportPath, output, id) {
  if (row.exitCode !== 0) return;
  try {
    const lhr = JSON.parse(await readFile(reportPath, 'utf8'));
    copyLighthouseMetadata(row, lhr);
    await saveLighthouseScreenshot(row, lhr, output, id);
  } catch (error) { row.parseError = String(error); }
}

function copyLighthouseMetadata(row, lhr) {
  row.finalUrl = lhr.finalDisplayedUrl ?? lhr.finalUrl;
  row.lighthouseVersion = lhr.lighthouseVersion;
  row.userAgent = lhr.userAgent;
  row.fetchTime = lhr.fetchTime;
  row.scores = lighthouseScores(lhr.categories);
  row.metrics = lighthouseMetrics(lhr.audits);
  row.resources = resourceBreakdown(lhr.audits);
}

function lighthouseScores(categories = {}) {
  return Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, value.score]));
}

function lighthouseMetrics(audits = {}) {
  const metrics = {};
  for (const [key, value] of Object.entries(audits)) {
    if (isSelectedMetric(key, value)) metrics[key] = { value: value.numericValue, unit: value.numericUnit };
  }
  return metrics;
}

function isSelectedMetric(key, value) {
  const names = ['first-contentful-paint', 'largest-contentful-paint', 'speed-index', 'total-blocking-time', 'cumulative-layout-shift', 'interactive'];
  return value?.numericValue !== undefined && names.includes(key);
}

function resourceBreakdown(audits = {}) {
  return (audits['resource-summary']?.details?.items ?? []).map((row) => ({ resourceType: row.resourceType, label: row.label, transferSize: row.transferSize, resourceSize: row.resourceSize, requestCount: row.requestCount }));
}

async function saveLighthouseScreenshot(row, lhr, output, id) {
  const shot = lhr.audits?.['final-screenshot']?.details?.data;
  if (typeof shot !== 'string' || !shot.startsWith('data:image/')) return;
  const ext = shot.slice(5, shot.indexOf(';')) === 'image/jpeg' ? 'jpg' : 'png';
  row.screenshot = `${id}.${ext}`;
  await writeFile(path.join(output, row.screenshot), Buffer.from(shot.split(',', 2)[1], 'base64'));
}

for (let round = 1; round <= runs; round += 1) {
  for (const route of routes) {
    for (const mode of ['mobile', 'desktop']) {
      const id = `${String(round).padStart(2, '0')}-source-${route.id}-${mode}`;
      const reportPath = path.join(output, `${id}.report.json`);
      const stderrPath = path.join(output, `${id}.stderr.log`);
      const owned = await ownedServer();
      const url = `${owned.base}${route.path}`;
      await fetch(`${owned.base}/_benchmark/phase?name=lighthouse-cold`);
      const args = [lighthouse, url, '--output=json', `--output-path=${reportPath}`, '--quiet', '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage'];
      if (mode === 'desktop') args.push('--preset=desktop');
      if (throughputKbps !== null && mode === 'mobile') args.push(`--throttling.downloadThroughputKbps=${throughputKbps}`);
      const run = await runLighthouse(args);
      await writeFile(stderrPath, run.stderr ?? '');
      const row = { round, id, fixture: root === path.resolve(path.join(project, 'site')) ? 'Portfolio tracked site/ source fixture' : 'assembled Portfolio publication bundle', sourceSha, route: route.path, mode, profile, throttlingDownloadThroughputKbps: mode === 'mobile' ? throughputKbps : null, exitCode: run.status, error: run.error ?? null, report: path.basename(reportPath), stderr: path.basename(stderrPath), server: 'owned loopback server, OS-assigned port (0), readiness GET 200 before Lighthouse', cachePolicy: 'public, must-revalidate, max-age=30 (observed production)', compression: 'Brotli quality 5 for compressible resources, content-encoding br and Vary: Accept-Encoding (observed production)', warmCyclesCaptured: captureWarm };
      await addReportDetails(row, reportPath, output, id);
      if (captureWarm) {
        await owned.phase('warm-browser-cold-and-repeat');
        await captureWarmCycles(owned.base, route, mode, owned, id);
      }
      row.responseLog = `${id}.headers.json`;
      await writeFile(path.join(output, row.responseLog), `${JSON.stringify(owned.requests, null, 2)}\n`);
      await new Promise((resolve) => owned.server.close(resolve));
      results.push(row);
      await writeFile(path.join(output, 'summary.json'), `${JSON.stringify(results, null, 2)}\n`);
      process.stdout.write(`${id}: ${row.exitCode === 0 ? `${row.finalUrl} p=${row.scores?.performance} a=${row.scores?.accessibility}` : `FAILED ${row.error ?? run.stderr}`}\n`);
    }
  }
}

await writeFile(path.join(output, 'environment.json'), `${JSON.stringify({ startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), sampleCount: results.length, node: process.version, lighthouse: '12.6.1', playwright: '1.55.0', browser: process.env.BROWSER_VERSION ?? '140.0.7339.16', profile, throttlingDownloadThroughputKbps: throughputKbps, warmCyclesCaptured: captureWarm, sourceHead: sourceSha, root, routes, inputs: { researchNotes: '965fb9186a0c1bb99cc3bd60b2e86668b0f12a91', theoremLibrary: 'cbc5eebbea115decdc27e2e32bb0dc79738a5947', compiler: '7bf2e42fe1882e3bed9828b43f4354523fd50bd5' }, bundleDigest: 'e26fd1aa01e2a4ae1b4126bdf170469bb1f349dcb01f621394ea2a29f976c0fd' }, null, 2)}\n`);
const failed = results.filter((row) => row.exitCode !== 0 || row.parseError);
process.exitCode = failed.length ? 1 : 0;
