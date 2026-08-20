# Security Assessment — Synthesis

**Date:** 2026-08-21  
**Scope:** Auth, XSS, injection, CORS, secrets, LLM/tool keys, SSE  
**Context:** Public deploy is a **free-tier multi-agent research demo** on Vercel + Neon. Simulated mode works with no keys; real mode uses Groq + Tavily when env vars are set.

---

## Executive summary

| Area | Risk | Notes |
|------|------|--------|
| Authentication | **None (accepted)** | No user accounts, sessions, or JWT. Anyone who can open the URL can launch a brief. |
| Authorization | **N/A** | HITL “Approve & execute” is a UX gate, not an ACL. |
| XSS | **Low–medium** | Report Markdown is rendered via `react-markdown`. No `dangerouslySetInnerHTML` in app code. |
| Injection (SQL) | **Low** | Drizzle parameterized queries. Brief length-capped at 1000 chars. |
| Secrets in repo | **Low** | `.env` gitignored; `.env.example` placeholders only. `drizzle.config.json` uses a local placeholder URL, not production Neon. |
| SSRF (tools) | **Accepted (demo)** | `read_url` / Jina fetch arbitrary URLs when a key is set. Simulated mode does not egress. |
| Prompt injection | **Accepted (demo)** | Retrieved web text is fed to the LLM. No production isolation of untrusted content. |
| CORS | **N/A** | Same-origin Next.js API routes. |
| Payments / PII | **N/A** | No payments, no user PII store. Research briefs may contain whatever the visitor types. |
| Build config | **OK** | No `ignoreBuildErrors`. `tsc --noEmit` in CI. |

**Overall (public Vercel demo):** Low residual risk for a portfolio demo — no auth, no payments, budget-capped agent loop.  
**Overall (if this were a production research product):** High — unauthenticated spend against LLM/search APIs, prompt injection via retrieved pages, no tenant isolation.

Do **not** claim NextAuth, JWT, or a hardened multi-tenant backend.

---

## 1. Authentication

There is none. `/api/run` POST creates a run for any caller. Rate limiting is whatever Vercel/Groq/Tavily apply.

**Accepted for portfolio demo.** If this becomes a product: add auth, per-user quotas, and signed run IDs.

---

## 2. Authorization / HITL

The planner pauses at `awaiting_approval`. That is a **human-in-the-loop UX checkpoint**, not an authorization boundary. Anyone who can POST `/api/run/:id/approve` can resume that run if they know the numeric id.

---

## 3. XSS

- Product UI is React text for briefs, plans, timeline.
- The report tab uses `react-markdown` + `remark-gfm` + `rehype-highlight`. Default React escaping applies to most nodes; Markdown HTML-in-markdown is the residual risk.
- No `dangerouslySetInnerHTML` in `src/`.

---

## 4. Injection

- Drizzle ORM for all Postgres access. No string-concatenated SQL.
- `POST /api/run` validates JSON and caps `brief` at 1000 characters.
- `compute()` tool allow-lists `[-+*/().\d\s%]` before eval — unit-tested.

---

## 5. Secrets & LLM keys

- Required: `DATABASE_URL` (or Vercel/Neon `POSTGRES_URL`).
- Optional: `OPENAI_API_KEY` / `GROQ_API_KEY`, `TAVILY_API_KEY`, `SERPER_API_KEY`, `JINA_API_KEY`.
- Keys live in Vercel Environment Variables. Never commit Neon connection strings into `drizzle.config.json`.
- Simulated mode is the default when keys are absent — the demo still runs.

---

## 6. SSRF / tool egress

When `TAVILY_API_KEY` / `JINA_API_KEY` are set, researcher tools fetch remote URLs. That is intended. Residual: a crafted brief can steer the agent toward internal IPs if the runtime can reach them.

**Accepted for this demo.** Production would need URL allow-lists and no-RFC1918 fetches.

---

## 7. Agent budget (abuse cost)

Hard caps in `src/lib/agent/schemas.ts`: max steps 24, max tokens 60k, cost cap $1, max 2 Reflexion revisions. Breach routes to the finalizer instead of looping.

Does **not** replace provider-side rate limits or billing alerts.

---

## 8. HTTP surface

| Path | Auth | Notes |
|------|------|--------|
| `/` | None | App shell; SSR swallows DB errors and shows empty recents |
| `/api/health` | None | `SELECT 1` against Postgres |
| `/api/run` GET | None | Recent runs |
| `/api/run` POST | None | Create + plan |
| `/api/run/[id]` | None | Replay |
| `/api/run/[id]/approve` | None | SSE resume |
| `/api/eval` | None | Golden-set harness (CI). Do not expose to the public internet without auth if eval becomes expensive. |

---

## 9. Dependency / supply chain

- No NextAuth, Prisma leftover, z.ai SDK, or unused Testing Library.
- Removed unused `dotenv` (drizzle-kit ships its own loader).
- **Kept** `drizzle-orm` + `pg` — they are the production persistence path.
- Weekly Dependabot (patch/minor only; majors ignored).
- Do **not** `npm audit fix --force` onto a Next major.

`npm audit --omit=dev` (2026-08-21): **3 high**, all nested under `next@16.2.6` (`next`, nested `postcss`, `sharp`). Clearing them requires `next@16.3.1` via `--force`, which is outside the stated range. Left as residual. `nanoid` was patched without a force bump.

```bash
npm audit --omit=dev
```

---

## 10. Residual risk & acceptance

**Accepted for portfolio demo**
- Unauthenticated run creation.
- HITL is UX, not ACL.
- Prompt injection via retrieved web text.
- Tool SSRF when search/read keys are present.
- Public eval endpoint.
- Next 16.2.6 nested advisories (see §9).

**Not accepted if this were a paid multi-tenant product**
- Missing auth and quotas.
- Unsigned run IDs.
- Unfiltered URL fetch.

---

## 11. How to re-test

```bash
npm ci
npm test
npm run typecheck
npm run test:e2e
npm audit --omit=dev
```
