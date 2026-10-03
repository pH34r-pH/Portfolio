import assert from "node:assert/strict";
import { observeArticleEndRelease } from "./article-release-observation.mjs";

// These are measured-geometry streams, not DOM/CSS replacements. The finished
// publication audit still exercises the actual runtime in Chromium. A virtual
// clock makes late layout/scroll changes and negative cases repeatable in CI.
function geometry({ scrollY = 3000, readerHeight = 5000, targetHeight = 280,
  mode = "flow", targetTop, ...overrides } = {}) {
  const readerTop = 1000 - scrollY;
  const readerBottom = readerTop + readerHeight;
  targetTop ??= Math.min(62, readerBottom - targetHeight);
  return {
    scrollY, readerHeight, readerTop, readerBottom,
    stageTop: targetTop, stageHeight: 280, stageDocumentTop: targetTop + scrollY,
    targetTop, targetBottom: targetTop + targetHeight, targetHeight,
    targetPosition: "sticky", headerBottom: 54, mode, context: "output",
    pageWidth: 412, viewportHeight: 915, maxScrollY: 6400,
    ...overrides,
  };
}

function harness(sample, scrollResult = () => undefined) {
  let time = 0;
  let scrollAt = null;
  let requestedScrollY = null;
  const scrolls = [];
  const samples = [];
  return {
    scrolls,
    samples,
    get time() { return time; },
    adapter: {
      now: () => time,
      wait: async milliseconds => { time += milliseconds; },
      scrollTo: async top => {
        scrollAt = time;
        requestedScrollY = top;
        scrolls.push({ top, time });
        return scrollResult(top);
      },
      snapshot: async () => {
        const state = { time, scrollAt, requestedScrollY,
          sinceScroll: scrollAt === null ? null : time - scrollAt };
        const result = sample(state);
        samples.push({ ...state, result });
        return result;
      },
    },
  };
}

const bounds = { timeoutMs: 1000, pollIntervalMs: 25, stableForMs: 100, stableSamples: 4 };
function checkFinal(sample) {
  // Keep the publication audit's exact three inequalities in this regression.
  assert.ok(sample.readerBottom <= sample.headerBottom + sample.stageHeight + 50);
  assert.ok(sample.targetBottom <= sample.readerBottom + 2);
  assert.ok(sample.targetTop < sample.headerBottom + 7);
}

// Resize work spans more than the old 80ms delay. The spatial target is stale
// until the flow layout settles; its height must not determine the one scroll.
const delayedResize = harness(({ time, requestedScrollY }) => {
  if (requestedScrollY !== null) return geometry({ scrollY: requestedScrollY });
  if (time < 175) {
    return geometry({ mode: "spatial", targetHeight: 419.64,
      readerHeight: 5000 + Math.floor(time / 25) * 20 });
  }
  return geometry();
});
checkFinal(await observeArticleEndRelease(delayedResize.adapter, bounds));
assert.equal(delayedResize.scrolls.length, 1);
assert.ok(delayedResize.scrolls[0].time >= 275, "settle delayed resize geometry before computing the scroll");
assert.equal(delayedResize.scrolls[0].top, 5698, "use the settled target height, not stale spatial dimensions");

// At 80ms after scrolling the target is still pinned. Only the later, stable
// release may satisfy the audit; slow legitimate release must be allowed.
const delayedRelease = harness(({ requestedScrollY, sinceScroll }) => geometry({
  scrollY: requestedScrollY ?? 3000,
  ...(sinceScroll !== null && sinceScroll < 175 ? { targetTop: 62 } : {}),
}));
checkFinal(await observeArticleEndRelease(delayedRelease.adapter, bounds));
assert.equal(delayedRelease.scrolls.length, 1);
assert.ok(delayedRelease.samples.some(item => item.sinceScroll === 100 && item.result.targetTop === 62));
assert.ok(delayedRelease.time >= delayedRelease.scrolls[0].time + 275);

// An initially passing sample must not win before an intervening layout shift.
const transientRelease = harness(({ requestedScrollY, sinceScroll }) => geometry({
  scrollY: requestedScrollY ?? 3000,
  ...(sinceScroll !== null && sinceScroll >= 50 && sinceScroll < 150 ? { targetTop: 62 } : {}),
}));
checkFinal(await observeArticleEndRelease(transientRelease.adapter, bounds));
assert.ok(transientRelease.time >= transientRelease.scrolls[0].time + 250,
  "a transient good sample cannot conceal later invalid geometry in the stable window");
