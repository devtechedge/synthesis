/**
 * Synthesis — graph engine.
 *
 * A deliberately small, real state-machine executor in the LangGraph tradition:
 * nodes, fixed edges, conditional (routing) edges, an explicit END, a start node,
 * step-budget enforcement, and per-node checkpointing. This is the structural
 * backbone that guarantees termination (principle #1: the loop is a graph, not a
 * `while` statement) and resumability (principle #5).
 */

import type { Budget } from "./schemas";

export const END = "__end__";

export type NodeFn<S, C> = (state: S, ctx: C) => Promise<Partial<S>>;
export type Router<S> = (state: S) => string;

export type GraphYield =
  | { kind: "node_start"; node: string }
  | { kind: "node_end"; node: string }
  | { kind: "budget_exceeded"; node: string }
  | { kind: "error"; node: string; message: string };

export interface RunContext {
  budget: Budget;
  runId: number;
}

export interface StreamOpts<S> {
  startNode?: string;
  checkpoint?: (state: S) => Promise<void>;
}

export class StateGraph<S extends { budget: Budget } & Record<string, unknown>, C extends RunContext> {
  private nodes = new Map<string, { run: NodeFn<S, C>; next?: Router<S> }>();
  private entry = "";

  addNode(name: string, run: NodeFn<S, C>): this {
    this.nodes.set(name, { run });
    return this;
  }
  addEdge(from: string, to: string): this {
    const n = this.nodes.get(from);
    if (n) n.next = () => to;
    return this;
  }
  addConditional(from: string, router: Router<S>): this {
    const n = this.nodes.get(from);
    if (n) n.next = router;
    return this;
  }
  setEntry(name: string): this {
    this.entry = name;
    return this;
  }

  /** Merge a node's patch into state: arrays concat, scalars replace. */
  private merge(state: S, patch: Partial<S>): S {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      const cur = (state as Record<string, unknown>)[k];
      if (Array.isArray(v) && Array.isArray(cur)) {
        (state as Record<string, unknown>)[k] = [...cur, ...(v as unknown[])];
      } else {
        (state as Record<string, unknown>)[k] = v;
      }
    }
    return state;
  }

  async *stream(state: S, ctx: C, opts: StreamOpts<S> = {}): AsyncGenerator<GraphYield> {
    let current = opts.startNode ?? this.entry;
    let safety = 0;
    while (current !== END) {
      if (++safety > ctx.budget.maxSteps + 4) {
        yield { kind: "error", node: current, message: "runaway guard tripped" };
        break;
      }
      const node = this.nodes.get(current);
      if (!node) {
        yield { kind: "error", node: current, message: `unknown node "${current}"` };
        break;
      }
      ctx.budget.stepsUsed += 1;

      // Hard budget guard: route to finalizer (graceful degradation), then END.
      if (ctx.budget.tokensUsed > ctx.budget.maxTokens || ctx.budget.costUsd > ctx.budget.maxCostUsd) {
        yield { kind: "budget_exceeded", node: current };
        if (current !== "finalizer" && this.nodes.has("finalizer")) current = "finalizer";
        else break;
      }

      yield { kind: "node_start", node: current };
      try {
        const patch = await node.run(state, ctx);
        this.merge(state, patch);
        state.budget = ctx.budget;
        if (opts.checkpoint) await opts.checkpoint(state);
        yield { kind: "node_end", node: current };
        current = node.next ? node.next(state) : END;
      } catch (e) {
        yield { kind: "error", node: current, message: e instanceof Error ? e.message : String(e) };
        if (current !== "finalizer" && this.nodes.has("finalizer")) current = "finalizer";
        else break;
      }
    }
  }
}
