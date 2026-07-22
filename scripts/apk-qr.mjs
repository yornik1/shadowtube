#!/usr/bin/env node
/**
 * Печатает QR-код на скачивание последней собранной APK.
 *
 * Зачем: единственный способ поставить сборку на телефон — открыть ссылку
 * НА ТЕЛЕФОНЕ. Пересылать её себе в мессенджер каждый раз неудобно, а QR
 * наводится камерой за две секунды.
 *
 * Запускается на компьютере. На телефоне ничего запускать не нужно.
 *
 *   pnpm apk:qr
 */

import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import qrcode from "qrcode-terminal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(__dirname, "../apps/mobile");

function latestBuild() {
  // eas видит проект только изнутри apps/mobile.
  const out = execFileSync(
    "npx",
    ["eas-cli", "build:list", "--limit", "1", "--non-interactive"],
    { cwd: mobileDir, encoding: "utf8" },
  );

  const pick = (label) =>
    out.split("\n").find((l) => l.trim().startsWith(label))?.split(/\s{2,}/).at(-1)?.trim();

  return {
    url: pick("Application Archive URL"),
    status: pick("Status"),
    version: pick("Version"),
    runtime: pick("Runtime Version"),
    finished: pick("Finished at"),
  };
}

const b = latestBuild();

if (b.status !== "finished" || !b.url || b.url === "null") {
  console.error(`Последняя сборка не готова (статус: ${b.status ?? "?"}).`);
  console.error("Собрать: pnpm build:apk:preview");
  process.exit(1);
}

console.log(`\nShadowTube ${b.version} · runtime ${b.runtime} · собрана ${b.finished}\n`);
qrcode.generate(b.url, { small: true }, (code) => {
  console.log(code);
  console.log("Наведите камеру телефона на QR → скачается APK → тапните файл → «Установить».");
  console.log("Android спросит разрешение ставить приложения из браузера — разрешите.\n");
  console.log(`Ссылка, если QR неудобен: ${b.url}\n`);
});
