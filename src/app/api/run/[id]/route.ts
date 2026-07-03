import { db } from "@/db";
import { researchRuns, runEvents, evidence as evidenceTable } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import type { AgentEvent, Status } from "@/lib/agent/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/run/[id] — full run detail incl. replayable event stream + evidence. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isFinite(runId)) return Response.json({ error: "bad id" }, { status: 400 });

  const runRow = await db.select().from(researchRuns).where(eq(researchRuns.id, runId)).limit(1);
  if (!runRow[0]) return Response.json({ error: "not found" }, { status: 404 });

  const [eventRows, evidenceRows] = await Promise.all([
    db.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(asc(runEvents.seq)),
    db.select().from(evidenceTable).where(eq(evidenceTable.runId, runId)),
  ]);

  const events = eventRows
    .filter((r) => r.type !== "span" && r.type !== "span_error")
    .map((r) => r.payload as AgentEvent & { seq: number });

  return Response.json({
    run: {
      id: runRow[0].id,
      brief: runRow[0].brief,
      status: runRow[0].status as Status,
      confidence: runRow[0].confidence,
      costUsd: runRow[0].costUsd,
      tokensUsed: runRow[0].tokensUsed,
      latencyMs: runRow[0].latencyMs,
      reportMarkdown: runRow[0].reportMarkdown,
      stateJson: runRow[0].stateJson,
      createdAt: runRow[0].createdAt?.toISOString() ?? null,
    },
    events,
    evidence: evidenceRows.map((e) => {
      let domain = "source";
      try {
        if (e.url) domain = new URL(e.url).hostname.replace(/^www\./, "");
      } catch {
        /* keep default */
      }
      return {
        id: String(e.id),
        subQuestionId: e.subQuestionId,
        claim: e.claim,
        snippet: "",
        source: { url: e.url ?? "", title: e.citation, credibility: e.credibility ?? 0.5, domain },
        score: e.score ?? 0,
      };
    }),
  });
}
