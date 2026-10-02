#!/usr/bin/env node
// Standalone, serial Lighthouse harness for the performance-budget research draft.
// Each sample is a new Lighthouse/Chrome process and profile. No upload service is used.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const references = [
  { id: 'quanta-turbulence', class: 'editorial', award: '2025 Webby People’s Voice, Science', url: 'https://www.quantamagazine.org/sea-monkeys-show-scientists-how-to-rewrite-a-rule-of-turbulence-20261002/' },
  { id: 'nasa-crew-13', class: 'editorial', award: '2025 Webby / People’s Voice, Government & Associations', url: 'https://www.nasa.gov/news-release/nasas-spacex-crew-13-launches-to-international-space-station/' },
  { id: 'mit-climate-primer', class: 'editorial-education', award: 'MIT educational feature; organizer archive verification pending', url: 'https://climateprimer.mit.edu/climate-science/' },
  { id: 'seeing-theory', class: 'interactive-education', award: '2017 Information is Beautiful Awards, Silver, Science/Technology/Health; archived-site caveat', url: 'https://seeing-theory.brown.edu/basic-probability/index.html' },
  { id: 'dennis-snellenberg', class: 'interactive-portfolio', award: 'Awwwards SOTD / Developer Award', url: 'https://dennissnellenberg.com/' },
  { id: 'bruno-simon-successor', class: 'interactive-portfolio-successor', award: 'Current WebGPU/TSL successor; award attribution is to a different 2019 build', url: 'https://bruno-simon.com/' },
  { id: 'breakthrough-energy-2023', class: 'editorial-education-archive', award: '2024 Webby and People’s Voice, Science; archived 2023 State of Transition site', url: 'https://2023.breakthroughenergy.org/bill-foreword/' },
];
const phase2References = [
  { id: 'niccolo-miranda', class: 'interactive-portfolio', award: 'Awwwards Site of the Day (2021-11-18) and Developer Award', awardUrl: 'https://www.awwwards.com/sites/miranda-paper-portfolio', url: 'https://www.niccolomiranda.com/' },
  { id: 'usestate-tomoya-okada', class: 'portfolio', award: 'CSSWinner Site of the Day (2024-09-24); award entry is Tomoya Okada Portfolio v5, current URL/title must be recorded as served', awardUrl: 'https://www.csswinner.com/details/tomoyaokada-portfolio-v5/18286', url: 'https://www.usestate.org/' },
  { id: 'junji-yamazaki', class: 'portfolio', award: 'CSSWinner Site of the Day (2024-10-29)', awardUrl: 'https://www.csswinner.com/details/junji-yamazaki-portfolio/18346', url: 'https://junji-yamazaki.design/' },
];
const cohort = process.argv.includes('--phase2') ? phase2References : references;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
}

const output = path.resolve(arg('output', '/tmp/portfolio-perf-study/reports'));
const runs = Number(arg('runs', '3'));
const modes = arg('modes', 'mobile,desktop').split(',');
const chrome = process.env.CHROME_PATH;
const lhBin = path.resolve('node_modules/.bin/lighthouse');
if (!chrome) throw new Error('Set CHROME_PATH to the pinned Chromium executable.');
if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer.');
if (modes.some((mode) => !['mobile', 'desktop'].includes(mode))) throw new Error('Modes must be mobile and/or desktop.');
await mkdir(output, { recursive: true });

const environment = {
  startedAt: new Date().toISOString(),
  node: process.version,
  lighthouse: '12.6.1 (locked through @lhci/cli 0.15.1)',
  playwright: '1.55.0 (project lock)',
  chromium: process.env.BROWSER_VERSION ?? 'record separately with chrome --version',
  host: process.platform,
  arch: process.arch,
  throttling: 'Lighthouse simulated throttling defaults; mobile emulation for mobile, desktop preset for desktop',
  coldProfile: 'one new Lighthouse Chrome process/profile per observation; Lighthouse default storage/cache clearing enabled',
  trust: 'normal TLS validation; supply BROWSER_HOME containing the environment proxy CA in its isolated Chromium NSS database where required',
  order: 'round-major, then frozen reference order, then mode order; serial',
};
environment.cohort = process.argv.includes('--phase2') ? 'phase2-locked-three-portfolio-references' : 'phase1';
await writeFile(path.join(output, 'environment.json'), `${JSON.stringify(environment, null, 2)}\n`);
await writeFile(path.join(output, 'cohort.json'), `${JSON.stringify(cohort, null, 2)}\n`);

