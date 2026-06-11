#!/usr/bin/env node
/**
 * Stress-test E2E: monkey-клацанье кнопок (Prev/Replay/Next) с проверкой инвариантов.
 *
 * Usage:
 *   node scripts/e2e-stress.mjs [--n=100] [--seed=12345] [--videoId=vif8NQcjVf0]
 *
 * Defaults: n=100, seed=12345, videoId=vif8NQcjVf0
 *
 * Шаги:
 *   1. Preflight (proxy/adb/Metro)
 *   2. Открытие dev/pause-test через deep link
 *   3. Поиск кнопок в UIAutomator (Prev, Replay, Next)
 *   4. Серия случайных тапов + проверка liveness
 *   5. Финальный Replay + подождать
 *   6. Скачать логи, распарсить [e2e]-события
 *   7. Проверить инварианты (I1–I7)
 */
import { spawn, execSync } from "child_process";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { parseEvents, checkInvariants } from "./e2e-invariants.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// === PRNG Mulberry32 ===
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// === Парсинг аргументов ===
const args = process.argv.slice(2);
let N = 100;
let seed = 12345;
let videoId = "vif8NQcjVf0";

for (const arg of args) {
  if (arg.startsWith("--n=")) N = parseInt(arg.slice(4), 10);
  if (arg.startsWith("--seed=")) seed = parseInt(arg.slice(7), 10);
  if (arg.startsWith("--videoId=")) videoId = arg.slice(10);
}

console.log(`[e2e-stress] n=${N} seed=${seed} videoId=${videoId}`);

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

/**
 * Извлечение кнопок из UIAutomator XML.
 * content-desc: "⏮ Prev", "Replay", "Next ⏭"
 * bounds="[x1,y1][x2,y2]" → центр (x,y)
 */
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

function tapButton(x, y) {
  return new Promise((resolve, reject) => {
    const c = spawn("adb", ["shell", "input", "tap", String(x), String(y)], {
      stdio: "pipe",
    });
    c.on("error", reject);
    c.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tap ${code}`))));
  });
}

function getProcessPid() {
  try {
    const out = execSync("adb shell pidof host.exp.exponent", { encoding: "utf8" });
    return out.trim();
  } catch {
    return null;
  }
}


async function main() {
  console.log(`[e2e-stress] Proxy: ${PROXY_URL}`);
  console.log(`[e2e-stress] Metro: exp://${METRO_HOST}`);

  await preflight();
  await clearLog();
  console.log("[e2e-stress] Cleared log");

  await openDevRoute();
  console.log("[e2e-stress] Opened dev/pause-test");

  try {
    await waitForPlayerReady();
  } catch (e) {
    console.error("[e2e-stress] FAIL:", e.message);
    process.exit(1);
  }
  console.log("[e2e-stress] Player ready");

  const buttons = await findButtons();

  // === Stress-тест ===
  const rng = mulberry32(seed);
  const actionLog = [];

  console.log(`[e2e-stress] Starting ${N} random actions...`);

  for (let i = 0; i < N; i++) {
    const r = rng();
    let action = null;

    if (r < 0.4) {
      action = "replay";
      await tapButton(buttons.replay.x, buttons.replay.y);
    } else if (r < 0.65) {
      action = "next";
      if (buttons.next) await tapButton(buttons.next.x, buttons.next.y);
    } else if (r < 0.8) {
      action = "prev";
      if (buttons.prev) await tapButton(buttons.prev.x, buttons.prev.y);
    } else if (r < 0.95) {
      const delay = Math.floor(rng() * 2500 + 500);
      action = `wait:${delay}ms`;
      await sleep(delay);
    } else {
      // Double tap
      const tapDelay = Math.floor(rng() * 70 + 80);
      action = `double-tap:replay`;
      await tapButton(buttons.replay.x, buttons.replay.y);
      await sleep(tapDelay);
      await tapButton(buttons.replay.x, buttons.replay.y);
    }

    actionLog.push({ t: Date.now(), action });

    const betweenDelay = Math.floor(rng() * 1400 + 100);
    await sleep(betweenDelay);

    if ((i + 1) % 10 === 0) {
      console.log(`[e2e-stress] ${i + 1}/${N} actions done`);
    }

    if ((i + 1) % 20 === 0) {
      const pid = getProcessPid();
      if (!pid) {
        console.error("[e2e-stress] FAIL: app crashed at action", i + 1);
        process.exit(1);
      }
    }
  }

  console.log("[e2e-stress] Completed all actions, final replay...");
  await tapButton(buttons.replay.x, buttons.replay.y);
  await sleep(20000);

  console.log("[e2e-stress] Fetching logs...");
  let tail = "";
  try {
    tail = await fetchTail(5000);
  } catch (e) {
    console.error("[e2e-stress] FAIL: could not fetch logs:", e.message);
    process.exit(1);
  }

  const { events } = parseEvents(tail);
  console.log(`[e2e-stress] Parsed ${events.length} e2e events`);

  if (events.length === 0) {
    console.error("[e2e-stress] FAIL: no e2e events in log");
    process.exit(1);
  }

  // === Проверка инвариантов ===
  const { checks, anyFailed } = checkInvariants(events, tail.split("\n"));

  console.log("\n=== REPORT ===");

  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    console.log(`${check.name}: ${status}`);

    if (!check.ok) {
      console.log(`  Reason: ${check.reason}`);

      if (check.stopEvent || check.tick || check.event || check.firstEvent) {
        const relevantEvent = check.stopEvent || check.tick || check.event || check.firstEvent;
        const idx = events.indexOf(relevantEvent);
        const start = Math.max(0, idx - 5);
        const end = Math.min(events.length, idx + 5);

        console.log(`  Log context (events ${start}–${end}):`);
        for (let j = start; j < end; j++) {
          const e = events[j];
          const marker = j === idx ? " >> " : "    ";
          console.log(`${marker}[${j}] ${JSON.stringify(e).slice(0, 120)}`);
        }
      }

      // Last 10 actions
      const last10 = actionLog.slice(-10);
      if (last10.length > 0) {
        console.log("  Last 10 actions before violation:");
        for (const a of last10) {
          console.log(`    ${new Date(a.t).toISOString()} ${a.action}`);
        }
      }
    }
  }

  console.log(`\nreproduce: node scripts/e2e-stress.mjs --n=${N} --seed=${seed} --videoId=${videoId}`);

  if (anyFailed) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[e2e-stress] Fatal error:", e);
  process.exit(1);
});
