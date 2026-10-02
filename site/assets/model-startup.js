export const IGNITION_DURATION_MS = 1800;
export const STARTUP_STATE_KEY = "portfolio.home-model-startup.v1";
export const STARTUP_SCHEMA_VERSION = 1;

const QUIET_QUERIES = ["(prefers-reduced-motion:reduce)", "(forced-colors:active)"];
const clock = () => performance.now();

function emptyState(topologyVersion, styleVersion) {
  return {
    schemaVersion: STARTUP_SCHEMA_VERSION,
    started: false,
    ignitionComplete: false,
    elapsedActiveMs: 0,
    topologyVersion,
    styleVersion,
  };
}

function readState(topologyVersion, styleVersion) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STARTUP_STATE_KEY));
    if (saved?.schemaVersion !== STARTUP_SCHEMA_VERSION
      || typeof saved.started !== "boolean"
      || typeof saved.ignitionComplete !== "boolean"
      || !Number.isFinite(saved.elapsedActiveMs)
      || saved.elapsedActiveMs < 0
      || saved.elapsedActiveMs > IGNITION_DURATION_MS
      || saved.topologyVersion !== topologyVersion
      || saved.styleVersion !== styleVersion
      || (saved.ignitionComplete && !saved.started)) {
      return emptyState(topologyVersion, styleVersion);
    }
    return {
      schemaVersion: STARTUP_SCHEMA_VERSION,
      started: saved.started,
      ignitionComplete: saved.ignitionComplete,
      elapsedActiveMs: saved.ignitionComplete ? IGNITION_DURATION_MS : saved.elapsedActiveMs,
      topologyVersion,
      styleVersion,
    };
  } catch {
    return emptyState(topologyVersion, styleVersion);
  }
}

const quietPreference = () => QUIET_QUERIES.some(query => matchMedia(query).matches);

export class ModelStartup {
  constructor(root) {
    this.root = root;
    this.status = root.querySelector("[data-model-boot]");
    this.button = root.querySelector("[data-model-start]");
    this.topologyVersion = root.dataset.topologyVersion || "unit_hypersphere_depth3";
    this.styleVersion = root.dataset.styleVersion || "leaf01-blue-horizontal-native-resolution";
    this.state = readState(this.topologyVersion, this.styleVersion);
    this.phase = quietPreference() ? "quiet" : this.state.started ? "booting" : "idle";
    this.quiet = this.phase === "quiet";
    this.terminal = false;
    this.scene = null;
    this.failure = null;
    this.raf = 0;
    this.deadline = 0;
    this.deadlineAt = 0;
    this.elapsedActiveMs = this.state.elapsedActiveMs;
    this.lastTime = null;
    this.lastPersistedElapsedMs = this.elapsedActiveMs;
    this.handoffs = 0;
    this.completions = 0;
    this.startedAt = null;
    this.preparedAt = null;
    this.firstFrame = null;
    this.startPromise = null;
    this.abort = new AbortController();
    const options = { signal: this.abort.signal, passive: true };

    for (const type of ["scroll", "resize"]) addEventListener(type, () => this.schedule(), options);
    document.addEventListener("visibilitychange", () => this.visibilityChanged(), options);
    for (const query of QUIET_QUERIES) {
      matchMedia(query).addEventListener("change", () => this.refreshQuietMode(), options);
    }
    this.button?.addEventListener("click", () => this.start(), { signal: this.abort.signal });
    this.setPhase(this.phase, this.initialStatus());
    this.persist();
  }

  get started() { return this.state.started; }
  get ignitionComplete() { return this.state.ignitionComplete; }

  initialStatus() {
    if (this.quiet) return "Static architecture display";
    if (this.state.started) return this.state.ignitionComplete
      ? "Restoring the started architecture display"
      : "Resuming architecture startup";
    return "Static architecture display · Start when ready";
  }

