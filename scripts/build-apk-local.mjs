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
const androidDir = path.join(mobileDir, "android");
const distDir = path.resolve(root, "dist");

const proxyUrl =
  process.env.EXPO_PUBLIC_PROXY_URL ?? "(app.config.ts default AWS proxy)";

const javaHome =
  process.env.JAVA_HOME ??
  "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home";
const androidHome =
  process.env.ANDROID_HOME ?? "/opt/homebrew/share/android-commandlinetools";

const gradleJvmArgs = "-Xmx4096m -XX:MaxMetaspaceSize=1536m -Dfile.encoding=UTF-8";

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  GRADLE_OPTS: `${gradleJvmArgs} ${process.env.GRADLE_OPTS ?? ""}`.trim(),
  PATH: `${androidHome}/platform-tools:${process.env.PATH ?? ""}`,
};

function run(cmd, args, cwd, options = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    stdio: options.stdio ?? "inherit",
  });
  if (!options.allowFailure && r.status !== 0) process.exit(r.status ?? 1);
  return r;
}

function upsertGradleProperty(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return `${text.trimEnd()}\n${line}\n`;
}

function tuneGradleMemory() {
  const gradlePropertiesPath = path.join(androidDir, "gradle.properties");
  let text = fs.readFileSync(gradlePropertiesPath, "utf8");
  text = upsertGradleProperty(text, "org.gradle.jvmargs", gradleJvmArgs);
  text = upsertGradleProperty(text, "org.gradle.workers.max", "2");
  text = upsertGradleProperty(
    text,
    "kotlin.daemon.jvmargs",
    "-Xmx2048m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8",
  );
  fs.writeFileSync(gradlePropertiesPath, text);
  console.log("Applied local Gradle memory settings:");
  console.log(`  org.gradle.jvmargs=${gradleJvmArgs}`);
  console.log("  org.gradle.workers.max=2");
  console.log("  kotlin.daemon.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8");
}

console.log(`EXPO_PUBLIC_PROXY_URL=${proxyUrl}`);
console.log(`JAVA_HOME=${javaHome}`);
console.log(`GRADLE_OPTS=${env.GRADLE_OPTS}`);

run("npx", ["expo", "prebuild", "--platform", "android"], mobileDir);
tuneGradleMemory();
run("./gradlew", ["--stop"], androidDir, { allowFailure: true });
run("./gradlew", ["--no-daemon", "assembleRelease"], androidDir);

const apkSrc = path.join(
  mobileDir,
  "android/app/build/outputs/apk/release/app-release.apk",
);
const apkDst = path.join(distDir, "shadowtube-preview.apk");
fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(apkSrc, apkDst);
console.log(`\nAPK: ${apkDst}`);
