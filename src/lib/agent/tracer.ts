import { db } from "@/db";
import { runEvents } from "@/db/schema";
import type { AgentEvent } from "./schemas";

/**
 * Synthesis — observability emitter.
 *
 * - `emit()` fans an AgentEvent out to BOTH the live SSE consumer (onEvent)
 *   and the durable run_events table (so any run is replayable after the fact).
 * - `span()` records a DB-only telemetry span (latency/tokens/cost) for the
 *   Langfuse-style cost dashboard, without noisying up the UI stream.
 *
 * Principle #8: observe before you optimize. Principle #5: idempotent, resumable.
 */
export class Emitter {
  private seq = 0;
  constructor(
    private runId: number,
    private onEvent?: (e: AgentEvent & { seq: number }) => void,
  ) {}

  nextSeq() {
    return ++this.seq;
  }

  async emit(event: AgentEvent, meta?: { tokens?: number; costUsd?: number; latencyMs?: number }): Promise<void> {
    this.seq += 1;
    const seq = this.seq;
    try {
      this.onEvent?.({ ...event, seq });
    } catch {
      /* listener errors must never break the run */
    }
    try {
      await db.insert(runEvents).values({
        runId: this.runId,
        seq,
        type: event.type,
        agent: "agent" in event ? (event as { agent: string }).agent : null,
        payload: event as unknown as Record<string, unknown>,
        tokens: meta?.tokens ?? 0,
        costUsd: meta?.costUsd ?? 0,
        latencyMs: meta?.latencyMs ?? 0,
      });
    } catch {
      /* DB outage degrades observability, not the run */
    }
  }

  async span<T>(
    name: string,
    agent: string,
    fn: () => Promise<T>,
    meta?: { tokens?: number; costUsd?: number },
  ): Promise<T> {
    const t0 = Date.now();
    let errored = false;
    try {
      return await fn();
    } catch (e) {
      errored = true;
      throw e;
    } finally {
      const latencyMs = Date.now() - t0;
      this.seq += 1;
      try {
        await db.insert(runEvents).values({
          runId: this.runId,
          seq: this.seq,
          type: errored ? "span_error" : "span",
          agent: `${agent}/${name}`,
          payload: { latencyMs, errored },
          tokens: meta?.tokens ?? 0,
          costUsd: meta?.costUsd ?? 0,
          latencyMs,
        });
      } catch {
        /* ignore */
      }
    }
  }
}