const summary = [];
const surveyed = new Set();
async function captureHeaderSurvey(reference, mode, id) {
  const browser = await chromium.launch({ headless: true, env: { ...process.env, HOME: process.env.BROWSER_HOME ?? process.env.HOME } });
  const context = await browser.newContext({
    viewport: mode === 'mobile' ? { width: 390, height: 844 } : { width: 1350, height: 900 },
    deviceScaleFactor: 1,
    isMobile: mode === 'mobile',
  });
  const page = await context.newPage();
  const responses = [];
  const failures = [];
  page.on('response', async (response) => {
    try {
      responses.push({ url: response.url(), status: response.status(), resourceType: response.request().resourceType(), headers: await response.allHeaders() });
    } catch (error) {
      failures.push({ url: response.url(), error: String(error) });
    }
  });
  page.on('requestfailed', (request) => failures.push({ url: request.url(), error: request.failure()?.errorText ?? 'request failed' }));
  let navigationError = null;
  try {
    await page.goto(reference.url, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForTimeout(1500);
  } catch (error) {
    navigationError = String(error);
  }
  const survey = {
    id,
    requestedUrl: reference.url,
    finalUrl: page.url(),
    navigationError,
    title: await page.title().catch(() => ''),
    mainText: await page.locator('body').innerText({ timeout: 5000 }).catch((error) => `UNAVAILABLE: ${error}`),
    screenshot: `${id}.header-survey.jpg`,
    responses,
    failures,
  };
  await page.screenshot({ path: path.join(output, survey.screenshot), type: 'jpeg', quality: 75, fullPage: false }).catch((error) => { survey.screenshotError = String(error); });
  await writeFile(path.join(output, `${id}.headers.json`), `${JSON.stringify(survey, null, 2)}\n`);
  await context.close();
  await browser.close();
  return survey;
}

if (process.argv.includes('--headers-only')) {
  for (const reference of cohort) {
    for (const mode of modes) {
      const id = `review-${reference.id}-${mode}`;
      const survey = await captureHeaderSurvey(reference, mode, id);
      process.stdout.write(`${id}: ${survey.navigationError ?? survey.finalUrl} (${survey.responses.length} response headers, title=${JSON.stringify(survey.title)})\n`);
    }
  }
  process.exit(0);
}

for (let round = 1; round <= runs; round += 1) {
  for (const reference of cohort) {
    for (const mode of modes) {
      const id = `${String(round).padStart(2, '0')}-${reference.id}-${mode}`;
      const reportPath = path.join(output, `${id}.report.json`);
      const stderrPath = path.join(output, `${id}.stderr.log`);
      let headerSurvey = null;
      const surveyKey = `${reference.id}-${mode}`;
      if (round === 1 && !surveyed.has(surveyKey)) {
        headerSurvey = await captureHeaderSurvey(reference, mode, id);
        surveyed.add(surveyKey);
      }
      const args = [lhBin, reference.url, '--output=json', `--output-path=${reportPath}`, '--quiet', '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage'];
      if (mode === 'desktop') args.push('--preset=desktop');
      const result = spawnSync(process.execPath, args, {
        encoding: 'utf8',
        env: { ...process.env, HOME: process.env.BROWSER_HOME ?? process.env.HOME, CHROME_PATH: chrome },
        timeout: 240_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      await writeFile(stderrPath, [result.stderr ?? '', result.error?.stack ?? ''].filter(Boolean).join('\n'));
      const row = { round, id, reference: reference.id, class: reference.class, awardProvenance: reference.award, requestedUrl: reference.url, mode, exitCode: result.status, error: result.error?.message ?? null, report: path.basename(reportPath), stderr: path.basename(stderrPath), headerSurvey: headerSurvey ? path.basename(`${id}.headers.json`) : round > 1 ? `${String(1).padStart(2, '0')}-${reference.id}-${mode}.headers.json` : null };
      if (result.status === 0) {
        try {
          const lhr = JSON.parse(await readFile(reportPath, 'utf8'));
          const audits = lhr.audits ?? {};
          const requestRows = audits['network-requests']?.details?.items ?? [];
          const resources = audits['resource-summary']?.details?.items ?? [];
          row.finalUrl = lhr.finalDisplayedUrl ?? lhr.finalUrl;
          row.lighthouseVersion = lhr.lighthouseVersion;
          row.userAgent = lhr.userAgent;
          row.fetchTime = lhr.fetchTime;
          row.httpStatus = requestRows.find((request) => request.url === row.finalUrl)?.statusCode ?? null;
          row.scores = Object.fromEntries(Object.entries(lhr.categories ?? {}).map(([key, value]) => [key, value.score]));
          row.metrics = Object.fromEntries(Object.entries(audits).filter(([key, value]) => value?.numericValue !== undefined && ['first-contentful-paint', 'largest-contentful-paint', 'speed-index', 'total-blocking-time', 'cumulative-layout-shift', 'interactive', 'server-response-time'].includes(key)).map(([key, value]) => [key, { value: value.numericValue, unit: value.numericUnit }]));
          row.resources = resources.map((r) => ({ resourceType: r.resourceType, label: r.label, transferSize: r.transferSize, resourceSize: r.resourceSize, requestCount: r.requestCount }));
          row.requests = requestRows.map((r) => ({ url: r.url, resourceType: r.resourceType, statusCode: r.statusCode, transferSize: r.transferSize, resourceSize: r.resourceSize, mimeType: r.mimeType, responseHeaders: r.responseHeaders }));
          row.warnings = lhr.runWarnings ?? [];
          row.runtimeError = lhr.runtimeError ?? null;
          const screenshot = audits['final-screenshot']?.details?.data;
          if (typeof screenshot === 'string' && screenshot.startsWith('data:image/')) {
            const [, encoded] = screenshot.split(',', 2);
            const extension = screenshot.slice(5, screenshot.indexOf(';')) === 'image/jpeg' ? 'jpg' : 'png';
            const screenshotPath = path.join(output, `${id}.${extension}`);
            await writeFile(screenshotPath, Buffer.from(encoded, 'base64'));
            row.screenshot = path.basename(screenshotPath);
          }
        } catch (error) {
          row.parseError = String(error);
        }
      }
      summary.push(row);
      await writeFile(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
      process.stdout.write(`${id}: ${row.exitCode === 0 ? `${row.finalUrl} p=${row.scores?.performance} a=${row.scores?.accessibility}` : `FAILED ${row.error ?? result.stderr}`}\n`);
    }
  }
}
await writeFile(path.join(output, 'environment.json'), `${JSON.stringify({ ...environment, finishedAt: new Date().toISOString(), sampleCount: summary.length }, null, 2)}\n`);
const failed = summary.filter((row) => row.exitCode !== 0 || row.runtimeError || row.parseError || row.httpStatus !== 200);
process.exitCode = failed.length ? 1 : 0;
