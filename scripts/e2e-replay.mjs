#!/usr/bin/env node
/**
 * E2E Replay: replay recorded user button clicks with timestamp-based relative delays.
 *
 * Usage:
 *   node scripts/e2e-replay.mjs [--file=path] [--videoId=vif8NQcjVf0] [--speed=1]
 *
 * If --file is not provided, downloads current /log/tail?n=5000 from proxy.
 * Extracts btn events (replay, next, prev) with timestamps.
 * Saves journal to /tmp/shadowtube-replay-journal.json.
 * Opens dev route deep link, waits for player_ready, finds buttons via UIAutomator.
 * Replays actions with relative timing divided by --speed (capped at 5000ms).
 * After replay, fetches fresh logs and validates against invariants.
 * Exits 0/1 by invariant results, 2 if no btn events found.
 */
import { spawn, execSync } from "child_process";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { parseEvents, checkInvariants } from "./e2e-invariants.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// === Argument parsing ===
const args = process.argv.slice(2);
let filePath = null;
let videoId = "vif8NQcjVf0";
let speed = 1;

for (const arg of args) {
  if (arg.startsWith("--file=")) filePath = arg.slice(7);
  if (arg.startsWith("--videoId=")) videoId = arg.slice(10);
  if (arg.startsWith("--speed=")) speed = parseFloat(arg.slice(8));
}

console.log(
  `[e2e-replay] videoId=${videoId} speed=${speed}${filePath ? ` file=${filePath}` : " (will fetch from proxy)"}`,
);

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
const METRO_HOST = process.env.METRO_HOST ?? `${getLanIp()}:8081`;
const POLL_MS = 500;
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 60_000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clearLog() {
  const res = await fetch(`${PROXY_URL}/log`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    throw new Error(`DELETE /log failed: ${res.status}`);
  }
}

