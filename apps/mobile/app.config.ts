import { ExpoConfig, ConfigContext } from "expo/config";
import os from "os";

const PROD_PROXY_URL =
  "http://ec2-16-16-146-238.eu-north-1.compute.amazonaws.com:8788";

/** Returns the first non-loopback IPv4 address on the host machine. */
function getLocalIP(): string {
  try {
    const nets = os.networkInterfaces();
    for (const list of Object.values(nets)) {
      if (!list) continue;
      for (const net of list) {
        if (net.family === "IPv4" && !net.internal) return net.address;
      }
    }
  } catch {
    // ignore — fallback below
  }
  return "localhost";
}

/**
 * Proxy URL resolution order:
 *  1. EXPO_PUBLIC_PROXY_URL env var (manual override)
 *  2. Local LAN IP only when SHADOWTUBE_USE_LOCAL_PROXY=1
 *  3. Deployed AWS proxy so APKs do not depend on the development LAN.
 */
function resolveProxyUrl(): string {
  if (process.env.SHADOWTUBE_USE_LOCAL_PROXY !== "1") return PROD_PROXY_URL;
  if (process.env.EXPO_PUBLIC_PROXY_URL) return process.env.EXPO_PUBLIC_PROXY_URL;
  const ip = getLocalIP();
  return `http://${ip}:8787`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const { web: _web, ...base } = config;
  const proxyUrl = resolveProxyUrl();
  return {
    ...base,
    platforms: ["android", "web"],
    name: "ShadowTube",
    slug: "shadowtube",
    // runtimeVersion завязан на это поле (policy: appVersion). Поднимать при
    // КАЖДОМ добавлении нативного модуля, иначе OTA доставит JS, зовущий
    // модуль, которого в старом APK физически нет. 1.1.0 = +expo-notifications.
    version: "1.1.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "shadowtube",
    userInterfaceStyle: "dark",
    android: {
      package: "com.shadowtube.app",
      adaptiveIcon: {
        backgroundColor: "#0f0f14",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      enabled: true,
      url: "https://u.expo.dev/c472fd1e-fa2b-4ca3-a74d-da0eb6baf131",
    },
    plugins: [
      "expo-router",
      "expo-sqlite",
      "expo-secure-store",
      "expo-notifications",
      "expo-font",
      "expo-splash-screen",
      "./plugins/withCleartextTraffic",
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      proxyUrl,
      eas: {
        projectId:
          process.env.EAS_PROJECT_ID ??
          "c472fd1e-fa2b-4ca3-a74d-da0eb6baf131",
      },
    },
  };
};