  setPhase(phase, text) {
    this.phase = phase;
    this.root.dataset.startup = phase;
    if (this.status && this.status.textContent !== text) this.status.textContent = text;
    if (!this.button) return;
    const canStart = !this.terminal && !this.quiet && ["idle", "fallback"].includes(phase);
    this.button.hidden = !canStart;
    this.button.textContent = this.state.started ? "Retry interactive model" : "Start interactive model";
  }

  persist() {
    if (this.terminal) return;
    this.state.schemaVersion = STARTUP_SCHEMA_VERSION;
    this.state.started = Boolean(this.state.started);
    this.state.ignitionComplete = Boolean(this.state.ignitionComplete);
    this.state.elapsedActiveMs = Math.min(IGNITION_DURATION_MS, Math.max(0, this.elapsedActiveMs));
    this.state.topologyVersion = this.topologyVersion;
    this.state.styleVersion = this.styleVersion;
    try { sessionStorage.setItem(STARTUP_STATE_KEY, JSON.stringify(this.state)); } catch { /* Private browsing can disable session storage. */ }
  }

  start({ retained = false } = {}) {
    if (this.terminal || this.quiet) return Promise.resolve(null);
    if (this.phase === "ready") return Promise.resolve(this.scene);
    if (this.startPromise) return this.startPromise;

    this.failure = null;
    this.state.started = true;
    this.startedAt = clock();
    this.setPhase("booting", retained ? "Resuming the interactive architecture" : "Loading the interactive architecture");
    this.persist();
    this.beginDeadline();

    const attempt = Promise.resolve().then(() => this.onStart?.({ retained })).catch(error => {
      if (!this.terminal && !this.quiet) this.fail("startup-request-failed");
      return null;
    });
    this.startPromise = attempt.finally(() => {
      if (this.startPromise === pending) this.startPromise = null;
    });
    const pending = this.startPromise;
    return pending;
  }

  beginDeadline(remaining = 15000) {
    clearTimeout(this.deadline);
    this.deadlineAt = clock() + remaining;
    this.deadline = setTimeout(() => this.fail("startup-timeout"), remaining);
  }

  fail(reason) {
    if (this.terminal || this.quiet) return;
    this.stop();
    this.failure = reason;
    this.persist();
    this.setPhase("fallback", "Interactive model unavailable · Static architecture remains available");
    this.onFailure?.(reason);
  }

  stop() {
    clearTimeout(this.deadline);
    this.deadline = 0;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastTime = null;
  }

  suspend() {
    if (this.terminal) return;
    this.persist();
    this.stop();
  }

  resumeFromBFCache() {
    if (this.terminal || this.quiet || !this.state.started || this.phase === "ready") return;
    const remaining = Math.max(0, this.deadlineAt - clock());
    if (this.deadlineAt && remaining === 0) {
      this.fail("startup-timeout");
      return;
    }
    if (this.scene && !this.scene.disposed) {
      if (this.deadlineAt) this.beginDeadline(remaining);
      this.schedule();
    } else {
      this.start({ retained: true });
    }
  }

  terminalDispose() {
    if (this.terminal) return;
    this.persist();
    this.terminal = true;
    this.stop();
    this.abort.abort();
    this.scene = null;
  }

  refreshQuietMode() {
    const quiet = quietPreference();
    if (quiet === this.quiet || this.terminal) return;
    this.quiet = quiet;
    if (quiet) {
      this.suspend();
      this.setPhase("quiet", "Static architecture display");
      this.onQuietChange?.(true);
      return;
    }
    this.failure = null;
    this.setPhase(this.state.started ? "booting" : "idle", this.state.started
      ? "Resuming the interactive architecture" : "Static architecture display · Start when ready");
    this.onQuietChange?.(false);
  }

  visibilityChanged() {
    if (document.hidden) {
      this.lastTime = null;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.persist();
      return;
    }
    this.schedule();
  }

