import assert from 'node:assert/strict';
import {rgbChannelError,rgbChannelErrorParallel} from './model-pixel-fidelity.mjs';

const identity = rgbChannelError(Uint8Array.from([0, 128, 255]), Uint8Array.from([0, 128, 255]));
assert.equal(identity.meanAbsoluteChannelError, 0);
assert.equal(identity.p99AbsoluteChannelError, 0);
assert.equal(identity.maxAbsoluteChannelError, 0);

const oneStep = rgbChannelError(Uint8Array.from([244, 249, 253]), Uint8Array.from([243, 249, 254]));
assert.equal(oneStep.meanAbsoluteChannelError, .6667);
assert.equal(oneStep.p99AbsoluteChannelError, 1);
assert.equal(oneStep.maxAbsoluteChannelError, 1);

const larger = rgbChannelError(Uint8Array.from([100, 100, 100]), Uint8Array.from([90, 110, 100]));
assert.equal(larger.meanAbsoluteChannelError, 6.6667);
assert.equal(larger.p99AbsoluteChannelError, 10);
assert.equal(larger.maxAbsoluteChannelError, 10);

assert.throws(() => rgbChannelError(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2])), /equally sized RGB/);
assert.deepEqual(await rgbChannelErrorParallel(Uint8Array.from([244,249,253]),Uint8Array.from([243,249,254])),oneStep);
assert.deepEqual(await rgbChannelErrorParallel(Uint8Array.from([100,100,100]),Uint8Array.from([90,110,100])),larger);
console.log('Direct RGB channel-difference vectors passed: identity, one-step channel deltas and larger independent deltas.');
