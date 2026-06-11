#!/usr/bin/env node
/**
 * Log-driven E2E: pause-on-end через proxy /log/tail.
 *
 * Usage:
 *   node scripts/e2e-pause.mjs              # ждёт replay (manual или auto на dev route)
 *   node scripts/e2e-pause.mjs --auto-open  # adb → /dev/pause-test
 *   node scripts/e2e-pause.mjs --maestro    # maestro flow + assert
 *
 * Env:
 *   PROXY_URL=http://localhost:8787
 *   METRO_HOST=10.0.2.2:8081
 *   E2E_TIMEOUT_MS=45000
 */
import { spawn, execSync } from "child_process";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function getLanIp() {
  try {
    for (const list of Object.values(os.networkInterfaces())) {
      if (!list) continue;
      for (const net of list) {
        if (net.family === "IPv4" && !net.internal) return net.address;
      }
    }
  } catch {
    /* ignore */
  }
  return "10.0.2.2";
}

const PROXY_URL = process.env.PROXY_URL ?? "http://localhost:8787";
/** Metro host как у `expo start --android` (LAN IP, не 10.0.2.2). */
const METRO_HOST = process.env.METRO_HOST ?? `${getLanIp()}:8081`;
const POLL_MS = 500;
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 45_000);

// Синхронно с pauseTestFixtures.ts — первый чанк 0–5s, trim 250ms
const CHUNK_START = 0;
const END_SEC = 4.75;
const DURATION_MS = Math.max((END_SEC - CHUNK_START) * 1000, 300);
const EXPECT_MIN_MS = DURATION_MS - 800;
const EXPECT_MAX_MS = DURATION_MS + 2500;

const args = process.argv.slice(2);
const autoOpen = args.includes("--auto-open");
const maestro = args.includes("--maestro");
const assertOnly = args.includes("--assert-only");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clearLog() {
  const res = await fetch(`${PROXY_URL}/log`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    throw new Error(`DELETE /log failed: ${res.status}`);
  }
}

async function fetchTail(n = 400) {
  const res = await fetch(`${PROXY_URL}/log/tail?n=${n}`);
  if (!res.ok) throw new Error(`GET /log/tail failed: ${res.status}`);
  return res.text();
}

function hasAnyMobileLog(tail) {
  return tail.includes("[mobile]") || tail.includes("[e2e]") || tail.includes("[devLog]");
}

async function preflight() {
  const errors = [];

  try {
    const r = await fetch(`${PROXY_URL}/`);
    if (!r.ok) errors.push(`proxy HTTP ${r.status}`);
  } catch {
    errors.push("proxy не отвечает → pnpm proxy:dev");
  }

  try {
    const r = await fetch(`http://127.0.0.1:8081/status`);
    if (!r.ok) errors.push(`Metro HTTP ${r.status}`);
  } catch {
    errors.push(
      "Metro не запущен → EXPO_PUBLIC_PROXY_URL=http://10.0.2.2:8787 pnpm mobile:android",
    );
  }

  try {
    const out = execSync("adb devices", { encoding: "utf8" });
    const lines = out.trim().split("\n").slice(1).filter((l) => l.includes("device"));
    if (lines.length === 0) {
      errors.push("adb: нет устройства → pnpm emulator");
    }
  } catch {
    errors.push("adb не найден → brew install --cask android-platform-tools");
  }

  if (errors.length) {
    console.error("Preflight FAIL:");
    for (const e of errors) console.error("  •", e);
    process.exit(1);
  }
  console.log("Preflight OK (proxy + Metro + adb)");
}

/** Tap Replay (~центр нижней панели Pixel 6 1080x2400). */
function tapReplay() {
  console.log("Fallback: adb tap Replay…");
  return new Promise((resolve, reject) => {
    const c = spawn("adb", ["shell", "input", "tap", "540", "2250"], {
      stdio: "inherit",
    });
    c.on("error", reject);
    c.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tap ${code}`))));
  });
}

/** @returns {Array<Record<string, unknown>>} */
function parseE2eEvents(tail) {
  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  for (const line of tail.split("\n")) {
    const idx = line.indexOf("[e2e]");
    if (idx === -1) continue;
    const jsonPart = line.slice(idx + "[e2e]".length).trim();
    try {
      events.push(JSON.parse(jsonPart));
    } catch {
      /* skip malformed */
    }
  }
  return events;
}

function openDevRoute() {
  const run = Date.now();
  const url = `exp://${METRO_HOST}/--/dev/pause-test?run=${run}`;
  console.log(`Opening ${url} via adb…`);
  return new Promise((resolve, reject) => {
    const child = spawn(
      "adb",
      [
        "shell",
        "am",
        "start",
        "-S", // force-stop Expo Go → свежий mount dev/pause-test
        "-W",
        "-a",
        "android.intent.action.VIEW",
        "-d",
        url,
      ],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`adb exit ${code}`));
    });
  });
}

function runMaestro() {
  const flow = path.join(ROOT, ".maestro/pause-on-end.yaml");
  console.log(`Running maestro test ${flow}…`);
  return new Promise((resolve, reject) => {
    const child = spawn("maestro", ["test", flow], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, METRO_HOST },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`maestro exit ${code}`));
    });
  });
}

