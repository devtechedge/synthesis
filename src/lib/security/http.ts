/**
 * Lightweight request guards for public demo API routes.
 * In-memory rate limit resets with the serverless isolate — still blocks casual abuse.
 */

export type GuardResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Allow same-origin browser POSTs; reject cross-origin. Missing Origin is OK (same-site nav / non-browser). */
export function assertSameOrigin(req: Request): GuardResult {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");
  if (!host) return { ok: true };

  const allowed = new Set<string>([
    `https://${host}`,
    `http://${host}`,
  ]);
  // Local / preview hosts
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }

  if (origin) {
    try {
      const o = new URL(origin);
      const ok = [...allowed].some((a) => {
        try {
          const u = new URL(a);
          return u.host === o.host;
        } catch {
          return false;
        }
      }) || o.host === host;
      if (!ok) return { ok: false, status: 403, error: "cross-origin request blocked" };
      return { ok: true };
    } catch {
      return { ok: false, status: 403, error: "invalid origin" };
    }
  }

  if (referer) {
    try {
      const r = new URL(referer);
      if (r.host !== host) {
        return { ok: false, status: 403, error: "cross-origin referer blocked" };
      }
    } catch {
      return { ok: false, status: 403, error: "invalid referer" };
    }
  }

  // Missing Origin + Referer: allow (curl, same-site navigations, server-to-server)
  return { ok: true };
}

export function assertRateLimit(req: Request, keyPrefix = "api"): GuardResult {
  const ip = clientIp(req);
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > RATE_MAX) {
    return { ok: false, status: 429, error: "rate limit exceeded (10/min/IP)" };
  }
  return { ok: true };
}

export function guardExpensivePost(req: Request, keyPrefix = "api"): GuardResult {
  const origin = assertSameOrigin(req);
  if (!origin.ok) return origin;
  return assertRateLimit(req, keyPrefix);
}

/** Test helper — clear rate-limit buckets between unit tests. */
export function __resetRateLimitBucketsForTests(): void {
  buckets.clear();
}
