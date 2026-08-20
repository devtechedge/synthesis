import { afterEach, describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "./index";

const KEYS = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "PG_URL"] as const;

describe("resolveDatabaseUrl", () => {
  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  it("prefers DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgresql://db";
    process.env.POSTGRES_URL = "postgresql://other";
    expect(resolveDatabaseUrl()).toBe("postgresql://db");
  });

  it("falls back to POSTGRES_URL (Vercel/Neon inject)", () => {
    process.env.POSTGRES_URL = "postgresql://neon";
    expect(resolveDatabaseUrl()).toBe("postgresql://neon");
  });

  it("returns undefined when nothing is set", () => {
    expect(resolveDatabaseUrl()).toBeUndefined();
  });
});
