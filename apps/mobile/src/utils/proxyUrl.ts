import Constants from "expo-constants";
import { PROD_PROXY_URL } from "@/src/api/proxyConfig";

/** Proxy URL, который видит приложение (для E2E-диагностики на экране). */
export function getDevProxyUrl(): string {
  return (
    process.env.EXPO_PUBLIC_PROXY_URL ??
    (Constants.expoConfig?.extra as { proxyUrl?: string } | undefined)
      ?.proxyUrl ??
    PROD_PROXY_URL
  );
}
