import Constants from "expo-constants";
import { getProxyUrlOverride } from "@/src/secure/keychain";

// Deployed proxy endpoints are injected at build time; the defaults are placeholders.
export const PROD_PROXY_URL =
  process.env.EXPO_PUBLIC_PROD_PROXY_URL ?? "http://proxy.example.com:8788";
export const PROD_PROXY_IP_URL =
  process.env.EXPO_PUBLIC_PROD_PROXY_IP_URL ?? "http://203.0.113.10:8788";

type ProxyCandidateInput = {
  overrideUrl?: string | null;
  configuredUrl?: string | null;
};

function normalizeProxyUrl(url?: string | null): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

export function buildProxyCandidates(input: ProxyCandidateInput): string[] {
  const candidates = [
    input.overrideUrl,
    input.configuredUrl,
    PROD_PROXY_URL,
    PROD_PROXY_IP_URL,
  ]
    .map(normalizeProxyUrl)
    .filter((url): url is string => Boolean(url));

  return Array.from(new Set(candidates));
}

export async function getProxyCandidates(): Promise<string[]> {
  const extra = Constants.expoConfig?.extra as { proxyUrl?: string } | undefined;
  return buildProxyCandidates({
    overrideUrl: await getProxyUrlOverride(),
    configuredUrl: extra?.proxyUrl,
  });
}

export function getConfiguredProxyUrl(): string {
  const extra = Constants.expoConfig?.extra as { proxyUrl?: string } | undefined;
  return buildProxyCandidates({
    configuredUrl: extra?.proxyUrl,
  })[0]!;
}
