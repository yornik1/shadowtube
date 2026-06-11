#!/usr/bin/env node
/**
 * Полный E2E цикл: проверки → open dev/pause-test → assert.
 * Metro и proxy должны быть уже запущены с правильным env.
 *
 *   pnpm proxy:dev          # терминал 1
 *   pnpm mobile:android     # терминал 2 (proxy URL для эмулятора уже в скрипте)
 *   pnpm e2e:dev            # терминал 3
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
    c.on("error", reject);
    c.on("close", (code) =>
      code === 0 ? resolve(undefined) : reject(new Error(`${cmd} exit ${code}`)),
    );
  });
}

async function main() {
  console.log("=== ShadowTube E2E pause-on-end ===\n");
  console.log("На эмуляторе должен открыться экран с ЗЕЛЁНЫМ баннером «E2E pause-test».");
  console.log("Видео ~5 сек → баннер «⏸ СТОП» → видео замирает.\n");

  await run("node", ["scripts/e2e-pause.mjs", "--auto-open"]);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
