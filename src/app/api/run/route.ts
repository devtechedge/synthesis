import { db } from "@/db";
import { researchRuns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { RunSummary, Status } from "@/lib/agent/schemas";
import { createInitialState, planResearch } from "@/lib/agent/engine";
import { Emitter } from "@/lib/agent/tracer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/run — create a research run and execute the planning phase (HITL). */
export async function POST(req: Request) {
  let body: { brief?: unknown; constraints?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (!brief) return Response.json({ error: "brief is required" }, { status: 400 });
  if (brief.length > 1000) return Response.json({ error: "brief too long (max 1000 chars)" }, { status: 400 });

  const constraints =
    body.constraints && typeof body.constraints === "object" ? (body.constraints as Record<string, unknown>) : {};

  const inserted = await db
    .insert(researchRuns)
    .values({ threadId: Math.random().toString(36).slice(2), brief, constraints, status: "planning" })
    .returning({ id: researchRuns.id });
  const runId = inserted[0]!.id;

  const state = createInitialState(brief, constraints);
  const emitter = new Emitter(runId); // persist-only (no SSE in planning phase)
  await planResearch(state, emitter, runId);

  const row = await db
    .select({ status: researchRuns.status, planJson: researchRuns.planJson })
    .from(researchRuns)
    .where(eqId(runId))
    .limit(1);

  return Response.json({
    runId,
    status: (row[0]?.status ?? "planning") as Status,
    plan: row[0]?.planJson,
  });
}

/** GET /api/run — recent runs (recruiter can browse past research). */
export async function GET() {
  const rows = await db
    .select({
      id: researchRuns.id,
      threadId: researchRuns.threadId,
      brief: researchRuns.brief,
      status: researchRuns.status,
      confidence: researchRuns.confidence,
      costUsd: researchRuns.costUsd,
      tokensUsed: researchRuns.tokensUsed,
      latencyMs: researchRuns.latencyMs,
      createdAt: researchRuns.createdAt,
      engine: researchRuns.engine,
    })
    .from(researchRuns)
    .orderBy(desc(researchRuns.createdAt))
    .limit(24);
  const runs: RunSummary[] = rows.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    brief: r.brief,
    status: r.status as Status,
    confidence: r.confidence,
    costUsd: r.costUsd,
    tokensUsed: r.tokensUsed,
    latencyMs: r.latencyMs,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    engine: r.engine,
  }));
  return Response.json({ runs });
}

const eqId = (id: number) => eq(researchRuns.id, id);
