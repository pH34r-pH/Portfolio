// Keep this observer independent of Playwright so its timing contract can be
// tested with a deterministic clock and geometry samples. It scrolls once:
// retries must never move the boundary until a broken sticky model passes.
const geometryKeys = [
  "scrollY", "readerHeight", "readerTop", "readerBottom", "stageTop",
  "stageHeight", "stageDocumentTop", "targetTop", "targetBottom",
  "targetHeight", "headerBottom", "pageWidth", "viewportHeight", "maxScrollY",
];
const stateKeys = ["mode", "targetPosition", "context"];

function geometryChanges(before, after, tolerance) {
  return Object.fromEntries([
    ...geometryKeys.filter(key => Math.abs(after[key] - before[key]) > tolerance),
    ...stateKeys.filter(key => after[key] !== before[key]),
  ].map(key => [key, { before: before[key], after: after[key] }]));
}

function releaseChecks(sample, scrollCompletion) {
  return {
    scrollComplete: scrollCompletion !== null,
    readerAtEnd: sample.readerBottom <= sample.headerBottom + sample.stageHeight + 50,
    targetInsideReader: sample.targetBottom <= sample.readerBottom + 2,
    targetReleased: sample.targetTop < sample.headerBottom + 7,
  };
}

function observeScrollCompletion(state, position, source) {
  // Completion is an observed event. Later browser scroll anchoring is valid
  // when the final geometry still settles and passes every release check.
  if (state.scrollCompletion === null
    && Number.isFinite(position)
    && Math.abs(position - state.expectedScrollY) <= state.options.scrollTolerance) {
    state.scrollCompletion = { elapsedMs: state.now() - state.startedAt, scrollY: position, source };
  }
}

function validateOptions({ timeoutMs, pollIntervalMs, stableForMs, stableSamples, geometryTolerance, scrollTolerance }) {
  if (!(timeoutMs > 0 && pollIntervalMs > 0 && stableForMs > 0
    && Number.isInteger(stableSamples) && stableSamples >= 2
    && geometryTolerance >= 0 && scrollTolerance >= 0)) {
    throw new Error("Article release observation requires positive bounds and at least two stable samples");
  }

}

function validateSnapshot(sample, label) {
  for (const key of geometryKeys) {
    if (!Number.isFinite(sample[key])) {
      throw new Error(`${label}: article-end observation has invalid ${key}: ${JSON.stringify(sample)}`);
    }
  }
}

function timeout(state) {
  state.expired = true;
  const { phase, requestedScrollY, expectedScrollY, immediateScrollY, scrollCompletion, checks, stableCount, stableSince,
    lastChanges, lastSample, history, now, startedAt, options } = state;
  return new Error(`${options.label}: article-end release observation timed out after ${Math.round(now() - startedAt)}ms; ${JSON.stringify({
    phase, requestedScrollY, expectedScrollY, immediateScrollY, scrollCompletion, checks,
    finalScrollDrift: expectedScrollY === null || !lastSample ? null : lastSample.scrollY - expectedScrollY,
    stableCount, stableForMs: stableSince === null ? 0 : now() - stableSince,
    lastChanges, lastSample, history,
  })}`);
}

function updateStability(state, sample, eligible) {
  const changes = state.anchor ? geometryChanges(state.anchor, sample, state.options.geometryTolerance) : {};
  // Compare with the start of the stable window, not only the previous
  // sample: sub-pixel motion must not accumulate into unnoticed drift.
  if (!eligible || !state.anchor || Object.keys(changes).length) {
    if (Object.keys(changes).length) state.lastChanges = changes;
    state.anchor = eligible ? sample : null;
    state.stableSince = eligible ? state.now() : null;
    state.stableCount = eligible ? 1 : 0;
  } else {
    state.stableCount++;
  }
}

function recordSample(state, sample, requireRelease) {
  validateSnapshot(sample, state.options.label);
  state.lastSample = sample;
  if (requireRelease) observeScrollCompletion(state, sample.scrollY, "snapshot");
  state.checks = requireRelease ? releaseChecks(sample, state.scrollCompletion) : null;
  const eligible = !requireRelease || Object.values(state.checks).every(Boolean);
  updateStability(state, sample, eligible);
  state.history.push({ elapsedMs: state.now() - state.startedAt, phase: state.phase, sample, checks: state.checks });
  if (state.history.length > 6) state.history.shift();
  return eligible && state.stableCount >= state.options.stableSamples
    && state.now() - state.stableSince >= state.options.stableForMs;
}

async function observe(state, requireRelease) {
  state.anchor = null;
  state.stableCount = 0;
  state.stableSince = null;
  while (!state.expired && state.now() <= state.deadline) {
    const sample = await state.snapshot();
    if (state.expired || state.now() > state.deadline) throw timeout(state);
    if (recordSample(state, sample, requireRelease)) return sample;
    if (state.now() >= state.deadline) break;
    await state.wait(Math.min(state.options.pollIntervalMs, state.deadline - state.now()));
  }
  throw timeout(state);
}

async function scrollAndObserve(state) {
  const settled = await observe(state, false);
  state.requestedScrollY = settled.readerBottom + settled.scrollY
    - settled.targetHeight - settled.headerBottom - 8 + 40;
  state.expectedScrollY = Math.max(0, Math.min(settled.maxScrollY, state.requestedScrollY));
  state.phase = "observing scroll completion and release";
  // Browser adapters can read the position atomically with the instant scroll,
  // before a later context reflow anchors it away from the requested position.
  const immediate = await state.scrollTo(state.requestedScrollY);
  state.immediateScrollY = Number.isFinite(immediate) ? immediate : null;
  observeScrollCompletion(state, state.immediateScrollY, "scroll callback");
  return observe(state, true);
}

export async function observeArticleEndRelease(adapter, options = {}) {
  options = {
    label: "article", timeoutMs: 5000, pollIntervalMs: 25, stableForMs: 100,
    stableSamples: 4, geometryTolerance: 0.25, scrollTolerance: 1,
    ...options,
  };
  validateOptions(options);
  const state = {
    now: () => performance.now(),
    wait: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    ...adapter,
    options, history: [], phase: "settling layout before scroll",
    requestedScrollY: null, expectedScrollY: null, immediateScrollY: null, scrollCompletion: null, checks: null,
    lastChanges: {}, lastSample: null, expired: false, stableCount: 0, stableSince: null,
  };
  state.startedAt = state.now();
  state.deadline = state.startedAt + options.timeoutMs;

  // A wall-clock guard also bounds a stalled browser snapshot/scroll callback.
  // The injected clock below controls normal polling and deterministic tests.
  let timer;
  try {
    return await Promise.race([
      scrollAndObserve(state),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(timeout(state)), options.timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
