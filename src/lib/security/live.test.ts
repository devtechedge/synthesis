import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { allowLiveProviders, resolveLiveForRequest, runWithLiveGate, hasLlmKey } from "./live";

const ENV_KEYS = ["LIVE_MODE", "OPENAI_API_KEY", "GROQ_API_KEY", "PUBLIC_RUN_TOKEN", "TAVILY_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveLiveForRequest", () => {
  it("is false when LIVE_MODE unset even if keys exist", () => {
    process.env.GROQ_API_KEY = "gsk-test";
    const req = new Request("https://x/api/run", { method: "POST" });
    expect(resolveLiveForRequest(req)).toBe(false);
  });

  it("is true when LIVE_MODE=true and key present", () => {
    process.env.LIVE_MODE = "true";
    process.env.GROQ_API_KEY = "gsk-test";
    const req = new Request("https://x/api/run", { method: "POST" });
    expect(resolveLiveForRequest(req)).toBe(true);
  });

  it("requires x-run-token when PUBLIC_RUN_TOKEN is set", () => {
    process.env.LIVE_MODE = "true";
    process.env.GROQ_API_KEY = "gsk-test";
    process.env.PUBLIC_RUN_TOKEN = "secret-demo";
    const bare = new Request("https://x/api/run", { method: "POST" });
    expect(resolveLiveForRequest(bare)).toBe(false);
    const ok = new Request("https://x/api/run", {
      method: "POST",
      headers: { "x-run-token": "secret-demo" },
    });
    expect(resolveLiveForRequest(ok)).toBe(true);
  });
});

describe("runWithLiveGate", () => {
  it("scopes allowLiveProviders per async context", () => {
    process.env.LIVE_MODE = "true";
    process.env.GROQ_API_KEY = "gsk-test";
    expect(hasLlmKey()).toBe(true);
    runWithLiveGate(false, () => {
      expect(allowLiveProviders()).toBe(false);
    });
    runWithLiveGate(true, () => {
      expect(allowLiveProviders()).toBe(true);
    });
  });
});
