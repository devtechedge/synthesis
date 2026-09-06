import { describe, expect, it, beforeEach } from "vitest";
import {
  assertSameOrigin,
  assertRateLimit,
  guardExpensivePost,
  __resetRateLimitBucketsForTests,
} from "./http";

function req(init: { origin?: string; referer?: string; host?: string; ip?: string } = {}): Request {
  const headers = new Headers();
  headers.set("host", init.host ?? "synthesis-gold.vercel.app");
  if (init.origin) headers.set("origin", init.origin);
  if (init.referer) headers.set("referer", init.referer);
  if (init.ip) headers.set("x-forwarded-for", init.ip);
  return new Request("https://synthesis-gold.vercel.app/api/run", { method: "POST", headers });
}

describe("assertSameOrigin", () => {
  it("allows matching Origin", () => {
    expect(assertSameOrigin(req({ origin: "https://synthesis-gold.vercel.app" })).ok).toBe(true);
  });

  it("rejects cross-origin Origin", () => {
    const r = assertSameOrigin(req({ origin: "https://evil.example" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("allows missing Origin (non-browser / same-site)", () => {
    expect(assertSameOrigin(req({})).ok).toBe(true);
  });

  it("rejects mismatched Referer when Origin absent", () => {
    const r = assertSameOrigin(req({ referer: "https://evil.example/x" }));
    expect(r.ok).toBe(false);
  });
});

describe("assertRateLimit", () => {
  beforeEach(() => {
    __resetRateLimitBucketsForTests();
  });

  it("allows up to 10 requests per IP per minute", () => {
    for (let i = 0; i < 10; i++) {
      expect(assertRateLimit(req({ ip: "1.2.3.4" })).ok).toBe(true);
    }
    const blocked = assertRateLimit(req({ ip: "1.2.3.4" }));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.status).toBe(429);
  });

  it("isolates buckets by IP", () => {
    for (let i = 0; i < 10; i++) assertRateLimit(req({ ip: "10.0.0.1" }));
    expect(assertRateLimit(req({ ip: "10.0.0.2" })).ok).toBe(true);
  });
});

describe("guardExpensivePost", () => {
  beforeEach(() => __resetRateLimitBucketsForTests());

  it("combines origin + rate limit", () => {
    expect(guardExpensivePost(req({ origin: "https://synthesis-gold.vercel.app", ip: "9.9.9.9" })).ok).toBe(
      true,
    );
    expect(guardExpensivePost(req({ origin: "https://evil.example", ip: "9.9.9.9" })).ok).toBe(false);
  });
});
