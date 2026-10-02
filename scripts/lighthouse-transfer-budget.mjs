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

function escapeAnnotation(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

async function main() {
  const index = process.argv.indexOf('--dir');
  const reportDir = path.resolve(index >= 0 ? process.argv[index + 1] : 'lighthouse-results');
  if (index >= 0 && !process.argv[index + 1]) throw new Error('--dir requires a directory');
  const manifestPath = path.join(reportDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest) || manifest.length === 0) throw new Error(`No Lighthouse reports in ${manifestPath}`);

  const findings = [];
  for (const entry of manifest) {
    if (typeof entry.jsonPath !== 'string') throw new Error('Lighthouse manifest entry has no jsonPath');
    const reportPath = path.resolve(entry.jsonPath);
    const lhr = JSON.parse(await readFile(reportPath, 'utf8'));
    const bytes = totalTransferBytes(lhr);
    findings.push({ url: entry.url ?? lhr.finalDisplayedUrl ?? lhr.finalUrl, bytes, ...classifyTransferBytes(bytes) });
  }

  for (const finding of findings) {
    if (finding.severity === 'pass') continue;
    const message = `Lighthouse total initial-navigation transfer ${finding.bytes} bytes for ${finding.url}; ${finding.severity === 'warning' ? 'warn above' : 'block above'} ${finding.severity === 'warning' ? WARNING_BYTES : ERROR_BYTES} bytes (decimal kB).`;
    process.stderr.write(`::${finding.severity}::${escapeAnnotation(message)}\n`);
    process.stderr.write(`${finding.severity.toUpperCase()}: ${message}\n`);
  }

  const blocked = findings.filter((finding) => finding.severity === 'error');
  process.stdout.write(`Checked ${findings.length} Lighthouse report(s); ${findings.filter((x) => x.severity === 'warning').length} warning(s), ${blocked.length} blocking result(s).\n`);
  if (blocked.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    process.stderr.write(`Lighthouse transfer-budget check failed: ${error.message}\n`);
    process.exitCode = 2;
  });
}
