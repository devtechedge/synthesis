import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  serial,
  pgEnum,
  real,
} from "drizzle-orm/pg-core";

/**
 * Synthesis — persistence layer.
 *
 * Portability note: pgvector is NOT assumed to be installed on the target
 * Postgres (many Vercel Postgres / Neon free DBs don't have it). Embeddings are
 * therefore stored as JSONB float arrays and cosine similarity is computed
 * in-engine (see src/lib/agent/rag.ts). This keeps the system free-tier portable.
 */

export const runStatus = pgEnum("run_status", [
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

export const researchRuns = pgTable("research_runs", {
  id: serial("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  brief: text("brief").notNull(),
  constraints: jsonb("constraints").$type<Record<string, unknown>>().default({}),
  status: runStatus("status").notNull().default("queued"),
  /** Full LangGraph-style checkpoint state (resumable / replayable). */
  stateJson: jsonb("state_json"),
  /** Final assembled plan object. */
  planJson: jsonb("plan_json"),
  reportMarkdown: text("report_markdown"),
  confidence: real("confidence"),
  costUsd: real("cost_usd").default(0),
  tokensUsed: integer("tokens_used").default(0),
  latencyMs: integer("latency_ms").default(0),
  engine: text("engine").notNull().default("langgraph"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const runEvents = pgTable("run_events", {
  id: serial("id").primaryKey(),
  runId: integer("run_id")
    .notNull()
    .references(() => researchRuns.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  agent: text("agent"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  tokens: integer("tokens").default(0),
  costUsd: real("cost_usd").default(0),
  latencyMs: integer("latency_ms").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => researchRuns.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title"),
  content: text("content"),
  /** JSONB float[] embedding (portable — no pgvector required). */
  embedding: jsonb("embedding").$type<number[]>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const evidence = pgTable("evidence", {
  id: serial("id").primaryKey(),
  runId: integer("run_id")
    .notNull()
    .references(() => researchRuns.id, { onDelete: "cascade" }),
  subQuestionId: text("sub_question_id").notNull(),
  claim: text("claim").notNull(),
  citation: text("citation").notNull(),
  url: text("url"),
  credibility: real("credibility").default(0.5),
  score: real("score").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memories = pgTable("memories", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("public"),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  embedding: jsonb("embedding").$type<number[]>(),
  importance: real("importance").default(0.5),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const evalRuns = pgTable("eval_runs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  passed: integer("passed").notNull(),
  total: integer("total").notNull(),
  score: real("score").notNull(),
  detailJson: jsonb("detail_json").$type<unknown[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
