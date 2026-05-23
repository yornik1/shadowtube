#!/usr/bin/env node
/**
 * pnpm tunnel
 *
 * Starts everything needed to test on a phone with no local network access:
 *   1. ShadowTube proxy  (port 8787)
 *   2. ngrok tunnel      → public HTTPS URL for the proxy
 *   3. Prints QR code    ← scan with phone browser to confirm the URL
 *   4. expo start --tunnel with EXPO_PUBLIC_PROXY_URL set to the ngrok URL
 *
 * All child processes are killed together when you press Ctrl+C.
 */

import { spawn } from "child_process";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ── helpers ─────────────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: false,
    ...opts,
  });
  child.on("error", (e) => console.error(`[${cmd}] ${e.message}`));
  return child;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Poll ngrok local API until a tunnel for port 8787 appears. */
async function waitForNgrokUrl(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch("http://localhost:4040/api/tunnels");
      if (res.ok) {
        const { tunnels } = await res.json();
        const t = tunnels.find(
          (x) =>
            x.proto === "https" &&
            (x.config?.addr?.includes("8787") || x.public_url),
        );
        if (t) return t.public_url;
      }
    } catch {
      // ngrok not ready yet
    }
    await sleep(500);
  }
  throw new Error("ngrok did not start in time");
}

function printProxyUrl(url) {
  console.log(`\n📡 Proxy: ${url}`);
  console.log("  Open this URL once in phone browser to unlock ngrok tunnel\n");
}

// ── main ─────────────────────────────────────────────────────────────────────

const children = [];

process.on("SIGINT", () => {
  console.log("\nStopping all processes…");
  children.forEach((c) => c.kill("SIGTERM"));
  process.exit(0);
});

// 1. Start proxy
console.log("▶ Starting proxy on :8787…");
children.push(
  run("pnpm", ["--filter", "@shadowtube/proxy", "dev:node"], { cwd: root }),
);
await sleep(1500);

// 2. Start ngrok for the proxy
console.log("▶ Starting ngrok tunnel for proxy…");
children.push(
  run("ngrok", ["http", "8787", "--log=stdout"], { stdio: "ignore" }),
);

// 3. Wait for ngrok URL
console.log("⏳ Waiting for ngrok URL…");
let proxyUrl;
try {
  proxyUrl = await waitForNgrokUrl();
  console.log(`✅ Proxy public URL: ${proxyUrl}`);
} catch (e) {
  console.error("❌ " + e.message);
  console.error("   Make sure ngrok is installed: brew install ngrok");
  process.exit(1);
}

// 4. Print proxy URL
printProxyUrl(proxyUrl);

// 5. Start expo with --tunnel and the ngrok proxy URL
console.log("▶ Starting Expo (tunnel mode)…");
console.log("  After Expo starts, scan the QR code shown below in the terminal.");
console.log("  If QR is not visible, press ? then c to copy the Expo tunnel URL.\n");
const expoEnv = {
  ...process.env,
  EXPO_PUBLIC_PROXY_URL: proxyUrl,
};
children.push(
  run(
    "pnpm",
    ["--filter", "@shadowtube/mobile", "start", "--", "--tunnel", "--clear"],
    { cwd: root, env: expoEnv, stdio: "inherit" },
  ),
);
