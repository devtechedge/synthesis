import SynthesisApp from "@/components/synthesis/App";
import { db } from "@/db";
import { researchRuns } from "@/db/schema";
import { desc } from "drizzle-orm";
import type { RunSummary, Status } from "@/lib/agent/schemas";

export const dynamic = "force-dynamic";

async function getRuns(): Promise<RunSummary[]> {
  try {
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
      .limit(12);
    return rows.map((r) => ({
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
  } catch {
    return [];
  }
}

export default async function Page() {
  const runs = await getRuns();
  return <SynthesisApp initialRuns={runs} />;
}
