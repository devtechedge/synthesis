import { db } from "@/db";
import { researchRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ResearchState } from "@/lib/agent/schemas";
import { runResearch } from "@/lib/agent/engine";
import { Emitter } from "@/lib/agent/tracer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/run/[id]/approve — Human-in-the-loop resume.
 * Resumes the LangGraph from the planner checkpoint and streams every event
 * back as Server-Sent Events so the UI renders the run live.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isFinite(runId)) return Response.json({ error: "bad id" }, { status: 400 });

  const row = await db.select().from(researchRuns).where(eq(researchRuns.id, runId)).limit(1);
  if (!row[0]) return Response.json({ error: "not found" }, { status: 404 });

  const state = row[0].stateJson as ResearchState | null;
  if (!state || !state.plan) return Response.json({ error: "run has no plan to resume" }, { status: 409 });
  if (row[0].status === "done") return Response.json({ error: "run already complete" }, { status: 409 });

  await db.update(researchRuns).set({ status: "researching", updatedAt: new Date() }).where(eq(researchRuns.id, runId));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* controller closed */
        }
      };
      send({ type: "status", status: "researching" });
      const emitter = new Emitter(runId, (e) => send(e));
      try {
        await runResearch(state, emitter, runId);
        send({ type: "__done__", runId });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
