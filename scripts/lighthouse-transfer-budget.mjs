#!/usr/bin/env node
// Applies non-overlapping warning/block thresholds to Lighthouse transfer bytes.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export const WARNING_BYTES = 500_000;
export const ERROR_BYTES = 750_000;
export const EXPECTED_ROUTES = ['/', '/about/', '/atlas/', '/reproduce/', '/research/'];
export const EXPECTED_PROFILES = ['mobile', 'desktop'];
export const RUNS_PER_ROUTE_PROFILE = 3;

export function classifyTransferBytes(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new TypeError(`Expected a non-negative integer transfer size, got ${bytes}`);
  }
  if (bytes > ERROR_BYTES) return { severity: 'error', bytes };
  if (bytes > WARNING_BYTES) return { severity: 'warning', bytes };
  return { severity: 'pass', bytes };
}

export function totalTransferBytes(lhr) {
  const items = lhr?.audits?.['resource-summary']?.details?.items;
  if (!Array.isArray(items)) throw new Error('Lighthouse report is missing resource-summary items');
  const total = items.find((item) => item.resourceType === 'total');
  if (!total || !Number.isSafeInteger(total.transferSize) || total.transferSize < 0) {
    throw new Error('Lighthouse report is missing a valid total transferSize');
  }
  return total.transferSize;
}

export function validateLighthouseValidity(lhr) {
  if (lhr?.runtimeError) return `Lighthouse runtime error: ${lhr.runtimeError.message ?? lhr.runtimeError.code ?? 'unknown error'}`;
  if (typeof lhr?.categories?.performance?.score !== 'number' || !Number.isFinite(lhr.categories.performance.score)) {
    return 'Lighthouse performance score is unavailable';
  }
  const lcp = lhr?.audits?.['largest-contentful-paint']?.numericValue;
  if (typeof lcp !== 'number' || !Number.isFinite(lcp)) return 'Largest Contentful Paint is unavailable (NO_LCP or invalid navigation)';
  return null;
}

function escapeAnnotation(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

async function main() {
  const dirs = reportDirectories(process.argv);
  const expected = validateReportMatrix(dirs);
  const findings = await readAllFindings(dirs);
  validateFindingMatrix(findings, expected);
  findings.forEach(printFinding);
  const blocked = findings.some((finding) => finding.severity === 'error');
  const invalid = findings.some((finding) => finding.invalidReason);
  process.stdout.write(`Checked ${findings.length} Lighthouse report(s); ${findings.filter((x) => x.severity === 'warning').length} warning(s), ${findings.filter((x) => x.severity === 'error').length} transfer-blocking result(s), ${findings.filter((x) => x.invalidReason).length} invalid result(s).\n`);
  if (blocked || invalid) process.exitCode = 1;
}

function reportDirectories(args) {
  const dirs = args.flatMap((value, index) => value === '--dir' && args[index + 1] ? [path.resolve(args[index + 1])] : []);
  const requested = args.filter((value) => value === '--dir').length;
  if (dirs.length !== requested) throw new Error('--dir requires a directory');
  const resolved = dirs.length ? dirs : [path.resolve('lighthouse-results')];
  if (resolved.length !== EXPECTED_PROFILES.length) {
    throw new Error(`Expected exactly ${EXPECTED_PROFILES.length} Lighthouse report directories (mobile and desktop), got ${resolved.length}`);
  }
  return resolved;
}

function validateReportMatrix(dirs) {
  const profiles = dirs.map((dir) => dir.endsWith('-desktop') ? 'desktop' : 'mobile');
  if (new Set(profiles).size !== EXPECTED_PROFILES.length || EXPECTED_PROFILES.some((profile) => !profiles.includes(profile))) {
    throw new Error('Expected one mobile report directory and one directory ending in -desktop');
  }
  return new Map(dirs.map((dir, index) => [dir, profiles[index]]));
}

export function validateFindingMatrix(findings, expectedProfiles) {
  const expectedCount = EXPECTED_ROUTES.length * RUNS_PER_ROUTE_PROFILE * expectedProfiles.size;
  if (findings.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} Lighthouse reports (${EXPECTED_ROUTES.length} routes × ${RUNS_PER_ROUTE_PROFILE} runs × ${expectedProfiles.size} profiles), got ${findings.length}`);
  }
  const counts = new Map();
  for (const finding of findings) {
    const route = routePath(finding.url);
    if (!EXPECTED_ROUTES.includes(route)) throw new Error(`Unexpected Lighthouse route: ${finding.url}`);
    if (!expectedProfiles.has(finding.reportDir)) throw new Error(`Unexpected Lighthouse report directory: ${finding.reportDir}`);
    const profile = expectedProfiles.get(finding.reportDir);
    if (finding.profile !== profile) throw new Error(`Lighthouse profile mismatch for ${finding.url}: expected ${profile}, got ${finding.profile}`);
    if (finding.formFactor !== profile) throw new Error(`Lighthouse report form factor mismatch for ${finding.url}: expected ${profile}, got ${finding.formFactor ?? 'missing'}`);
    if (routePath(finding.requestedUrl) !== route) {
      throw new Error(`Lighthouse requested URL route mismatch: manifest ${route}, report ${finding.requestedUrl}`);
    }
    const key = `${profile} ${route}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const profile of EXPECTED_PROFILES) {
    for (const route of EXPECTED_ROUTES) {
      const count = counts.get(`${profile} ${route}`) ?? 0;
      if (count !== RUNS_PER_ROUTE_PROFILE) {
        throw new Error(`Expected ${RUNS_PER_ROUTE_PROFILE} Lighthouse reports for ${profile} ${route}, got ${count}`);
      }
    }
  }
}

