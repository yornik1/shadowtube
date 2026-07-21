/**
 * Ежедневное напоминание о повторении.
 *
 * В Expo Go на Android expo-notifications падает НА ИМПОРТЕ модуля (SDK 53+
 * вырезал push-функциональность), поэтому статического import здесь быть не
 * может — он уронил бы весь бандл, а не только напоминания. Модуль грузится
 * лениво и только там, где он реально работает: в собранном APK
 * (`pnpm build:apk:preview`).
 */
import Constants from "expo-constants";
import { Platform } from "react-native";
import { dlog } from "@/src/utils/devLog";

type NotificationsModule = typeof import("expo-notifications");

const CHANNEL_ID = "shadowtube-reminders";
/** Идентификатор нужен, чтобы не плодить дубли при каждом включении. */
const REMINDER_ID = "daily-review-reminder";

export const DEFAULT_REMINDER_HOUR = 20;

/** В Expo Go уведомления недоступны — показываем это в настройках. */
export function notificationsAvailable(): boolean {
  return Platform.OS !== "web" && Constants.appOwnership !== "expo";
}

let cached: NotificationsModule | null | undefined;

function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (!notificationsAvailable()) {
    cached = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require("expo-notifications") as NotificationsModule;
  } catch (e) {
    dlog("notifications", `module unavailable: ${String(e)}`);
    cached = null;
  }
  return cached;
}

async function ensureAndroidChannel(N: NotificationsModule): Promise<void> {
  if (Platform.OS !== "android") return;
  await N.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Повторения",
    importance: N.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
    lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function requestPermission(): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  try {
    const current = await N.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await N.requestPermissionsAsync();
    return asked.granted;
  } catch (e) {
    dlog("notifications", `permission failed: ${String(e)}`);
    return false;
  }
}

/** Ставит (или переставляет) ежедневное напоминание на заданный час. */
export async function scheduleDailyReminder(
  hour: number = DEFAULT_REMINDER_HOUR,
): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  try {
    if (!(await requestPermission())) return false;
    await ensureAndroidChannel(N);
    await cancelDailyReminder();

    await N.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: "Пора повторить фразы",
        body: "Пять минут — и цепочка дней продолжается.",
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
      },
    });

    dlog("notifications", `daily reminder set at ${hour}:00`);
    return true;
  } catch (e) {
    dlog("notifications", `schedule failed: ${String(e)}`);
    return false;
  }
}

export async function cancelDailyReminder(): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    // напоминания не было — это нормально
  }
}

export async function hasDailyReminder(): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  try {
    const scheduled = await N.getAllScheduledNotificationsAsync();
    return scheduled.some((n) => n.identifier === REMINDER_ID);
  } catch {
    return false;
  }
}
