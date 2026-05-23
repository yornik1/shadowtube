import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const { web: _web, ...base } = config;
  return {
  ...base,
  platforms: ["android"],
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
  plugins: ["expo-router", "expo-sqlite", "expo-secure-store"],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    proxyUrl: process.env.EXPO_PUBLIC_PROXY_URL ?? "http://localhost:8787",
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};
};
