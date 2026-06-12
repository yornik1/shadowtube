/**
 * Dev-логи: телефон → POST /log → терминал proxy ([mobile] …) + /tmp/shadowtube-dev.log
 *
 * В Metro WebSocket НЕ шлём — flood ломает Expo tunnel reload.
 *
 * EXPO_PUBLIC_DEV_LOG=0 — выключить
 */
import Constants from "expo-constants";
import { PROD_PROXY_URL } from "@/src/api/proxyConfig";

const ENABLED =
  typeof __DEV__ !== "undefined" &&
  __DEV__ &&
  process.env.EXPO_PUBLIC_DEV_LOG !== "0";

const PROXY_URL =
  (Constants.expoConfig?.extra as { proxyUrl?: string } | undefined)?.proxyUrl ??
  PROD_PROXY_URL;

type Level = "log" | "info" | "warn" | "error" | "debug";
type Entry = { level: Level; ts: number; msg: string; tag?: string };

const queue: Entry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack ?? a.message;
      if (typeof a === "object" && a !== null) {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");
}

function flush(): void {
  timer = null;
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  fetch(`${PROXY_URL}/log`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(batch),
  }).catch(() => {});
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(flush, 800);
}

function push(level: Level, msg: string, tag?: string): void {
  if (!ENABLED) return;
  try {
    queue.push({ level, ts: Date.now(), msg, tag });
    if (queue.length > 100) queue.splice(0, queue.length - 100);
    schedule();
  } catch {
    /* swallow */
  }
}

/** Патчит console.* → только proxy, не Metro WS. */
export function installDevLog(): void {
  if (installed) return;
  if (!ENABLED) return;
  installed = true;

  (["log", "info", "warn", "error", "debug"] as Level[]).forEach((level) => {
    console[level] = (...args: unknown[]) => {
      push(level, format(args));
    };
  });

  push("info", `devLog → ${PROXY_URL}/log`, "devLog");
}

export function dlog(tag: string, ...args: unknown[]): void {
  if (!ENABLED) return;
  push("log", format(args), tag);
}