assert.equal(transientRelease.scrolls.length, 1);

const slowScroll = harness(({ requestedScrollY, sinceScroll }) => geometry({
  scrollY: requestedScrollY === null ? 3000
    : sinceScroll < 150 ? requestedScrollY - 15 + sinceScroll / 10 : requestedScrollY,
}));
checkFinal(await observeArticleEndRelease(slowScroll.adapter, bounds));
assert.ok(slowScroll.time >= slowScroll.scrolls[0].time + 250,
  "wait for the requested position and a stable scroll, even if release geometry already passes");
assert.equal(slowScroll.scrolls.length, 1);

// A completed scroll can be followed by legitimate context reflow and browser
// anchoring. Observe completion once, then wait for the new stable geometry.
const anchoredReflow = harness(({ requestedScrollY, sinceScroll }) => {
  const reflowed = sinceScroll !== null && sinceScroll >= 25;
  return geometry({
    scrollY: requestedScrollY === null ? 3000 : requestedScrollY + (reflowed ? 2 : 0),
    readerHeight: reflowed ? 5001.1875 : 5000,
    context: reflowed ? "tokenizer" : "representation",
  });
});
const anchoredEnd = await observeArticleEndRelease(anchoredReflow.adapter, bounds);
checkFinal(anchoredEnd);
assert.equal(anchoredEnd.scrollY, anchoredReflow.scrolls[0].top + 2);
assert.equal(anchoredReflow.scrolls.length, 1);
assert.ok(anchoredReflow.time >= anchoredReflow.scrolls[0].time + 125,
  "anchored reflow starts a new stable window after the original scroll completes");

// A real instant-scroll callback can observe completion before the next
// snapshot. This evidence survives anchoring between those two browser calls.
const atomicReflow = harness(({ requestedScrollY }) => geometry({
  scrollY: requestedScrollY === null ? 3000 : requestedScrollY + 2,
  readerHeight: requestedScrollY === null ? 5000 : 5001.1875,
}), top => top);
const atomicEnd = await observeArticleEndRelease(atomicReflow.adapter, bounds);
checkFinal(atomicEnd);
assert.equal(atomicEnd.scrollY, atomicReflow.scrolls[0].top + 2);
assert.equal(atomicReflow.scrolls.length, 1);
assert.ok(atomicReflow.samples.filter(item => item.sinceScroll !== null)
  .every(item => item.result.scrollY !== item.requestedScrollY),
"completion was observed by the scroll callback, never by a later snapshot");

async function rejectsWithoutRescrolling(name, sample, expectedFailure, scrollResult) {
  const test = harness(sample, scrollResult);
  let diagnostic;
  await assert.rejects(observeArticleEndRelease(test.adapter, { ...bounds, label: name }), error => {
    assert.match(error.message, new RegExp(`${name}: article-end release observation timed out`));
    diagnostic = JSON.parse(error.message.slice(error.message.indexOf("; ") + 2));
    assert.equal(diagnostic.phase, "observing scroll completion and release");
    assert.equal(diagnostic.checks[expectedFailure], false);
    assert.equal(diagnostic.lastSample.context, "output");
    assert.equal(diagnostic.lastSample.pageWidth, 412);
    assert.equal(diagnostic.lastSample.viewportHeight, 915);
    assert.equal(diagnostic.requestedScrollY, test.scrolls[0].top);
    assert.ok(diagnostic.history.length > 1);
    return true;
  });
  assert.equal(test.scrolls.length, 1, `${name}: never re-scroll to make a broken model pass`);
  assert.equal(test.time, bounds.timeoutMs, `${name}: observation has a strict deadline`);
  return diagnostic;
}

// Stable-but-wrong geometry must still time out. Exercise each release
// inequality separately so neither a pinned model nor an escaped boundary
// can be accepted merely because the browser has stopped moving.
await rejectsWithoutRescrolling("permanently pinned", ({ requestedScrollY }) => geometry({
  scrollY: requestedScrollY ?? 3000,
  ...(requestedScrollY === null ? {} : { readerHeight: 5040, targetTop: 62 }),
}), "targetReleased");
await rejectsWithoutRescrolling("outside reader", ({ requestedScrollY }) => geometry({
  scrollY: requestedScrollY ?? 3000,
  ...(requestedScrollY === null ? {} : { targetTop: 25 }),
}), "targetInsideReader");
await rejectsWithoutRescrolling("reader never approaches end", ({ requestedScrollY }) => geometry({
  scrollY: requestedScrollY ?? 3000,
  ...(requestedScrollY === null ? {} : { readerHeight: 5140.14, targetTop: 22 }),
}), "readerAtEnd");