/**
 * @param {Array<Record<string, unknown>>} events
 */
function findBestStop(events) {
  const stops = events.filter((e) => e.event === "watcher_stop");
  if (stops.length === 0) return null;
  return /** @type {Record<string, unknown>} */ (stops[stops.length - 1]);
}

/**
 * @param {number} stopElapsed
 * @param {Array<Record<string, unknown>>} allEvents
 */
function ticksAfterStop(stopElapsed, allEvents) {
  return allEvents.filter(
    (e) =>
      e.event === "watcher_tick" &&
      typeof e.elapsed === "number" &&
      e.elapsed > stopElapsed + 100,
  );
}

/**
 * Returns player_state:"playing" events that appear after the last watcher_stop
 * in log order (by array index, since events arrive in time order).
 * @param {Array<Record<string, unknown>>} allEvents
 */
function playingAfterStop(allEvents) {
  const lastStopIdx = allEvents.reduce(
    (acc, e, i) => (e.event === "watcher_stop" ? i : acc),
    -1,
  );
  if (lastStopIdx === -1) return [];
  return allEvents
    .slice(lastStopIdx + 1)
    .filter((e) => e.event === "player_state" && e.state === "playing");
}

async function waitForPass() {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastTail = "";

  while (Date.now() < deadline) {
    lastTail = await fetchTail();
    const events = parseE2eEvents(lastTail);
    const stop = findBestStop(events);

    if (stop && typeof stop.elapsed === "number") {
      const elapsed = stop.elapsed;
      if (elapsed >= EXPECT_MIN_MS && elapsed <= EXPECT_MAX_MS) {
        await sleep(2000);
        const tailAfter = await fetchTail();
        const afterEvents = parseE2eEvents(tailAfter);
        const extraTicks = ticksAfterStop(elapsed, afterEvents);
        const playingAfter = playingAfterStop(afterEvents);
        if (extraTicks.length === 0 && playingAfter.length === 0) {
          return { ok: true, stop, elapsed };
        }
        if (playingAfter.length > 0) {
          return {
            ok: false,
            reason: `player_state:"playing" after watcher_stop (${playingAfter.length})`,
            stop,
            tail: tailAfter,
          };
        }
        return {
          ok: false,
          reason: `watcher_tick after stop (${extraTicks.length})`,
          stop,
          tail: tailAfter,
        };
      }
    }

    await sleep(POLL_MS);
  }

  const events = parseE2eEvents(lastTail);
  const stop = findBestStop(events);
  if (stop) {
    return {
      ok: false,
      reason: `watcher_stop elapsed ${stop.elapsed} outside [${EXPECT_MIN_MS}, ${EXPECT_MAX_MS}]`,
      stop,
      tail: lastTail,
    };
  }
  return {
    ok: false,
    reason: "no watcher_stop within timeout",
    tail: lastTail,
  };
}

async function main() {
  console.log(`Proxy: ${PROXY_URL}`);
  console.log(`Metro: exp://${METRO_HOST}`);
  console.log(
    `Expected pause window: ${EXPECT_MIN_MS}–${EXPECT_MAX_MS} ms (duration ${DURATION_MS} ms)`,
  );

  await preflight();

  await clearLog();
  console.log("Cleared dev log (DELETE /log)");

  if (maestro) {
    await runMaestro();
  } else if (autoOpen) {
    try {
      await openDevRoute();
      await sleep(15000);
      let tail = await fetchTail();
      if (!hasAnyMobileLog(tail)) {
        console.warn("Логов пока нет, ждём ещё 15s (cold start Expo Go)…");
        await sleep(15000);
        tail = await fetchTail();
      }
      if (!hasAnyMobileLog(tail)) {
        console.error("");
        console.error("⚠ Логи с эмулятора НЕ доходят до proxy (tail пустой).");
        console.error("  Частая причина: Metro запущен БЕЗ EXPO_PUBLIC_PROXY_URL=http://10.0.2.2:8787");
        console.error("  Исправление:");
        console.error("    1. Остановите Metro (Ctrl+C)");
        console.error("    2. EXPO_PUBLIC_PROXY_URL=http://10.0.2.2:8787 pnpm mobile:android");
        console.error("    3. На экране dev/pause-test баннер должен показать proxy: http://10.0.2.2:8787");
        console.error("");
        try {
          await tapReplay();
          await sleep(5000);
          tail = await fetchTail();
        } catch {
          /* ignore */
        }
        if (!hasAnyMobileLog(tail)) {
          process.exit(1);
        }
      }
    } catch (e) {
      console.warn("adb open failed:", e.message);
      console.warn("Откройте в Expo Go: exp://" + METRO_HOST + "/--/dev/pause-test");
    }
  } else if (!assertOnly) {
    console.log(
      "Waiting for replay (open /dev/pause-test or tap Replay on session)…",
    );
  }

  const result = await waitForPass();

  if (result.ok) {
    console.log("PASS: watcher_stop in expected window", {
      elapsed: result.elapsed,
      stop: result.stop,
    });
    process.exit(0);
  }

  console.error("FAIL:", result.reason);
  if (result.stop) console.error("Last stop:", result.stop);
  console.error("--- log tail ---");
  console.error(result.tail ?? "");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