  canPrepare() {
    return !this.terminal && !this.quiet && this.state.started
      && !["fallback", "idle", "quiet"].includes(this.phase);
  }

  async accept(scene) {
    if (!this.canPrepare() || !this.root.isConnected || scene.disposed) return false;
    this.scene = scene;
    await scene.prepare();
    if (!this.canPrepare() || !this.root.isConnected || scene.disposed || this.scene !== scene) return false;
    scene.resize();
    scene.setPower(0, true);
    this.firstFrame = scene.powerView();
    this.preparedAt = clock();
    clearTimeout(this.deadline);
    this.deadline = 0;
    this.setPhase("prepared", "Architecture display ready");
    this.schedule();
    return true;
  }

  onScreen() {
    if (!this.scene?.canvas?.isConnected) return false;
    const bounds = this.scene.canvas.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth;
  }

  schedule() {
    if (this.raf || this.terminal || this.quiet || document.hidden
      || !["prepared", "handoff", "igniting"].includes(this.phase)) return;
    if (this.phase !== "prepared" && !this.onScreen()) {
      this.lastTime = null;
      return;
    }
    this.raf = requestAnimationFrame(time => this.advanceStartup(time));
  }

  advanceStartup(time) {
    this.raf = 0;
    if (this.terminal || this.quiet || document.hidden) {
      this.lastTime = null;
      return;
    }
    if (this.phase !== "prepared" && !this.onScreen()) {
      this.lastTime = null;
      this.persist();
      return;
    }
    if (!this.scene || this.scene.disposed || !this.root.isConnected) {
      this.fail("startup-root-disposed");
      return;
    }
    if (this.phase === "prepared") {
      this.scene.resize();
      this.scene.setPower(0, true);
      this.firstFrame = this.scene.powerView();
      this.handoffs++;
      this.setPhase("handoff", "Architecture display ready");
      this.onHandoff?.();
    } else if (this.phase === "handoff") {
      if (this.state.ignitionComplete) {
        this.scene.finishPower();
        this.setPhase("ready", "Interactive architecture ready");
        this.stop();
        this.persist();
        return;
      }
      this.lastTime = time;
      this.scene.setPower(this.elapsedActiveMs / IGNITION_DURATION_MS);
      this.setPhase("igniting", "Starting architecture display");
    } else {
      this.elapsedActiveMs = Math.min(
        IGNITION_DURATION_MS,
        this.elapsedActiveMs + Math.max(0, time - (this.lastTime ?? time)),
      );
      this.lastTime = time;
      this.scene.setPower(this.elapsedActiveMs / IGNITION_DURATION_MS);
      if (this.elapsedActiveMs - this.lastPersistedElapsedMs >= 100) {
        this.lastPersistedElapsedMs = this.elapsedActiveMs;
        this.persist();
      }
      if (this.elapsedActiveMs >= IGNITION_DURATION_MS) {
        this.state.ignitionComplete = true;
        this.elapsedActiveMs = IGNITION_DURATION_MS;
        this.scene.finishPower();
        this.completions++;
        this.persist();
        this.setPhase("ready", "Interactive architecture ready");
        this.stop();
        return;
      }
    }
    this.schedule();
  }

  snapshot() {
    return {
      phase: this.phase,
      started: this.state.started,
      ignitionComplete: this.state.ignitionComplete,
      elapsedActiveMs: this.elapsedActiveMs,
      topologyVersion: this.state.topologyVersion,
      styleVersion: this.state.styleVersion,
      handoffs: this.handoffs,
      completions: this.completions,
      elapsed: this.elapsedActiveMs,
      scheduled: Boolean(this.raf),
      failure: this.failure,
      firstFrame: this.firstFrame,
      loadMs: this.preparedAt && this.startedAt ? this.preparedAt - this.startedAt : null,
      durationMs: IGNITION_DURATION_MS,
      theatrical: false,
    };
  }
}
