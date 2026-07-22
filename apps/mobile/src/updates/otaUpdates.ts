/**
 * OTA-обновления через EAS Update.
 *
 * Канал и URL уже настроены в `app.config.ts`, но до этого модуля приложение
 * ни разу не обращалось к `expo-updates` — обновления молча скачивались (или
 * нет), и понять это изнутри приложения было нельзя. Отсюда и ощущение, что
 * APK нужно носить руками.
 *
 * Что ездит по OTA: JS, стили, тексты, картинки. Что требует новой сборки APK:
 * новые нативные модули (например, expo-notifications) и смена версии
 * приложения — `runtimeVersion` завязан на неё.
 *
 * Модуль грузится лениво: в Expo Go часть API кидает исключения, и один
 * неудачный импорт не должен ронять бандл (уже наступали на это с
 * expo-notifications).
 */
import { dlog } from "@/src/utils/devLog";

type UpdatesModule = typeof import("expo-updates");

let cached: UpdatesModule | null | undefined;

function getUpdates(): UpdatesModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require("expo-updates") as UpdatesModule;
  } catch (e) {
    dlog("ota", `module unavailable: ${String(e)}`);
    cached = null;
  }
  return cached;
}

/** В dev-сборке и Expo Go OTA отключён — обновления приезжают через Metro. */
export function updatesAvailable(): boolean {
  const U = getUpdates();
  return Boolean(U?.isEnabled) && !(typeof __DEV__ !== "undefined" && __DEV__);
}

export type UpdateCheckResult =
  | "unavailable"
  | "up-to-date"
  | "downloaded"
  | "error";

/**
 * Проверяет и сразу скачивает обновление.
 *
 * `downloaded` означает, что новая версия уже на устройстве и применится при
 * следующем запуске (или по `applyUpdate()`).
 */
export async function checkAndDownload(): Promise<UpdateCheckResult> {
  const U = getUpdates();
  if (!U || !updatesAvailable()) return "unavailable";

  try {
    const check = await U.checkForUpdateAsync();
    if (!check.isAvailable) return "up-to-date";

    await U.fetchUpdateAsync();
    dlog("ota", "update downloaded");
    return "downloaded";
  } catch (e) {
    dlog("ota", `check failed: ${String(e)}`);
    return "error";
  }
}

/** Перезапускает приложение на скачанной версии. */
export async function applyUpdate(): Promise<void> {
  const U = getUpdates();
  if (!U) return;
  await U.reloadAsync();
}

export type UpdateInfo = {
  runtimeVersion: string;
  channel: string;
  /** id текущей ревизии. Не пустой и у встроенного бандла — сам по себе не отличает источник. */
  updateId: string | null;
  /**
   * Запущен бандл, вшитый в APK (а не скачанный по OTA).
   *
   * Именно это нужно видеть во время аварии: после
   * `update:roll-back-to-embedded` признаком успеха является возврат на
   * встроенную версию, а по одному `updateId` этого не понять.
   */
  isEmbedded: boolean;
  createdAt: Date | null;
  enabled: boolean;
};

export function currentUpdateInfo(): UpdateInfo {
  const U = getUpdates();
  return {
    runtimeVersion: U?.runtimeVersion ?? "?",
    channel: U?.channel ?? "—",
    updateId: U?.updateId ?? null,
    isEmbedded: Boolean(U?.isEmbeddedLaunch),
    createdAt: U?.createdAt ?? null,
    enabled: Boolean(U?.isEnabled),
  };
}
