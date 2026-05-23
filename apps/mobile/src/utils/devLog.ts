/**
 * Dev-логирование на устройстве: патчит console.* и шлёт батчем
 * на proxy `/log`. Включается только в __DEV__. Файл лежит в
 * apps/proxy/dev.log — его читают разработчики/LLM-ассистенты.
 *
 * Чтобы посмотреть свежие строки:
 *   curl http://localhost:8787/log/tail?n=200
 *   curl -X DELETE http://localhost:8787/log
 */
import Constants from "expo-constants";

const PROXY_URL =
  process.env.EXPO_PUBLIC_PROXY_URL ??
  (Constants.expoConfig?.extra as { proxyUrl?: string } | undefined)?.proxyUrl ??
  "http://10.0.2.2:8787";

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
  }).catch(() => {
    // если proxy лежит — теряем эту партию, но не падаем и не зацикливаемся
  });
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(flush, 250);
}

function push(level: Level, args: unknown[], tag?: string): void {
  try {
    queue.push({ level, ts: Date.now(), msg: format(args), tag });
    if (queue.length > 500) queue.splice(0, queue.length - 500);
    schedule();
  } catch {
    /* swallow */
  }
}

/** Вызывать один раз на старте приложения. */
export function installDevLog(): void {
  if (installed) return;
  if (!__DEV__) return;
  installed = true;

  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug?.bind(console) ?? console.log.bind(console),
  };

  (Object.keys(orig) as Level[]).forEach((level) => {
    console[level] = (...args: unknown[]) => {
      orig[level](...args);
      push(level, args);
    };
  });

  push("info", [`devLog installed → ${PROXY_URL}/log`], "devLog");
}

/** Произвольный лог с тегом — удобно искать по конкретной фиче. */
export function dlog(tag: string, ...args: unknown[]): void {
  if (!__DEV__) return;
  console.log(`[${tag}]`, ...args);
  push("log", args, tag);
}
