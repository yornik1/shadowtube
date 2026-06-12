/**
 * Proxy server tests.
 *
 * Unit tests: spin up the handler in-process using a real HTTP server on a
 * random port — no external calls, inputs validated before they hit YouTube.
 *
 * Integration tests: hit the real proxy at PROXY_URL (default localhost:8787).
 * These are skipped when the proxy isn't running.
 *
 * Usage:
 *   pnpm test                                   # unit tests only
 *   PROXY_URL=http://localhost:8787 pnpm test   # + integration tests
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { handleRequest, startServer, fetchTranscript, fetchMetadata } from "../node-server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function request(
  server: http.Server,
  path: string,
  method = "GET",
): Promise<{ status: number; body: unknown }> {
  const addr = server.address() as { port: number };
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: addr.port, path, method },
      (res) => {
        let raw = "";
        res.on("data", (c: Buffer) => (raw += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: raw });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Unit tests — local server, no real YouTube calls
// ---------------------------------------------------------------------------

describe("proxy handler (unit)", () => {
  let server: http.Server;

  beforeAll(async () => {
    server = await new Promise<http.Server>((resolve) => {
      const s = http.createServer(handleRequest);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
  });

  afterAll(() => server.close());

  it("GET / returns ok + endpoints list", async () => {
    const { status, body } = await request(server, "/");
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, server: "node" });
    expect((body as { endpoints: string[] }).endpoints).toContain("/debug/video?videoId=");
  });

  it("GET /transcript without videoId → 400", async () => {
    const { status, body } = await request(server, "/transcript");
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/videoId/i);
  });

  it("GET /metadata without videoId → 400", async () => {
    const { status, body } = await request(server, "/metadata");
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/videoId/i);
  });

  it("OPTIONS / → 204 CORS preflight", async () => {
    const { status } = await request(server, "/", "OPTIONS");
    expect(status).toBe(204);
  });

  it("disables dev log endpoints in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { status, body } = await request(server, "/log", "POST");
      expect(status).toBe(404);
      expect((body as { error: string }).error).toMatch(/not found/i);
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Integration tests — require a running proxy
// Skipped automatically when proxy is unreachable.
// ---------------------------------------------------------------------------

const PROXY_URL = process.env.PROXY_URL ?? "http://localhost:8787";

async function proxyReachable(): Promise<boolean> {
  try {
    const res = await fetch(PROXY_URL, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Rick Astley — "Never Gonna Give You Up". Public, has English captions,
// stable video ID. Used as a reliable test fixture.
const TEST_VIDEO_ID = "dQw4w9WgXcQ";

describe.skipIf(!(await proxyReachable()))("proxy HTTP (integration, requires proxy)", () => {
  it("GET /transcript returns well-formed segments", async () => {
    const res = await fetch(`${PROXY_URL}/transcript?videoId=${TEST_VIDEO_ID}&lang=en`);
    expect(res.ok).toBe(true);

    const data = (await res.json()) as {
      segments: { start: number; duration: number; text: string }[];
      hasManualCaptions: boolean;
      language: string;
    };

    expect(data.language).toBe("en");
    expect(Array.isArray(data.segments)).toBe(true);
    expect(data.segments.length).toBeGreaterThan(5);

    const first = data.segments[0];
    expect(typeof first.start).toBe("number");
    expect(typeof first.duration).toBe("number");
    expect(typeof first.text).toBe("string");
    expect(first.text.length).toBeGreaterThan(0);
  });

  it("GET /metadata returns video info", async () => {
    const res = await fetch(`${PROXY_URL}/metadata?videoId=${TEST_VIDEO_ID}`);
    expect(res.ok).toBe(true);

    const meta = (await res.json()) as {
      title: string;
      channel: string;
      durationSec: number;
      thumbnail: string;
    };

    expect(meta.title.toLowerCase()).toContain("never gonna");
    expect(meta.channel).toBeTruthy();
    expect(meta.durationSec).toBeGreaterThan(100);
    expect(meta.thumbnail).toMatch(/^https?:\/\//);
  });

  it("GET /transcript with bad videoId → error JSON", async () => {
    const res = await fetch(`${PROXY_URL}/transcript?videoId=BADID_XXXX_NOPE`);
    // should be 404 or 500 — not a crash, valid JSON with error field
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it("CORS headers present on all responses", async () => {
    const res = await fetch(`${PROXY_URL}/`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