function routePath(url) {
  try { return new URL(url).pathname; }
  catch { throw new Error(`Lighthouse report has an invalid URL: ${url}`); }
}

async function readAllFindings(dirs) {
  const findings = [];
  for (const reportDir of dirs) findings.push(...await readDirectoryFindings(reportDir));
  return findings;
}

async function readDirectoryFindings(reportDir) {
  const manifestPath = path.join(reportDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest) || manifest.length === 0) throw new Error(`No Lighthouse reports in ${manifestPath}`);
  const findings = [];
  const profile = reportDir.endsWith('-desktop') ? 'desktop' : 'mobile';
  for (const entry of manifest) findings.push(await readFinding(entry, reportDir, profile));
  return findings;
}

async function readFinding(entry, reportDir, profile) {
  if (typeof entry.jsonPath !== 'string') throw new Error('Lighthouse manifest entry has no jsonPath');
  const reportPath = path.resolve(entry.jsonPath);
  const lhr = JSON.parse(await readFile(reportPath, 'utf8'));
  const bytes = totalTransferBytes(lhr);
  return {
    url: entry.url ?? lhr.finalDisplayedUrl ?? lhr.finalUrl,
    requestedUrl: lhr.requestedUrl,
    formFactor: lhr.configSettings?.formFactor,
    reportDir,
    profile,
    bytes,
    invalidReason: validateLighthouseValidity(lhr),
    ...classifyTransferBytes(bytes),
  };
}

function printFinding(finding) {
  if (finding.invalidReason) emitAnnotation('error', `Invalid Lighthouse ${finding.profile} observation for ${finding.url}: ${finding.invalidReason}.`);
  if (finding.severity === 'pass') return;
  const threshold = finding.severity === 'warning' ? WARNING_BYTES : ERROR_BYTES;
  const action = finding.severity === 'warning' ? 'warn above' : 'block above';
  emitAnnotation(finding.severity, `Lighthouse ${finding.profile} initial-navigation transfer ${finding.bytes} bytes for ${finding.url}; ${action} ${threshold} bytes (decimal bytes).`);
}

function emitAnnotation(severity, message) {
  process.stderr.write(`::${severity}::${escapeAnnotation(message)}\n`);
  process.stderr.write(`${severity.toUpperCase()}: ${message}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    process.stderr.write(`Lighthouse transfer-budget check failed: ${error.message}\n`);
    process.exitCode = 2;
  });
}
