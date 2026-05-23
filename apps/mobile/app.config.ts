import { ExpoConfig, ConfigContext } from "expo/config";
import os from "os";

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
 *  1. EXPO_PUBLIC_PROXY_URL env var (set manually for prod / specific IP)
 *  2. Auto-detected LAN IP — works for both emulator and physical device
 *     on the same Wi-Fi without any manual config.
 */
function resolveProxyUrl(): string {
  if (process.env.EXPO_PUBLIC_PROXY_URL) return process.env.EXPO_PUBLIC_PROXY_URL;
  const ip = getLocalIP();
  return `http://${ip}:8787`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const { web: _web, ...base } = config;
  const proxyUrl = resolveProxyUrl();
  // Print so it's visible in `expo start` output
  console.log(`[app.config] proxy → ${proxyUrl}`);
  return {
    ...base,
    platforms: ["android", "web"],
    name: "ShadowTube",
    slug: "shadowtube",
    version: "1.0.0",
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
    // Disable OTA updates — dev builds load from Metro, not EAS.
    // Without this, Expo Go may try to download a remote bundle and fail.
    updates: {
      enabled: false,
    },
    plugins: ["expo-router", "expo-sqlite", "expo-secure-store"],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      proxyUrl,
      eas: {
        projectId: process.env.EAS_PROJECT_ID,
      },
    },
  };
};
