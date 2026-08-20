import { describe, expect, it } from "vitest";
import { END, StateGraph, type RunContext } from "./graph";
import { BudgetSchema, type Budget } from "./schemas";

type S = { budget: Budget; log: string[]; status?: string };

function ctx(over: Partial<Budget> = {}): RunContext {
  return { budget: BudgetSchema.parse({ maxSteps: 8, ...over }), runId: 1 };
}

describe("StateGraph", () => {
  it("walks a linear graph to END", async () => {
    const g = new StateGraph<S, RunContext>();
    g.addNode("a", async () => ({ log: ["a"] }));
    g.addNode("b", async () => ({ log: ["b"] }));
    g.setEntry("a");
    g.addEdge("a", "b");
    g.addEdge("b", END);

    const state: S = { budget: ctx().budget, log: [] };
    const kinds: string[] = [];
    for await (const ev of g.stream(state, ctx())) kinds.push(ev.kind);

    expect(state.log).toEqual(["a", "b"]);
    expect(kinds.filter((k) => k === "node_end")).toHaveLength(2);
    expect(kinds).not.toContain("error");
  });

  it("routes budget-exceeded to finalizer then stops", async () => {
    const g = new StateGraph<S, RunContext>();
    g.addNode("research", async () => ({ log: ["research"] }));
    g.addNode("finalizer", async () => ({ log: ["finalizer"], status: "done" }));
    g.setEntry("research");
    g.addEdge("research", "finalizer");
    g.addEdge("finalizer", END);

    const c = ctx({ maxTokens: 10, tokensUsed: 99 });
    const state: S = { budget: c.budget, log: [] };
    const kinds: string[] = [];
    for await (const ev of g.stream(state, c)) kinds.push(ev.kind);

    expect(kinds).toContain("budget_exceeded");
    expect(state.log).toEqual(["finalizer"]);
    expect(state.status).toBe("done");
  });

  it("concatenates array patches instead of replacing them", async () => {
    const g = new StateGraph<S, RunContext>();
    g.addNode("a", async () => ({ log: ["one"] }));
    g.addNode("b", async () => ({ log: ["two"] }));
    g.setEntry("a");
    g.addEdge("a", "b");
    g.addEdge("b", END);

    const state: S = { budget: ctx().budget, log: ["zero"] };
    for await (const _ of g.stream(state, ctx())) {
      /* drain */
    }
    expect(state.log).toEqual(["zero", "one", "two"]);
  });
});
