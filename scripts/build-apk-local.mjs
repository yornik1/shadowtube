#!/usr/bin/env node
/**
 * Build release APK locally (no EAS). Requires JDK 17 + Android SDK.
 *
 *   pnpm build:apk:local
 *   EXPO_PUBLIC_PROXY_URL=http://192.168.x.x:8787 pnpm build:apk:local
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const mobileDir = path.resolve(root, "apps/mobile");
const distDir = path.resolve(root, "dist");

const proxyUrl =
  process.env.EXPO_PUBLIC_PROXY_URL ?? "(app.config.ts default AWS proxy)";

const javaHome =
  process.env.JAVA_HOME ??
  "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home";
const androidHome =
  process.env.ANDROID_HOME ?? "/opt/homebrew/share/android-commandlinetools";

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  PATH: `${androidHome}/platform-tools:${process.env.PATH ?? ""}`,
};

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`EXPO_PUBLIC_PROXY_URL=${proxyUrl}`);
console.log(`JAVA_HOME=${javaHome}`);

run("npx", ["expo", "prebuild", "--platform", "android"], mobileDir);
run("./gradlew", ["assembleRelease"], path.join(mobileDir, "android"));

const apkSrc = path.join(
  mobileDir,
  "android/app/build/outputs/apk/release/app-release.apk",
);
const apkDst = path.join(distDir, "shadowtube-preview.apk");
fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(apkSrc, apkDst);
console.log(`\nAPK: ${apkDst}`);