// All release inequalities are true here, but the requested scroll never
// finishes. Geometry alone must not be mistaken for scroll completion.
const unfinishedScroll = await rejectsWithoutRescrolling("unfinished scroll", ({ requestedScrollY }) => geometry({
  scrollY: requestedScrollY === null ? 3000 : requestedScrollY - 10,
}), "scrollComplete");
assert.equal(unfinishedScroll.scrollCompletion, null);
assert.equal(unfinishedScroll.immediateScrollY, null);

const wrongImmediate = await rejectsWithoutRescrolling("wrong immediate position", ({ requestedScrollY }) => geometry({
  scrollY: requestedScrollY === null ? 3000 : requestedScrollY + 2,
}), "scrollComplete", top => top - 10);
assert.equal(wrongImmediate.scrollCompletion, null);
assert.equal(wrongImmediate.immediateScrollY, wrongImmediate.expectedScrollY - 10);
assert.equal(wrongImmediate.finalScrollDrift, 2);

// Reproduce the original stale spatial-height target: scrolling completes,
// then the mode changes to flow and height/anchoring grow by ~707px. The
// reader remains too far down and the model stays pinned. Completion alone
// must never hide those failed geometry checks or cause another scroll.
const lateAnchoring = await rejectsWithoutRescrolling("late layout anchoring", ({ requestedScrollY, sinceScroll }) => {
  const flow = sinceScroll !== null && sinceScroll >= 75;
  return geometry({
    scrollY: requestedScrollY === null ? 3000 : requestedScrollY + (flow ? 707 : 0),
    readerHeight: flow ? 5707.86 : 5000,
    targetHeight: flow ? 280 : 419.64,
    mode: flow ? "flow" : "spatial",
    maxScrollY: flow ? 7107.86 : 6400,
  });
}, "readerAtEnd");
assert.equal(lateAnchoring.checks.scrollComplete, true);
assert.equal(lateAnchoring.scrollCompletion.scrollY, lateAnchoring.expectedScrollY);
assert.equal(lateAnchoring.checks.targetReleased, false);
assert.ok(Math.abs(lateAnchoring.lastSample.readerBottom - 442.5) < 0.001);

const unstable = harness(({ time }) => geometry({ readerHeight: 5000 + time / 1000 }));
await assert.rejects(observeArticleEndRelease(unstable.adapter, {
  ...bounds, geometryTolerance: 0.05,
}), /settling layout before scroll/);
assert.equal(unstable.scrolls.length, 0, "cumulative sub-pixel layout drift must not be called stable");

// The requested position is rounded by browsers and can be clamped at the
// document boundary. Both are measured, rather than guessed from timing.
const rounded = harness(({ requestedScrollY }) => geometry({
  readerHeight: 5000.4,
  scrollY: requestedScrollY === null ? 3000 : Math.round(requestedScrollY),
}));
checkFinal(await observeArticleEndRelease(rounded.adapter, bounds));
const clamped = harness(({ requestedScrollY }) => geometry({
  maxScrollY: 5690,
  scrollY: requestedScrollY === null ? 3000 : Math.min(5690, requestedScrollY),
}));
checkFinal(await observeArticleEndRelease(clamped.adapter, bounds));
assert.equal(clamped.scrolls.length, 1);

// Browser adapter calls themselves are bounded, including a missing RAF.
await assert.rejects(observeArticleEndRelease({
  snapshot: () => new Promise(() => {}),
  scrollTo: () => assert.fail("must not scroll without a valid snapshot"),
}, { timeoutMs: 20 }), /timed out.*settling layout before scroll/);

console.log("Article release observation passed: delayed resize/release, transient layout, completed scroll with stable anchored reflow, rounding/clamping, bounded diagnostics, and rejection of pinned/escaped/unreleased models, unfinished scroll, stale spatial-height targeting and cumulative drift without re-scrolling.");
