# Replay clock qualification

The replay clock establishes its timestamp on the first native animation
callback. Only a subsequent callback with sufficient elapsed time can advance
the deterministic 60fps frame table. A fixed 180ms audit sleep incorrectly
assumed both callbacks would already have arrived.

Read-only tracing of reviewed head `4b26c5f` showed a visible, foregrounded,
initialized renderer with a 588ms gap between the first two clock callbacks;
the callback work itself took about 7ms. The state-based audit observed the
first actual desktop frame change after 367ms. This demonstrates the scheduling
exposure without changing the renderer or replay behavior. The original hosted
failure did not retain clock telemetry, so its precise callback timeline cannot
be reconstructed from that artifact.

The repaired audit waits up to five seconds for observed eligibility, then
subscribes to the model host's `data-replay-frame` mutations before clicking
Play. It requires an actual frame change, native clock callbacks and a frame
advance bounded by the elapsed 60fps clock. A stalled clock, unavailable
visibility signal or non-advancing renderer still fails with its current state.

Offscreen qualification first observes `visible=false` and `scheduled=false`,
then proves the frame remains unchanged across two browser animation-frame
opportunities. Re-entry must cause an actual new replay frame. Document-hidden
qualification additionally bounds resume by the measured foreground interval,
so hidden time cannot become a catch-up jump.

A controlled browser scheduling fixture holds only the model's native animation
callback, verifies that visible/playing/scheduled state can coexist with frame
70 and no delivered ticks, then releases it. At least two genuine browser clock
callbacks and an observed frame change are required. It never sets a replay
frame to manufacture progress. The read-only `machine.clock()` diagnostic
reports scheduler state; it is UI telemetry, not a scientific measurement.
