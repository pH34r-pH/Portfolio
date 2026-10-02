#!/usr/bin/env node
// Applies non-overlapping warning/block thresholds to Lighthouse transfer bytes.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export const WARNING_BYTES = 500_000;
export const ERROR_BYTES = 750_000;

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
  const findings = await readAllFindings(dirs);
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
  return dirs.length ? dirs : [path.resolve('lighthouse-results')];
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
  for (const entry of manifest) findings.push(await readFinding(entry, reportDir));
  return findings;
}

async function readFinding(entry, reportDir) {
  if (typeof entry.jsonPath !== 'string') throw new Error('Lighthouse manifest entry has no jsonPath');
  const reportPath = path.resolve(entry.jsonPath);
  const lhr = JSON.parse(await readFile(reportPath, 'utf8'));
  const bytes = totalTransferBytes(lhr);
  return { url: entry.url ?? lhr.finalDisplayedUrl ?? lhr.finalUrl, profile: reportDir.endsWith('-desktop') ? 'desktop' : 'mobile', bytes, invalidReason: validateLighthouseValidity(lhr), ...classifyTransferBytes(bytes) };
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
