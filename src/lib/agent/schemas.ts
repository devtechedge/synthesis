import { z } from "zod";

/**
 * Synthesis — agent domain model.
 * Every agent I/O is structured & validated (agentic-loop principle #6).
 */

/* ------------------------------- Budgets ------------------------------- */

export const MAX_STEPS = 24;
export const MAX_TOKENS = 60000;
export const COST_CAP_USD = 1.0;
export const MAX_REVISIONS = 2;
export const FAITHFULNESS_THRESHOLD = 0.78;
export const MAX_PARALLEL_RESEARCHERS = 4;

export const BudgetSchema = z.object({
  stepsUsed: z.number().default(0),
  tokensUsed: z.number().default(0),
  costUsd: z.number().default(0),
  latencyMs: z.number().default(0),
  maxSteps: z.number().default(MAX_STEPS),
  maxTokens: z.number().default(MAX_TOKENS),
  maxCostUsd: z.number().default(COST_CAP_USD),
  revisionsUsed: z.number().default(0),
});
export type Budget = z.infer<typeof BudgetSchema>;

/* ------------------------------- Plan ---------------------------------- */

export const SubQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  strategy: z.string(),
  evidenceType: z.string().default("mixed"),
  status: z.enum(["pending", "running", "done", "failed"]).default("pending"),
});
export type SubQuestion = z.infer<typeof SubQuestionSchema>;

export const PlanSchema = z.object({
  title: z.string(),
  rationale: z.string(),
  subQuestions: z.array(SubQuestionSchema),
  outline: z.array(z.string()),
});
export type Plan = z.infer<typeof PlanSchema>;

/* ------------------------------ Evidence ------------------------------- */

export const SourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  credibility: z.number().min(0).max(1),
  publishedDate: z.string().optional(),
  domain: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const EvidenceSchema = z.object({
  id: z.string(),
  subQuestionId: z.string(),
  claim: z.string(),
  snippet: z.string(),
  source: SourceSchema,
  score: z.number().min(0).max(1),
});
export type EvidenceItem = z.infer<typeof EvidenceSchema>;

/* ----------------------------- Reflection ------------------------------ */

export const ReflectionSchema = z.object({
  faithfulness: z.number().min(0).max(1),
  unsupportedClaims: z.array(z.string()).default([]),
  missingEvidence: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([]),
  recommendation: z.enum(["accept", "revise"]).default("accept"),
  notes: z.string().default(""),
});
export type Reflection = z.infer<typeof ReflectionSchema>;

/* ------------------------------- State --------------------------------- */

export const StatusSchema = z.enum([
  "queued",
  "planning",
  "awaiting_approval",
  "researching",
  "synthesizing",
  "reviewing",
  "finalizing",
  "done",
  "error",
]);
export type Status = z.infer<typeof StatusSchema>;

export const ResearchStateSchema = z.object({
  threadId: z.string(),
  brief: z.string(),
  constraints: z.record(z.string(), z.unknown()).default({}),
  status: StatusSchema.default("queued"),
  approved: z.boolean().default(false),
  plan: PlanSchema.nullable().default(null),
  subQuestions: z.array(SubQuestionSchema).default([]),
  evidence: z.array(EvidenceSchema).default([]),
  report: z.string().default(""),
  confidence: z.number().default(0),
  reflection: ReflectionSchema.nullable().default(null),
  credibilityDistribution: z.record(z.string(), z.number()).default({}),
  budget: BudgetSchema,
  log: z.array(z.string()).default([]),
});
export type ResearchState = z.infer<typeof ResearchStateSchema>;

/* ------------------------------- Events -------------------------------- */
/* Discriminated union consumed by the streaming UI (SSE). */

export type AgentEvent =
  | { type: "status"; status: Status }
  | { type: "node_start"; node: string; agent: string; label: string }
  | { type: "node_end"; node: string; agent: string; summary?: string }
  | { type: "plan_ready"; plan: Plan }
  | { type: "researcher"; subQuestionId: string; question: string; status: SubQuestion["status"] }
  | { type: "tool_call"; tool: string; args: Record<string, unknown>; result: unknown; latencyMs: number }
  | { type: "evidence"; evidence: EvidenceItem }
  | { type: "report_chunk"; delta: string }
  | { type: "reflection"; reflection: Reflection }
  | { type: "token"; delta: string }
  | { type: "final"; confidence: number; costUsd: number; tokens: number; latencyMs: number; reportLength: number }
  | { type: "error"; message: string };

/* ----------------------------- Run summary ----------------------------- */

export type RunSummary = {
  id: number;
  threadId: string;
  brief: string;
  status: Status;
  confidence: number | null;
  costUsd: number | null;
  tokensUsed: number | null;
  latencyMs: number | null;
  createdAt: string | null;
  engine: string | null;
};

export const ENGINES = ["langgraph", "crewai", "autogen"] as const;
export type EngineName = (typeof ENGINES)[number];
