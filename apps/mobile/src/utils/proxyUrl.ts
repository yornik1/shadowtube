import Constants from "expo-constants";

/** Proxy URL, который видит приложение (для E2E-диагностики на экране). */
export function getDevProxyUrl(): string {
  return (
    process.env.EXPO_PUBLIC_PROXY_URL ??
    (Constants.expoConfig?.extra as { proxyUrl?: string } | undefined)
      ?.proxyUrl ??
    "http://10.0.2.2:8787"
  );
}
