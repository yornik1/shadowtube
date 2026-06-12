#!/usr/bin/env node
/**
 * Build standalone Android APK via EAS (profile preview by default).
 *
 * Usage:
 *   pnpm build:apk
 *   pnpm build:apk:preview
 *   EXPO_PUBLIC_PROXY_URL=http://192.168.x.x:8787 pnpm build:apk
 *
 * Proxy URL is baked into the APK at build time (app.config.ts).
 * Default: deployed AWS proxy from app.config.ts.
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(__dirname, "../apps/mobile");

const args = process.argv.slice(2);
const profileArg = args.find((a) => a.startsWith("--profile="));
const profileFlagIdx = args.indexOf("--profile");
const profile =
  profileArg?.split("=")[1] ??
  (profileFlagIdx >= 0 ? args[profileFlagIdx + 1] : null) ??
  "preview";

const proxyUrl =
  process.env.EXPO_PUBLIC_PROXY_URL ?? "(app.config.ts default AWS proxy)";

console.log(`Building Android APK (profile: ${profile})`);
console.log(`EXPO_PUBLIC_PROXY_URL=${proxyUrl}`);
console.log("Ensure the configured proxy is reachable from the phone.\n");

const child = spawn(
  "npx",
  ["eas-cli", "build", "-p", "android", "--profile", profile, "--non-interactive"],
  {
    cwd: mobileDir,
    stdio: "inherit",
    env: { ...process.env },
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
