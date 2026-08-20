import { describe, expect, it } from "vitest";
import { criticRouter, createInitialState } from "./engine";
import { MAX_REVISIONS } from "./schemas";

describe("createInitialState", () => {
  it("starts queued, unapproved, empty evidence", () => {
    const s = createInitialState("Compare lithium-ion vs solid-state batteries");
    expect(s.status).toBe("queued");
    expect(s.approved).toBe(false);
    expect(s.evidence).toEqual([]);
    expect(s.brief).toContain("lithium-ion");
  });
});

describe("criticRouter", () => {
  it("loops to synthesizer while revise budget remains", () => {
    const s = createInitialState("q");
    s.reflection = {
      faithfulness: 0.4,
      unsupportedClaims: ["x"],
      missingEvidence: [],
      contradictions: [],
      recommendation: "revise",
      notes: "",
    };
    s.budget.revisionsUsed = 0;
    expect(criticRouter(s)).toBe("synthesizer");
  });

  it("exits to fact_checker after max revisions", () => {
    const s = createInitialState("q");
    s.reflection = {
      faithfulness: 0.4,
      unsupportedClaims: [],
      missingEvidence: [],
      contradictions: [],
      recommendation: "revise",
      notes: "",
    };
    s.budget.revisionsUsed = MAX_REVISIONS + 1;
    expect(criticRouter(s)).toBe("fact_checker");
  });

  it("accepts and continues to fact_checker", () => {
    const s = createInitialState("q");
    s.reflection = {
      faithfulness: 0.95,
      unsupportedClaims: [],
      missingEvidence: [],
      contradictions: [],
      recommendation: "accept",
      notes: "",
    };
    expect(criticRouter(s)).toBe("fact_checker");
  });
});