async function fetchTail(n = 5000) {
  const res = await fetch(`${PROXY_URL}/log/tail?n=${n}`);
  if (!res.ok) throw new Error(`GET /log/tail failed: ${res.status}`);
  return res.text();
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

function extractButtonCenters(xmlContent) {
  const buttons = {};
  const labels = [
    { label: "prev", contentDesc: "⏮ Prev" },
    { label: "replay", contentDesc: "Replay" },
    { label: "next", contentDesc: "Next ⏭" },
  ];

  for (const { label, contentDesc } of labels) {
    const regex = new RegExp(
      `content-desc="${contentDesc}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
    );
    const match = xmlContent.match(regex);
    if (match) {
      const [, x1, y1, x2, y2] = match;
      const cx = Math.round((parseInt(x1) + parseInt(x2)) / 2);
      const cy = Math.round((parseInt(y1) + parseInt(y2)) / 2);
      buttons[label] = { x: cx, y: cy };
    }
  }

  return buttons;
}

async function findButtons() {
  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    try {
      execSync("adb shell uiautomator dump /sdcard/ui.xml", {
        stdio: "pipe",
      });
      execSync("adb pull /sdcard/ui.xml /tmp/st-ui.xml", { stdio: "pipe" });
      const xml = fs.readFileSync("/tmp/st-ui.xml", "utf8");
      const buttons = extractButtonCenters(xml);
      if (buttons.prev && buttons.replay && buttons.next) {
        console.log("Found buttons:", buttons);
        return buttons;
      }
    } catch {
      /* ignore */
    }
    if (attempts < 3) await sleep(2000);
  }
  console.error("FAIL: could not find buttons (Prev/Replay/Next)");
  process.exit(2);
}

function openDevRoute() {
  const run = Date.now();
  const url = `exp://${METRO_HOST}/--/dev/pause-test?videoId=${videoId}&run=${run}`;
  console.log(`Opening ${url} via adb…`);
  return new Promise((resolve, reject) => {
    const child = spawn(
      "adb",
      [
        "shell",
        "am",
        "start",
        "-S",
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

async function waitForPlayerReady() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const tail = await fetchTail(200);
      if (tail.includes("[e2e]") && tail.includes("player_ready")) {
        return true;
      }
    } catch {
      /* ignore */
    }
    await sleep(POLL_MS);
  }
  throw new Error("player_ready timeout");
}

function tapButton(x, y) {
  return new Promise((resolve, reject) => {
    const c = spawn("adb", ["shell", "input", "tap", String(x), String(y)], {
      stdio: "pipe",
    });
    c.on("error", reject);
    c.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tap ${code}`))));
  });
}

/**
 * Extract btn events (replay, next, prev) from raw log with timestamps.
 * Returns array of { btn, timestamp, delayMs (from previous) }
 */
function extractButtonEvents(rawLog) {
  const lines = rawLog.split("\n");
  const btnEvents = [];
  let lastTimestamp = null;

  for (const line of lines) {
    const idx = line.indexOf("[e2e]");
    if (idx === -1) continue;

    // Extract ISO timestamp
    const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
    const timestamp = tsMatch ? new Date(tsMatch[1]) : null;

    const jsonPart = line.slice(idx + "[e2e]".length).trim();
    try {
      const evt = JSON.parse(jsonPart);
      if (evt.event === "btn" && ["replay", "next", "prev"].includes(evt.btn)) {
        const delayMs = lastTimestamp && timestamp ? timestamp.getTime() - lastTimestamp.getTime() : 0;
        btnEvents.push({
          btn: evt.btn,
          timestamp,
          delayMs: Math.max(0, delayMs),
        });
        lastTimestamp = timestamp;
      }
    } catch {
      /* skip malformed */
    }
  }

  return btnEvents;
}

async function main() {
  console.log(`[e2e-replay] Proxy: ${PROXY_URL}`);
  console.log(`[e2e-replay] Metro: exp://${METRO_HOST}`);

  await preflight();

  // === Load or fetch raw log ===
  let rawLog = "";
  if (filePath) {
    console.log(`[e2e-replay] Reading log from ${filePath}...`);
    try {
      rawLog = fs.readFileSync(filePath, "utf8");
    } catch (e) {
      console.error(`[e2e-replay] FAIL: could not read ${filePath}:`, e.message);
      process.exit(1);
    }
  } else {
    console.log("[e2e-replay] Fetching log from proxy...");
    try {
      rawLog = await fetchTail(5000);
    } catch (e) {
      console.error("[e2e-replay] FAIL: could not fetch logs:", e.message);
      process.exit(1);
    }
  }

  // === Extract button events ===
  const btnEvents = extractButtonEvents(rawLog);
  console.log(`[e2e-replay] Extracted ${btnEvents.length} btn events`);

  if (btnEvents.length === 0) {
    console.error("[e2e-replay] FAIL: no btn events found in log");
    process.exit(2);
  }

  // === Save journal ===
  const journal = {
    timestamp: new Date().toISOString(),
    videoId,
    speed,
    extractedFrom: filePath ?? "proxy /log/tail",
    events: btnEvents,
  };
  fs.writeFileSync("/tmp/shadowtube-replay-journal.json", JSON.stringify(journal, null, 2));
  console.log("[e2e-replay] Saved journal to /tmp/shadowtube-replay-journal.json");

  await clearLog();
  console.log("[e2e-replay] Cleared log");

  await openDevRoute();
  console.log("[e2e-replay] Opened dev/pause-test");

  try {
    await waitForPlayerReady();
  } catch (e) {
    console.error("[e2e-replay] FAIL:", e.message);
    process.exit(1);
  }
  console.log("[e2e-replay] Player ready");

  const buttons = await findButtons();

  // === Replay actions ===
  console.log(`[e2e-replay] Replaying ${btnEvents.length} actions at speed ${speed}x...`);

  for (let i = 0; i < btnEvents.length; i++) {
    const evt = btnEvents[i];
    const btn = evt.btn;

    // Delay before action (relative timing divided by speed, capped at 5000ms)
    let delayMs = Math.round(evt.delayMs / speed);
    delayMs = Math.min(delayMs, 5000);
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    // Tap button
    const btnCoords = buttons[btn];
    if (btnCoords) {
      await tapButton(btnCoords.x, btnCoords.y);
    }

    if ((i + 1) % 10 === 0) {
      console.log(`[e2e-replay] ${i + 1}/${btnEvents.length} actions replayed`);
    }
  }

  console.log("[e2e-replay] All actions replayed, waiting 10s for log settlement...");
  await sleep(10000);

  console.log("[e2e-replay] Fetching fresh logs...");
  let freshLog = "";
  try {
    freshLog = await fetchTail(5000);
  } catch (e) {
    console.error("[e2e-replay] FAIL: could not fetch logs:", e.message);
    process.exit(1);
  }

  const { events } = parseEvents(freshLog);
  console.log(`[e2e-replay] Parsed ${events.length} e2e events`);

  if (events.length === 0) {
    console.error("[e2e-replay] FAIL: no e2e events in log after replay");
    process.exit(1);
  }

  // === Check invariants ===
  const { checks, anyFailed } = checkInvariants(events, freshLog.split("\n"));

  console.log("\n=== REPLAY VALIDATION REPORT ===");

  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    console.log(`${check.name}: ${status}`);

    if (!check.ok) {
      console.log(`  Reason: ${check.reason}`);

      if (check.stopEvent || check.tick || check.event || check.firstEvent) {
        const relevantEvent = check.stopEvent || check.tick || check.event || check.firstEvent;
        const idx = events.indexOf(relevantEvent);
        if (idx !== -1) {
          const start = Math.max(0, idx - 3);
          const end = Math.min(events.length, idx + 3);

          console.log(`  Log context (events ${start}–${end}):`);
          for (let j = start; j < end; j++) {
            const e = events[j];
            const marker = j === idx ? " >> " : "    ";
            console.log(`${marker}[${j}] ${JSON.stringify(e).slice(0, 100)}`);
          }
        }
      }
    }
  }

  console.log(`\njournal: /tmp/shadowtube-replay-journal.json`);

  if (anyFailed) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[e2e-replay] Fatal error:", e);
  process.exit(1);
});
