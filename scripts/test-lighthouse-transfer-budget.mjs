#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyTransferBytes, totalTransferBytes, validateLighthouseValidity, WARNING_BYTES, ERROR_BYTES } from './lighthouse-transfer-budget.mjs';

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

process.stdout.write('Lighthouse transfer-budget boundary tests passed.\n');
