#!/usr/bin/env node
/**
 * Shared E2E event parsing and invariant checking for stress and replay tests.
 *
 * Exports:
 *   - parseEvents(rawLog) → { events, lines }
 *   - checkInvariants(events, lines) → { checks, anyFailed }
 */

/**
 * Parse [e2e] JSON events from raw log text.
 * Returns both parsed events and original lines for timestamp matching.
 */
export function parseEvents(rawLog) {
  const lines = rawLog.split("\n");
  const events = [];

  for (const line of lines) {
    const idx = line.indexOf("[e2e]");
    if (idx === -1) continue;

    // Extract ISO timestamp (first ~30 chars before [e2e])
    const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
    const timestamp = tsMatch ? new Date(tsMatch[1]) : null;

    const jsonPart = line.slice(idx + "[e2e]".length).trim();
    try {
      const evt = JSON.parse(jsonPart);
      evt._timestamp = timestamp;
      evt._line = line;
      events.push(evt);
    } catch {
      /* skip malformed */
    }
  }

  return { events, lines };
}

/**
 * Check all invariants. Returns { checks: [...], anyFailed: bool }
 * Each check has { name, ok, reason?, ... diagnostic info ... }
 */
export function checkInvariants(events, lines) {
  const checks = [];

  // I1: pause delivered within 1500ms or overridden by replay_start or log ends
  checks.push(checkI1PauseDelivered(events));

  // I1b: pause_failed events are always failures
  checks.push(checkI1bPauseFailed(events));

  // I2: gen monotonic
  checks.push(checkI2GenMonotonic(events));

  // I3: no zombie ticks
  checks.push(checkI3NoZombieTicks(events));

  // I4: no ticks after stop
  checks.push(checkI4NoTicksAfterStop(events));

  // I5: no degenerate duration
  checks.push(checkI5NoDegenerateDuration(events));

  // I6: liveness
  checks.push(checkI6Liveness(events));

  // I7: no errors
  checks.push(checkI7NoErrors(events));

  const anyFailed = checks.some((c) => !c.ok);

  return { checks, anyFailed };
}

// --- Invariant implementations ---

function checkI1PauseDelivered(events) {
  // For each watcher_stop: within 1500ms (by timestamp), one of:
  // (a) player_state:"paused" is seen
  // (b) new replay_start is seen (user interrupted)
  // (c) log ends before 1500ms window (tail case — no judgment)
  // pause_retry is warning only. Unknown events ignored.

  const stops = events.filter((e) => e.event === "watcher_stop");
  if (stops.length === 0) return { ok: true, name: "I1 pause-delivered" };

  let pauseRetryCount = 0;

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (!stop._timestamp) continue; // skip if no timestamp

    const stopTime = stop._timestamp.getTime();
    const windowEnd = stopTime + 1500;

    const stopIdx = events.indexOf(stop);

    // Look for pause/replay or window exhaustion
    let foundPaused = false;
    let foundNewReplay = false;
    let lastEventTime = stopTime; // Track latest event timestamp seen

    for (let j = stopIdx + 1; j < events.length; j++) {
      const evt = events[j];
      if (!evt._timestamp) continue;

      const evtTime = evt._timestamp.getTime();
      lastEventTime = evtTime;

      // If we see an event past the window, window is closed (we had time to deliver)
      if (evtTime > windowEnd) {
        // Window is exhausted - but we didn't find pause or replay before hitting this event
        break;
      }

      if (evt.event === "player_state" && evt.state === "paused") {
        foundPaused = true;
        break;
      }

      if (evt.event === "replay_start") {
        foundNewReplay = true;
        break;
      }

      if (evt.event === "pause_retry") {
        pauseRetryCount++;
        // Continue searching, don't stop
      }

      // Ignore unknown events (btn, chunk_change, pause_at, replay_rejected, etc.)
    }

    // Check result:
    // - If we found pause or replay, pass
    // - If log ended before window expired (lastEventTime < windowEnd), it's tail case (pass)
    // - Otherwise, we had time but didn't deliver (fail)
    const logTailCase = lastEventTime < windowEnd;

    if (!foundPaused && !foundNewReplay && !logTailCase) {
      return {
        ok: false,
        name: "I1 pause-delivered",
        reason: `watcher_stop #${i} (idx ${stopIdx}) has no player_state:"paused" or replay_start within 1500ms`,
        stopEvent: stop,
      };
    }
  }

  return {
    ok: true,
    name: "I1 pause-delivered",
    pauseRetryCount,
  };
}

