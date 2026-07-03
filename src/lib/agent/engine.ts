/**
 * Synthesis — orchestration engine.
 *
 * Wires the agent crew into a LangGraph-style StateGraph and runs it. The
 * "engine" is a thin composition layer: the architecture is the interfaces,
 * the frameworks are configurations behind them (principle #11). Swapping in a
 * CrewAI or AutoGen backend means implementing the same `runResearch` contract.
 */

import { db } from "@/db";
import { researchRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  type AgentEvent,
  type ResearchState,
  type Status,
  ResearchStateSchema,
  BudgetSchema,
  MAX_STEPS,
  MAX_TOKENS,
  COST_CAP_USD,
  MAX_REVISIONS,
} from "./schemas";
import { StateGraph, END, type RunContext } from "./graph";
import { Emitter } from "./tracer";
import {
  plannerNode,
  fanOutNode,
  synthesizerNode,
  criticNode,
  factCheckerNode,
  finalizerNode,
} from "./agents";

export interface SynthesisContext extends RunContext {
  emitter: Emitter;
  startedAt: number;
}

const NODE_META: Record<string, { agent: string; label: string }> = {
  planner: { agent: "planner", label: "Decomposing brief into a research plan" },
  fan_out: { agent: "researcher", label: "Research crew fan-out (parallel)" },
  synthesizer: { agent: "synthesizer", label: "Synthesizing cited report" },
  critic: { agent: "critic", label: "Critique & faithfulness scoring" },
  fact_checker: { agent: "fact_checker", label: "Source credibility audit" },
  finalizer: { agent: "finalizer", label: "Assembling final artifacts" },
};

/** The Reflexion routing decision — bounded loop, never open-ended. */
function criticRouter(state: ResearchState): string {
  const r = state.reflection;
  if (r && r.recommendation === "revise" && state.budget.revisionsUsed <= MAX_REVISIONS) {
    return "synthesizer";
  }
  return "fact_checker";
}

export function buildResearchGraph() {
  const g = new StateGraph<ResearchState, SynthesisContext>();
  g.addNode("fan_out", fanOutNode);
  g.addNode("synthesizer", synthesizerNode);
  g.addNode("critic", criticNode);
  g.addNode("fact_checker", factCheckerNode);
  g.addNode("finalizer", finalizerNode);
  g.setEntry("fan_out");
  g.addEdge("fan_out", "synthesizer");
  g.addEdge("synthesizer", "critic");
  g.addConditional("critic", criticRouter);
  g.addEdge("fact_checker", "finalizer");
  g.addEdge("finalizer", END);
  return g;
}

export function createInitialState(brief: string, constraints: Record<string, unknown> = {}): ResearchState {
  return ResearchStateSchema.parse({
    threadId: Math.random().toString(36).slice(2),
    brief,
    constraints,
    budget: BudgetSchema.parse({ maxSteps: MAX_STEPS, maxTokens: MAX_TOKENS, maxCostUsd: COST_CAP_USD }),
  });
}

function makeContext(state: ResearchState, emitter: Emitter, runId: number): SynthesisContext {
  return { emitter, budget: state.budget, runId, startedAt: Date.now() };
}

/** HITL planning phase: run only the planner, then pause for approval. */
export async function planResearch(state: ResearchState, emitter: Emitter, runId: number): Promise<ResearchState> {
  const ctx = makeContext(state, emitter, runId);
  await emitNode(emitter, "node_start", "planner");
  const patch = await plannerNode(state, ctx);
  Object.assign(state, patch);
  state.budget = ctx.budget;
  await emitNode(emitter, "node_end", "planner");
  state.status = "awaiting_approval";
  await db
    .update(researchRuns)
    .set({ stateJson: state, planJson: state.plan, status: "awaiting_approval", updatedAt: new Date() })
    .where(eq(researchRuns.id, runId));
  return state;
}

/** Full research loop, streamed node-by-node with per-node checkpointing. */
export async function runResearch(state: ResearchState, emitter: Emitter, runId: number): Promise<ResearchState> {
  state.approved = true;
  state.status = "researching";
  const ctx = makeContext(state, emitter, runId);
  const graph = buildResearchGraph();

  for await (const y of graph.stream(state, ctx, {
    checkpoint: async (s) => {
      await db.update(researchRuns).set({ stateJson: s, updatedAt: new Date() }).where(eq(researchRuns.id, runId));
    },
  })) {
    if (y.kind === "node_start") {
      await emitNode(emitter, "node_start", y.node);
    } else if (y.kind === "node_end") {
      await emitNode(emitter, "node_end", y.node);
    } else if (y.kind === "budget_exceeded") {
      await emitter.emit({ type: "status", status: "finalizing" });
    } else if (y.kind === "error") {
      await emitter.emit({ type: "error", message: `${y.node}: ${y.message}` });
    }
  }

  state.budget = ctx.budget;
  const finalStatus: Status = (state.status as Status) === "error" ? "error" : "done";
  await db
    .update(researchRuns)
    .set({
      stateJson: state,
      reportMarkdown: state.report,
      confidence: state.confidence,
      costUsd: Math.round(ctx.budget.costUsd * 10000) / 10000,
      tokensUsed: ctx.budget.tokensUsed,
      latencyMs: ctx.budget.latencyMs,
      status: finalStatus,
      updatedAt: new Date(),
    })
    .where(eq(researchRuns.id, runId));
  return state;
}

async function emitNode(emitter: Emitter, kind: "node_start" | "node_end", node: string): Promise<void> {
  const meta = NODE_META[node] ?? { agent: node, label: node };
  const event: AgentEvent =
    kind === "node_start"
      ? { type: "node_start", node, agent: meta.agent, label: meta.label }
      : { type: "node_end", node, agent: meta.agent };
  await emitter.emit(event);
}
