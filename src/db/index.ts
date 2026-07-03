import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

type DB = NodePgDatabase<Record<string, never>>;

const globalForDb = globalThis as typeof globalThis & {
  __synthesisPool?: Pool;
  __synthesisDb?: DB;
};

/**
 * Resolve the Postgres connection string from whichever variable the host
 * injects. A Vercel Postgres (Neon) store auto-injects POSTGRES_URL /
 * POSTGRES_PRISMA_URL; a plain Neon/Supabase/local DB uses DATABASE_URL.
 */
export function resolveDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.PG_URL ??
    undefined
  );
}

function initPool(): Pool {
  if (globalForDb.__synthesisPool) return globalForDb.__synthesisPool;
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      "No Postgres connection string found. Set DATABASE_URL (or POSTGRES_URL) in " +
        "Vercel → Project → Settings → Environment Variables, then redeploy. " +
        "See DEPLOY.md for the step-by-step Vercel Postgres setup.",
    );
  }
  const pool = new Pool({
    connectionString: url,
    // Serverless-friendly: small pool, quick idle reaping.
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: url.includes(".neon.tech") || url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  if (process.env.NODE_ENV !== "production") globalForDb.__synthesisPool = pool;
  return pool;
}

function getInstance(): DB {
  if (!globalForDb.__synthesisDb) {
    globalForDb.__synthesisDb = drizzle(initPool());
  }
  return globalForDb.__synthesisDb;
}

/**
 * LAZY database client — exported as a drop-in `db`.
 *
 * Why a Proxy: Next.js evaluates route modules during `next build` ("collecting
 * page data") to gather metadata, even for dynamic routes. If we eagerly created
 * the Pool / threw on a missing DATABASE_URL at module load, the production build
 * would crash (the exact "DATABASE_URL is required" build failure). The Proxy
 * defers all of that to the first real query at runtime, so:
 *   - `next build` succeeds with NO database configured, and
 *   - a missing DATABASE_URL surfaces as a clear runtime error per-request,
 *     never a build failure.
 */
export const db = new Proxy({} as DB, {
  get(_target, prop: string | symbol) {
    const instance = getInstance();
    const value = Reflect.get(instance, prop, instance);
    // Preserve `this` binding for drizzle query-builder methods.
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
  },
}) as DB;
