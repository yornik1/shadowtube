import Constants from "expo-constants";
import { getProxyUrlOverride } from "@/src/secure/keychain";

export const PROD_PROXY_URL =
  "http://ec2-16-16-146-238.eu-north-1.compute.amazonaws.com:8788";
export const PROD_PROXY_IP_URL = "http://16.16.146.238:8788";

type ProxyCandidateInput = {
  overrideUrl?: string | null;
  configuredUrl?: string | null;
  envUrl?: string | null;
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
    input.envUrl,
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
    envUrl: process.env.EXPO_PUBLIC_PROXY_URL,
  });
}

export function getConfiguredProxyUrl(): string {
  const extra = Constants.expoConfig?.extra as { proxyUrl?: string } | undefined;
  return buildProxyCandidates({
    configuredUrl: extra?.proxyUrl,
    envUrl: process.env.EXPO_PUBLIC_PROXY_URL,
  })[0]!;
}
