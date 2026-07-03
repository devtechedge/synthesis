import { db } from "@/db";
import { researchRuns, evalRuns } from "@/db/schema";
import type { ResearchState } from "@/lib/agent/schemas";
import { createInitialState, planResearch, runResearch } from "@/lib/agent/engine";
import { Emitter } from "@/lib/agent/tracer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/eval — automated evaluation harness (the CI quality gate).
 *
 * Runs the full pipeline headless against a golden set and asserts agent-grade
 * metrics: evidence coverage, citation coverage, reflection faithfulness, and
 * latency. Persists the result to `eval_runs` and returns a pass/fail summary.
 * The GitHub Action calls this and fails the build if `score` < threshold.
 */

interface GoldenCase {
  query: string;
  minEvidence: number;
  minCitations: number;
  minFaithfulness: number;
}

const GOLDEN: GoldenCase[] = [
  { query: "Compare lithium-ion vs solid-state batteries for EVs in 2026", minEvidence: 5, minCitations: 2, minFaithfulness: 0.7 },
  { query: "What are the main risks of adopting Rust in large codebases?", minEvidence: 4, minCitations: 2, minFaithfulness: 0.7 },
  { query: "Evidence on remote-work productivity post-2024", minEvidence: 5, minCitations: 2, minFaithfulness: 0.7 },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(5, Math.max(1, Number(url.searchParams.get("limit") ?? "2")));
  const cases = GOLDEN.slice(0, limit);

  const details: unknown[] = [];
  let passed = 0;

  for (const c of cases) {
    const inserted = await db
      .insert(researchRuns)
      .values({ threadId: `eval-${Date.now()}`, brief: c.query, constraints: { eval: true }, status: "planning" })
      .returning({ id: researchRuns.id });
    const runId = inserted[0]!.id;

    const state = createInitialState(c.query, { eval: true });
    const emitter = new Emitter(runId);
    await planResearch(state, emitter, runId);
    const final = await runResearch(state, emitter, runId);

    const citations = (final.report.match(/\[\d+\]/g) ?? []).length;
    const evidenceCount = final.evidence.length;
    const faithfulness = final.reflection?.faithfulness ?? 0;
    const latencyMs = final.budget.latencyMs;

    const ok =
      evidenceCount >= c.minEvidence && citations >= c.minCitations && faithfulness >= c.minFaithfulness && latencyMs < 60000;
    if (ok) passed++;

    details.push({
      query: c.query,
      passed: ok,
      metrics: { evidenceCount, citations, faithfulness: Math.round(faithfulness * 100) / 100, latencyMs, confidence: final.confidence },
      thresholds: c,
    });
  }

  const total = cases.length;
  const score = Math.round((passed / total) * 100) / 100;

  await db.insert(evalRuns).values({
    name: "synthesis-golden",
    passed,
    total,
    score,
    detailJson: details,
  });

  return Response.json({
    name: "synthesis-golden",
    passed,
    total,
    score,
    gate: score >= 1.0,
    details: details as ((typeof details)[number] & { metrics: Record<string, number> })[],
  });
}
