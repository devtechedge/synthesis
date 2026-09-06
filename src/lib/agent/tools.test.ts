import { describe, expect, it } from "vitest";
import { credibilityFor, domainOf } from "./tools";

describe("domainOf", () => {
  it("strips www and returns hostname", () => {
    expect(domainOf("https://www.nasa.gov/missions")).toBe("nasa.gov");
  });

  it("returns 'source' for invalid URLs", () => {
    expect(domainOf("not a url")).toBe("source");
  });
});

describe("credibilityFor", () => {
  it("scores gov / edu / news / tech / default", () => {
    expect(credibilityFor("cdc.gov")).toBe(0.97);
    expect(credibilityFor("arxiv.org")).toBe(0.9);
    expect(credibilityFor("reuters.com")).toBe(0.82);
    expect(credibilityFor("github.com")).toBe(0.78);
    expect(credibilityFor("random-blog.example")).toBe(0.55);
  });
});