function checkI1bPauseFailed(events) {
  // pause_failed events are always failures
  const pauseFailed = events.filter((e) => e.event === "pause_failed");

  if (pauseFailed.length > 0) {
    return {
      ok: false,
      name: "I1b pause-failed-events",
      reason: `${pauseFailed.length} pause_failed events detected`,
      firstEvent: pauseFailed[0],
    };
  }

  return { ok: true, name: "I1b pause-failed-events" };
}

function checkI2GenMonotonic(events) {
  const replays = events.filter((e) => e.event === "replay_start");
  for (let i = 1; i < replays.length; i++) {
    if (replays[i].gen <= replays[i - 1].gen) {
      return {
        ok: false,
        name: "I2 gen-monotonic",
        reason: `gen not strictly increasing: ${replays[i - 1].gen} >= ${replays[i].gen}`,
        prev: replays[i - 1],
        curr: replays[i],
      };
    }
  }
  return { ok: true, name: "I2 gen-monotonic" };
}

function checkI3NoZombieTicks(events) {
  const replays = events.filter((e) => e.event === "replay_start");
  if (replays.length === 0) return { ok: true, name: "I3 no-zombie-ticks" };

  const ticks = events.filter((e) => e.event === "watcher_tick");
  for (const tick of ticks) {
    const prevReplay = replays.filter((r) => r.gen <= tick.gen).pop();
    if (!prevReplay || tick.gen < prevReplay.gen) {
      return {
        ok: false,
        name: "I3 no-zombie-ticks",
        reason: `watcher_tick gen=${tick.gen} less than preceding replay_start`,
        tick,
      };
    }
  }
  return { ok: true, name: "I3 no-zombie-ticks" };
}

function checkI4NoTicksAfterStop(events) {
  const stops = events.filter((e) => e.event === "watcher_stop");
  for (const stop of stops) {
    const stopIdx = events.indexOf(stop);
    const nextReplayIdx = events.findIndex(
      (e, idx) => idx > stopIdx && e.event === "replay_start",
    );
    const endIdx = nextReplayIdx === -1 ? events.length : nextReplayIdx;

    const ticksAfter = events
      .slice(stopIdx + 1, endIdx)
      .filter((e) => e.event === "watcher_tick" && e.gen === stop.gen);

    if (ticksAfter.length > 0) {
      return {
        ok: false,
        name: "I4 no-ticks-after-stop",
        reason: `watcher_tick after watcher_stop for gen=${stop.gen}`,
        stop,
        firstTick: ticksAfter[0],
      };
    }
  }
  return { ok: true, name: "I4 no-ticks-after-stop" };
}

function checkI5NoDegenerateDuration(events) {
  const starts = events.filter((e) => e.event === "watcher_start");
  for (const start of starts) {
    if (start.durationMs < 1200) {
      return {
        ok: false,
        name: "I5 no-degenerate",
        reason: `watcher_start durationMs=${start.durationMs} < 1200`,
        event: start,
      };
    }
  }
  return { ok: true, name: "I5 no-degenerate" };
}

function checkI6Liveness(events) {
  const lastReplay = events
    .filter((e) => e.event === "replay_start")
    .pop();
  if (!lastReplay) {
    return {
      ok: false,
      name: "I6 liveness",
      reason: "no replay_start events",
    };
  }

  const gen = lastReplay.gen;
  const start = events.find(
    (e) => e.event === "watcher_start" && e.gen === gen,
  );
  const stop = events.find((e) => e.event === "watcher_stop" && e.gen === gen);

  if (!start || !stop) {
    return {
      ok: false,
      name: "I6 liveness",
      reason: `final replay_start gen=${gen} missing start/stop`,
      hasStart: !!start,
      hasStop: !!stop,
    };
  }

  const stopIdx = events.indexOf(stop);
  const afterStop = events
    .slice(stopIdx + 1)
    .filter((e) => e.event === "player_state" && e.state === "playing");

  if (afterStop.length > 0) {
    return {
      ok: false,
      name: "I6 liveness",
      reason: `player_state:"playing" after final watcher_stop`,
      event: afterStop[0],
    };
  }

  return { ok: true, name: "I6 liveness" };
}

function checkI7NoErrors(events) {
  const errors = events.filter((e) => e.event === "player_error");
  if (errors.length > 0) {
    return {
      ok: false,
      name: "I7 no-errors",
      reason: `${errors.length} player_error events`,
      firstError: errors[0],
    };
  }

  return { ok: true, name: "I7 no-errors" };
}
