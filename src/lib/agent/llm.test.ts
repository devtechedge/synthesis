import { describe, expect, it } from "vitest";
import { cosine, costForTokens, ensureJsonHint, estimateTokens } from "./llm";

describe("estimateTokens", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("uses ~4 chars per token, minimum 1", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(8))).toBe(2);
  });
});

describe("costForTokens", () => {
  it("prices gpt-4o-mini at published rates", () => {
    // 1M in + 1M out → 0.15 + 0.6
    expect(costForTokens("gpt-4o-mini", 1_000_000, 1_000_000)).toBeCloseTo(0.75);
  });

  it("falls back to default pricing for unknown models", () => {
    expect(costForTokens("unknown-model", 1_000_000, 0)).toBeCloseTo(0.5);
  });
});

describe("cosine", () => {
  it("is 1 for identical unit vectors", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("truncates to the shorter length", () => {
    expect(cosine([1, 0, 9], [1, 0])).toBeCloseTo(1);
  });
});

describe("ensureJsonHint", () => {
  it("is a no-op when a message already contains the word json", () => {
    const msgs = [{ role: "user" as const, content: "Return JSON with keys a,b" }];
    expect(ensureJsonHint(msgs)).toBe(msgs);
  });

  it("appends a JSON-only hint when missing (Groq json_object rule)", () => {
    const msgs = [{ role: "system" as const, content: "You are a planner." }];
    const out = ensureJsonHint(msgs);
    expect(out).toHaveLength(2);
    expect(out[1].content).toMatch(/json/i);
  });
});
