#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyTransferBytes, totalTransferBytes, validateLighthouseValidity, validateFindingMatrix, EXPECTED_ROUTES, RUNS_PER_ROUTE_PROFILE, WARNING_BYTES, ERROR_BYTES } from './lighthouse-transfer-budget.mjs';

assert.equal(WARNING_BYTES, 500_000);
assert.equal(ERROR_BYTES, 750_000);
assert.deepEqual(classifyTransferBytes(0), { severity: 'pass', bytes: 0 });
assert.deepEqual(classifyTransferBytes(499_999), { severity: 'pass', bytes: 499_999 });
assert.deepEqual(classifyTransferBytes(500_000), { severity: 'pass', bytes: 500_000 });
assert.deepEqual(classifyTransferBytes(500_001), { severity: 'warning', bytes: 500_001 });
assert.deepEqual(classifyTransferBytes(749_999), { severity: 'warning', bytes: 749_999 });
assert.deepEqual(classifyTransferBytes(750_000), { severity: 'warning', bytes: 750_000 });
assert.deepEqual(classifyTransferBytes(750_001), { severity: 'error', bytes: 750_001 });

assert.equal(totalTransferBytes({
  audits: { 'resource-summary': { details: { items: [
    { resourceType: 'script', transferSize: 10 },
    { resourceType: 'total', transferSize: 750_001 },
  ] } } },
}), 750_001);
assert.throws(() => totalTransferBytes({ audits: {} }), /missing resource-summary items/);
assert.throws(() => totalTransferBytes({ audits: { 'resource-summary': { details: { items: [] } } } }), /missing a valid total transferSize/);
assert.throws(() => classifyTransferBytes(-1), /non-negative integer/);
assert.throws(() => classifyTransferBytes(1.5), /non-negative integer/);

const validLhr = { categories: { performance: { score: 0.99 } }, audits: { 'largest-contentful-paint': { numericValue: 1_500 } } };
assert.equal(validateLighthouseValidity(validLhr), null);
assert.match(validateLighthouseValidity({ categories: { performance: { score: null } }, audits: { 'largest-contentful-paint': { numericValue: null } } }), /performance score is unavailable/);
assert.match(validateLighthouseValidity({ ...validLhr, audits: { 'largest-contentful-paint': { numericValue: null } } }), /NO_LCP/);
assert.match(validateLighthouseValidity({ ...validLhr, runtimeError: { code: 'NO_LCP' } }), /runtime error/);

const mobileDir = '/reports/mobile';
const desktopDir = '/reports/desktop';
const profiles = new Map([[mobileDir, 'mobile'], [desktopDir, 'desktop']]);
const matrix = [...profiles].flatMap(([reportDir, profile]) => EXPECTED_ROUTES.flatMap((route) =>
  Array.from({ length: RUNS_PER_ROUTE_PROFILE }, () => ({
    reportDir,
    profile,
    formFactor: profile,
    url: `http://127.0.0.1:40000${route}`,
    observedUrl: `http://127.0.0.1:40000${route}`,
  })),
));
assert.doesNotThrow(() => validateFindingMatrix(matrix, profiles));
assert.throws(() => validateFindingMatrix(matrix.slice(1), profiles), /Expected 30 Lighthouse reports/);
const oneMissingAbout = matrix.filter((finding) => !finding.url.endsWith('/about/') || finding.profile !== 'mobile' || finding !== matrix.find((item) => item.url.endsWith('/about/') && item.profile === 'mobile'));
oneMissingAbout.push({ ...matrix.find((item) => item.url.endsWith('/research/') && item.profile === 'mobile') });
assert.throws(() => validateFindingMatrix(oneMissingAbout, profiles), /Expected 3 Lighthouse reports for mobile \/about\//);
assert.throws(() => validateFindingMatrix([...matrix.slice(0, -1), { ...matrix.at(-1), url: 'http://127.0.0.1:40000/not-audited/', observedUrl: 'http://127.0.0.1:40000/not-audited/' }], profiles), /Unexpected Lighthouse route/);
assert.throws(() => validateFindingMatrix([{ ...matrix[0], profile: 'desktop' }, ...matrix.slice(1)], profiles), /profile mismatch/);
assert.throws(() => validateFindingMatrix([{ ...matrix[0], formFactor: 'desktop' }, ...matrix.slice(1)], profiles), /form factor mismatch/);
assert.throws(() => validateFindingMatrix([{ ...matrix[0], observedUrl: 'http://127.0.0.1:40000/research/' }, ...matrix.slice(1)], profiles), /final URL route mismatch/);

process.stdout.write('Lighthouse transfer-budget boundary and report-matrix tests passed.\n');
