import { describe, expect, it } from "vitest";

import { vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

vi.mock("@/src/secure/keychain", () => ({
  getProxyUrlOverride: vi.fn(async () => null),
}));

import {
  buildProxyCandidates,
  PROD_PROXY_IP_URL,
  PROD_PROXY_URL,
} from "./proxyConfig";

describe("proxy config", () => {
  it("keeps AWS DNS and raw IP fallbacks when no override is set", () => {
    const candidates = buildProxyCandidates({});

    expect(candidates).toContain(PROD_PROXY_URL);
    expect(candidates).toContain(PROD_PROXY_IP_URL);
    expect(candidates.indexOf(PROD_PROXY_URL)).toBeLessThan(
      candidates.indexOf(PROD_PROXY_IP_URL),
    );
  });

  it("tries explicit override first but keeps built-in AWS fallbacks", () => {
    const candidates = buildProxyCandidates({
      overrideUrl: " http://10.0.2.2:8787/ ",
    });

    expect(candidates[0]).toBe("http://10.0.2.2:8787");
    expect(candidates).toContain(PROD_PROXY_URL);
    expect(candidates).toContain(PROD_PROXY_IP_URL);
  });

  it("deduplicates equivalent URLs after trimming trailing slashes", () => {
    const candidates = buildProxyCandidates({
      overrideUrl: `${PROD_PROXY_URL}/`,
      configuredUrl: PROD_PROXY_URL,
    });

    expect(candidates.filter((url) => url === PROD_PROXY_URL)).toHaveLength(1);
  });
});
