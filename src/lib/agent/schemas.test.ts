import { describe, expect, it } from "vitest";
import {
  BudgetSchema,
  EvidenceSchema,
  PlanSchema,
  ReflectionSchema,
  ResearchStateSchema,
  SubQuestionSchema,
} from "./schemas";

describe("SubQuestionSchema", () => {
  it("coerces invented LLM status strings to pending", () => {
    const parsed = SubQuestionSchema.parse({
      id: "q1",
      question: "What is TRL of SMRs?",
      strategy: "literature review",
      status: "in_progress",
    });
    expect(parsed.status).toBe("pending");
  });

  it("keeps valid statuses", () => {
    expect(
      SubQuestionSchema.parse({
        id: "q1",
        question: "x",
        strategy: "y",
        status: "done",
      }).status,
    ).toBe("done");
  });
});

describe("EvidenceSchema", () => {
  it("rejects credibility outside 0–1", () => {
    expect(() =>
      EvidenceSchema.parse({
        id: "e1",
        subQuestionId: "q1",
        claim: "claim",
        snippet: "snip",
        source: { url: "https://nasa.gov/x", title: "NASA", credibility: 1.4 },
        score: 0.9,
      }),
    ).toThrow();
  });

  it("accepts a well-formed evidence item", () => {
    const item = EvidenceSchema.parse({
      id: "e1",
      subQuestionId: "q1",
      claim: "SMRs are at TRL 6",
      snippet: "IAEA roadmap",
      source: { url: "https://iaea.org/x", title: "IAEA", credibility: 0.9, domain: "iaea.org" },
      score: 0.8,
    });
    expect(item.source.credibility).toBe(0.9);
  });
});

describe("PlanSchema / ReflectionSchema / BudgetSchema", () => {
  it("parses a planner payload", () => {
    const plan = PlanSchema.parse({
      title: "SMR viability",
      rationale: "need TRL, cost, policy",
      subQuestions: [{ id: "q1", question: "TRL?", strategy: "papers" }],
      outline: ["intro", "cost"],
    });
    expect(plan.subQuestions).toHaveLength(1);
    expect(plan.subQuestions[0].status).toBe("pending");
  });

  it("defaults reflection recommendation to accept", () => {
    const r = ReflectionSchema.parse({ faithfulness: 0.9 });
    expect(r.recommendation).toBe("accept");
    expect(r.unsupportedClaims).toEqual([]);
  });

  it("fills budget defaults", () => {
    const b = BudgetSchema.parse({});
    expect(b.maxSteps).toBe(24);
    expect(b.maxCostUsd).toBe(1);
    expect(b.stepsUsed).toBe(0);
  });
});

describe("ResearchStateSchema", () => {
  it("parses a queued initial state", () => {
    const state = ResearchStateSchema.parse({
      threadId: "abc",
      brief: "Compare Li-ion vs solid-state",
      budget: {},
    });
    expect(state.status).toBe("queued");
    expect(state.approved).toBe(false);
    expect(state.evidence).toEqual([]);
  });
});
