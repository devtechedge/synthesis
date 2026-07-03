# 🧠 Synthesis — Autonomous Multi-Agent Research & Intelligence Platform

> **A chief-architect-grade, Vercel-native agentic system.** A senior-portfolio build that demonstrates mastery across **LangGraph, LangChain, CrewAI, AutoGen, MCP, advanced RAG, agentic-loop engineering, observability, evaluation, streaming UX, human-in-the-loop orchestration, cost engineering, and CI/CD** — all deployable on **GitHub + Vercel (free tier only)**, with **zero paid backend services** (no Supabase, Netlify, Render, or Railway).

---

## 0. How to use this document

This is a **master build specification & executable prompt**. Hand it to an agentic coding tool (Claude Code, Cursor, Devin, Codex) or a small engineering team and say:

> *"Build the project described below, end to end, exactly to this spec. Do not skip the evaluation, observability, or CI sections. Prefer the TypeScript/Vercel-native path for the live deployment, and ship the Python reference engines as containerized blueprints. Make it deployable on Vercel with free-tier infrastructure only."*

Read sections **2 (Principles)**, **6 (Agent design)**, and **7 (Agentic loops)** first — they encode the engineering philosophy the rest of the system obeys.

---

## 1. Objective & success criteria

**Objective.** Ship a production-grade, recruiter-demoable **autonomous research platform**. A user types a complex question (e.g., *"Compare the 2026 viability of small-modular-reactor vs. molten-salt reactor supply chains"*) and a **crew of specialized agents**, orchestrated by a LangGraph state machine, **plans → searches → retrieves → evaluates source credibility → synthesizes → critiques → revises** and returns a **cited, long-form report with confidence scores and a live execution timeline**.

**Why this product.** Deep-research orchestration is the single most impressive, defensible demo of agent engineering: it forces you to solve planning, tool use, RAG, multi-agent collaboration, reflection, streaming, and human-in-the-loop *in one cohesive loop* — and it produces a visually rich artifact (cited report + agent-graph animation) that a non-technical recruiter instantly understands.

**Definition of "done / senior":**
1. Deploys on **Vercel free tier + GitHub only**. No paid backend. Recruiter can click the deployed URL and watch a real research run streaming in real time.
2. The agentic loop is **bounded, observable, resumable, and recoverable** — never an uncontrolled `while True`.
3. Every agent I/O is **structured** (Zod), **traced** (Langfuse), **evaluated** (promptfoo/RAGAS gate in CI), and **cost-accounted**.
4. The orchestration engine is **swappable** behind one interface: the live engine is **LangGraph.js**; **CrewAI** and **AutoGen** ship as **Python reference engines** in `/engines/python` to prove framework breadth.
5. Includes **eval suite, e2e tests, GitHub Actions CI, architecture docs, and a one-command local dev experience.**

---

## 2. Guiding engineering principles — *Agentic-Loop Engineering*

These are non-negotiable design laws. Every subsystem obeys them.

1. **The loop is a graph, not a `while` statement.** All iteration is modeled as a LangGraph state machine with explicit nodes, edges, conditional routing, and subgraphs. Termination is structural (`END`, max-steps reducer), never implicit.
2. **Plan → Act → Observe → Reflect (ReAct + Reflexion).** Agents reason about *which* tool, execute, observe structured results, then a dedicated reflection step scores progress and decides continue/revise/stop.
3. **Bounded autonomy with a budget.** Every run has a hard ceiling: max steps, max tokens, max cost (USD), and wall-clock. Hitting a budget triggers graceful degradation, not a crash.
4. **Human-in-the-loop as a first-class edge.** The plan node emits a LangGraph **interrupt**; the UI shows the plan and waits for **Approve / Edit / Redirect** before the expensive deep-research phase. State resumes from a persisted checkpoint.
5. **Idempotent, resumable state.** All agent state lives in an external checkpointer (Postgres), keyed by `thread_id`. Any run can be paused, resumed, replayed, or forked. Serverless cold starts cannot lose progress.
6. **Structured everything.** Inputs and outputs are Zod/Pydantic schemas. LLMs are forced to tool-call or JSON-schema outputs. No free-text parsing of model chatter.
7. **Streaming-first.** Token deltas *and* structured state deltas stream to the client (SSE via the Vercel AI SDK). The user sees the graph executing, not a spinner.
8. **Observe before you optimize.** Every LLM/tool call is traced with latency, tokens, cost, and model. You cannot improve what you cannot see.
9. **Eval-driven development.** Prompts and retrieval are versioned and gated by an automated eval suite that runs in CI on every PR. A regression in answer faithfulness blocks the merge.
10. **Fail safe, fail cheap.** Retry with exponential backoff + jitter, circuit breakers per tool, semantic caching of identical sub-queries, and automatic **model fallback** (frontier → fast/cheap) so a quota error degrades rather than breaks the run.
11. **Separation of concerns, not separation of science projects.** Clean interfaces: `Orchestrator`, `Agent`, `Tool`, `Retriever`, `MemoryStore`, `Checkpointer`, `Tracer`. The 5 frameworks behind these interfaces are *configurations*, not the architecture.

---

## 3. Product overview — what a recruiter sees

**The flagship workflow — "Deep Research Run":**

1. **Brief intake** — user enters a research question, optional constraints (depth, recency, region, tone), and a model preference.
2. **Planner** — decomposes the question into a research plan: sub-questions, search strategies, required evidence types, and a synthesis outline. → **HITL interrupt**: user approves/edits.
3. **Researcher crew (parallel fan-out)** — multiple researcher agents, each owning sub-questions, run concurrently: web-search tool → page-fetch/Reader → relevance scoring → evidence extraction → credibility grading.
4. **Synthesizer** — merges evidence, resolves conflicts, drafts the cited report section-by-section (streaming).
5. **Critic / Fact-checker** — audits claims against source evidence, flags unsupported statements, computes a **confidence score** and a **source-quality distribution**.
6. **Finalization** — returns a **Markdown report + citations + a confidence/cost/latency dashboard + a replayable execution trace.**

**UX surface:** a premium dark "mission control" UI — animated agent-graph (nodes light up as they execute), streaming token view, a live tool-call timeline, a collapsible plan-approval panel, and a final report reader with hover-to-see-source citations.

---

## 4. System architecture

```
                       ┌──────────────────────────────────────────────┐
                       │                 VERCEL EDGE/NODE                │
                       │   Next.js App Router (RSC + Server Actions)     │
                       │                                                │
   Browser ◀──SSE──── │  /research (UI)    /api/run   /api/stream       │
   (AI SDK)           │       │                │            │           │
                      │       └────►  ORCHESTRATION LAYER  ◄────┘       │
                      └───────────────────────┬────────────────────────┘
                                              │
        ┌─────────────────────────────────────┼──────────────────────────────────┐
        ▼                                     ▼                                  ▼
┌───────────────────┐               ┌────────────────────┐           ┌────────────────────┐
│  LangGraph.js     │  (default)    │  Engines (swappable)│           │   Tool / MCP bus    │
│  state machine    │◄──────────────┤  • langgraph (TS)  │◄──────────┤  web_search, reader,│
│  + subgraphs      │               │  • crewai (PY ref) │           │  compute, mcp_tools │
└────────┬──────────┘               │  • autogen (PY ref)│           └──────────┬──────────┘
         │                          └─────────┬──────────┘                      │
         ▼                                    ▼                                 ▼
┌───────────────────┐               ┌────────────────────┐           ┌────────────────────┐
│  Agent layer      │               │  RAG / Memory      │           │  Observability     │
│  Planner,         │               │  pgvector + BM25,  │           │  Langfuse traces,  │
│  Researchers,     │               │  rerank, hybrid,   │           │  cost/token/lat,   │
│  Synth, Critic    │               │  short+long memory │           │  eval gates (CI)    │
└───────────────────┘               └────────────────────┘           └────────────────────┘
         │                                   │
         ▼                                   ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  PERSISTENCE (Vercel-native, free tier):                                          │
│  Vercel Postgres (Neon + pgvector) ─ runs, checkpoints, vectors, long-term memory │
│  Vercel KV (Upstash Redis) ─ LangGraph checkpointer, rate limits, semantic cache  │
│  Vercel Blob ─ generated report artifacts (PDF/MD)                                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Layer responsibilities:** UI/API (Next.js) → Orchestration (one `Orchestrator` interface, multiple engines) → Agents (roles) → Tools/MCP → RAG & Memory → Persistence & Observability. Every layer is a typed interface; engines/frameworks plug in as adapters.

---

## 5. Tech stack & skills matrix

| Domain | Tooling (prove you know it) |
|---|---|
| **Frontend** | Next.js App Router, React Server Components, Server Actions, Tailwind v4, shadcn/ui, Framer Motion (agent-graph anim), Vercel AI SDK (`useChat`/streaming UI) |
| **Orchestration (live)** | **LangGraph.js** — StateGraph, subgraphs, conditional edges, `interrupt`, checkpointer, `astream_events` |
| **Agent primitives** | **LangChain.js** — LCEL, prompt templates, document loaders, embeddings, retrievers, output parsers |
| **Multi-agent breadth (Python ref)** | **CrewAI** (role/task/process crews), **AutoGen** (GroupChat/Selector conversational agents), **LangGraph (Python)** — shipped in `/engines/python`, Dockerized, behind the same `Orchestrator` REST contract |
| **Interop protocols** | **MCP** (Model Context Protocol — expose platform tools as an MCP server; consume external MCP servers), **A2A** (agent-to-agent messaging between engines), **OpenAI-compatible tool/function calling** |
| **RAG** | pgvector embeddings + BM25 keyword, **hybrid fusion** (RRF), query decomposition, multi-query, **cross-encoder reranking**, chunking strategies (semantic/parent-document), metadata filtering |
| **Memory** | Short-term = thread/checkpoint state; Long-term = semantic episodic + user-profile memory in pgvector with decay/recency scoring |
| **Models** | BYO-key via Vercel env. **Routing**: fast/cheap (Groq Llama / GPT-4o-mini / Claude Haiku) for routing/classification/extraction; frontier (Claude Sonnet/Opus, GPT-4o) for planning & synthesis. **xAI/Gemini** as alternates |
| **Tools** | Tavily/Brave/Serper (web search), Jina Reader (page fetch), Wolfram|Alpha, custom REST tools, MCP tool servers |
| **Streaming** | Server-Sent Events via Vercel AI SDK; token streaming + structured state/event streaming |
| **Observability** | **Langfuse** (traces, spans, token/cost/latency dashboards, prompt versioning), structured logs |
| **Eval & testing** | **promptfoo** + **RAGAS** (faithfulness, answer relevance, context precision), Vitest (unit), Playwright (e2e), **eval gate in CI** |
| **Guardrails** | Zod schemas, structured outputs, input moderation, PII redaction, output safety filters, output citation-validation |
| **Persistence** | Vercel Postgres (Neon + pgvector), Vercel KV (Upstash Redis), Vercel Blob |
| **DevEx/CI** | pnpm/turbo monorepo, TypeScript strict, ESLint + Prettier, Husky pre-commit, **GitHub Actions** (lint → typecheck → test → eval gate → build), Changesets |
| **Deploy** | Vercel (Edge runtime where possible, Node runtime for graph), 100% free tier |

---

## 6. The multi-agent crew & LangGraph design

**Crew roles (each = a node/subgraph, each a typed agent):**

- **`orchestrator` (supervisor)** — routes the state machine, owns the run budget, decides next agent via conditional edge.
- **`planner`** — decomposes the brief into sub-questions + search strategies + synthesis outline; emits the HITL interrupt.
- **`researcher`** (N, fanned out via `Send` API) — owns a sub-question; tool-calls search→fetch→extract→grade; writes `Evidence` to shared state.
- **`synthesizer`** — drafts cited report sections from accumulated evidence (streams tokens).
- **`critic`** — audits every claim against citations; computes confidence; triggers revision loop if faithfulness < threshold.
- **`fact_checker`** — independent verification pass + source-credibility scoring.
- **`finalizer`** — assembles artifacts, persists report to Blob, emits summary + dashboards.

**Graph sketch (LangGraph.js):**

```
START → planner →[interrupt: approve]→ fan_out(Send→researcher*) → join
       → synthesizer → critic ──(faithfulness<τ)──► synthesizer   # bounded reflection loop
                              └──(ok)──► fact_checker → finalizer → END
```

**Shared state schema (illustrative, Zod-typed):**

```ts
const ResearchState = z.object({
  threadId: z.string(),
  brief: z.string(),
  plan: PlanSchema.nullable(),
  approved: z.boolean(),
  subQuestions: z.array(SubQuestionSchema),
  evidence: z.array(EvidenceSchema),          // accumulated, deduped
  report: ReportSchema.partial(),
  confidence: z.number().min(0).max(1),
  budget: BudgetSchema,                        // stepsUsed, tokensUsed, costUsd
  reflection: ReflectionSchema.nullable(),
  status: z.enum(["planning","approved","researching","synthesizing","reviewing","done","error"]),
});
```

**Control knobs:** `maxSteps`, `maxParallelResearchers`, `faithfulnessThreshold τ`, `costCapUsd`, `recencyBias`. All env/UI configurable.

---

## 7. Agentic-loop engineering (deep dive — read carefully)

This is the part that separates "called the LLM in a loop" from "engineered an agent."

- **ReAct with structured tool selection.** Researchers select tools via forced function-calling (never `regex` over free text). Each tool returns a typed result; the agent reasons over the *schema*, not prose.
- **Reflexion / self-critique loop.** After synthesis, the `critic` produces a structured `Reflection` (unsupported claims, missing evidence, contradictions). If `faithfulness < τ`, route back to `synthesizer` with the reflection appended to state. **Hard ceiling** on revisions (e.g., 3) — then degrade gracefully and annotate the report with the residual uncertainty.
- **Termination is structural.** `END` is reached by: plan complete + evidence sufficient, OR budget exhausted, OR critic sign-off. Never an open loop.
- **Resumability & replay.** Checkpoints in Postgres; a run interrupted by a Vercel function timeout resumes from the last checkpoint on the next request. Provide a "replay trace" mode.
- **Concurrency & backpressure.** Researchers fan out via LangGraph `Send`; concurrency is capped; a semaphore + rate limiter (Vercel KV token bucket) protects upstream tool quotas.
- **Error budget & fallbacks.** Per-tool circuit breaker; on model `429/5xx`, retry (exp backoff + jitter) then **downgrade model tier**; if a tool fails N times, mark that evidence path failed and continue (partial results > crash).
- **Determinism where it matters.** Temperature 0 for planner/critic tool-selection; higher for synthesis prose. Seedable for reproducible evals.
- **Semantic caching.** Identical sub-queries (and near-duplicates via embedding similarity) hit a Vercel KV cache to cut cost/latency on overlapping research.

---

## 8. RAG subsystem (retrieval that actually retrieves)

- **Ingestion pipeline:** web page → clean (Reader) → parent-document chunking with semantic boundaries → embed (OpenAI/Voyage) → store in **pgvector** with rich metadata (url, domain, publishedAt, credibility_tier, sub_question_id).
- **Retrieval:** **hybrid** = vector (pgvector) ⊕ BM25 keyword; fused with **Reciprocal Rank Fusion (RRF)**; then **cross-encoder rerank** (Cohere free tier, or scoring fallback); top-k passed to agents.
- **Query rewriting:** the planner emits **multi-query** + **HyDE-style** expansions; researchers run them in parallel and merge.
- **Source quality:** domain credibility tiering + recency weighting; the `fact_checker` down-weights low-credibility sources and surfaces the **source-quality distribution** in the final dashboard.
- **Anti-hallucination:** every claim in the report carries inline citations; the `critic` validates each citation actually supports the claim (faithfulness check via RAGAS).

---

## 9. Memory subsystem

- **Short-term (episodic):** the LangGraph checkpoint = full run state per `thread_id`; enables pause/resume/replay and multi-turn refinement ("now go deeper on section 2").
- **Long-term (semantic):** a `memories` table in pgvector — user preferences, prior research topics, reusable synthesized knowledge — retrieved by similarity at run start and written post-run. Decay by recency × importance.

---

## 10. Tools & the MCP bus

- Built-in tools: `web_search` (Tavily/Brave/Serper — pluggable), `read_url` (Jina Reader), `compute` (Wolfram|Alpha / safe expression evaluator), `save_artifact`, `query_memory`.
- **MCP integration (senior signal):** the platform **exposes its tool set as an MCP server** (so external clients/IDEs can drive the researchers) and **consumes external MCP servers** (e.g., a GitHub MCP, a local files MCP) so the agent's capability surface is extensible without code changes.
- **A2A:** engines can delegate sub-tasks to each other over a typed agent-to-agent message contract — e.g., the LangGraph orchestrator hands a sub-question to a CrewAI crew running in the Python engine.

---

## 11. Streaming & real-time UX

- **Vercel AI SDK** + Server-Sent Events. Two streams multiplexed: (a) **token deltas** from synthesis; (b) **structured state events** (`plan_ready`, `researcher_started/finished`, `tool_called`, `evidence_found`, `critic_score`) that drive the animated agent graph and timeline.
- LangGraph **`astream_events` v2** maps directly onto these UI events. The recruiter sees the system *think*, search, and assemble in real time.

---

## 12. Observability, evaluation & guardrails

- **Tracing (Langfuse):** every LLM + tool call = a span; runs = traces. Dashboards for token/cost/latency per agent, per model, per tool. Prompt versions are tracked for A/B.
- **Eval (promptfoo + RAGAS):** a curated golden set of research queries with expected qualities; metrics: **faithfulness, answer relevance, context precision/recall, citation coverage, cost, latency**. Runs in CI as a **merge gate** (e.g., faithfulness must not drop > X% vs. main).
- **Guardrails:** Zod-validated I/O, input moderation + PII redaction, output safety filter, and a **citation-validation pass** that strips unsupported claims before finalization.

---

## 13. Security & cost engineering

- **Secrets:** all keys in Vercel env vars (server-only). No keys in client bundles. Never hardcode.
- **Rate limiting & abuse:** Vercel KV token-bucket per IP/user; per-run cost cap; demo-mode quotas.
- **Cost optimization:** **model routing** (cheap models for classify/extract/route, frontier for plan/synth), **semantic caching**, **early termination** on sufficient evidence, and **budget telemetry** surfaced live so cost is visible, not accidental.

---

## 14. Data model & persistence (Vercel-native, free tier)

```
runs          (id, thread_id, brief, status, budget_json, created_at, ...)
checkpoints   (thread_id, checkpoint_ns, checkpoint_id, blob)   -- LangGraph Postgres saver
documents     (id, run_id, url, content, embedding vector(1536), metadata jsonb)
evidence      (id, run_id, sub_question_id, claim, citation, credibility, score)
memories      (id, user_id, kind, content, embedding vector(1536), importance, updated_at)
reports       (id, run_id, markdown, confidence, blob_url, cost_usd, latency_ms)
```

Migrations via Drizzle Kit. Vercel KV for checkpointer fast-path, semantic cache, and rate limits.

---

## 15. Repo structure (monorepo)

```
synthesis/
├─ apps/
│  └─ web/                      # Next.js app (Vercel deployment target)
│     ├─ app/                   # routes, /api/run, /api/stream (SSE), /research (UI)
│     ├─ components/            # agent-graph, timeline, report-reader, plan-approval
│     ├─ lib/agents/            # planner, researcher, synthesizer, critic, fact_checker
│     ├─ lib/graph/             # LangGraph state machine + subgraphs + checkpointer
│     ├─ lib/engines/           # Orchestrator interface + langgraph adapter
│     ├─ lib/tools/             # web_search, reader, compute, mcp client/server
│     ├─ lib/rag/               # embeddings, hybrid retrieval, rerank, memory
│     ├─ lib/eval/              # promptfoo + RAGAS harness & golden set
│     └─ lib/obs/               # Langfuse tracer, cost/token accounting
├─ engines/
│  └─ python/                   # CrewAI + AutoGen + LangGraph(PY) reference engines
│     ├─ crewai_engine/         # role/task/process crew implementing Orchestrator REST
│     ├─ autogen_engine/        # GroupChat conversational crew implementing Orchestrator REST
│     ├─ langgraph_engine/      # python graph for parity comparisons
│     └─ Dockerfile             # containerized; optional self-host/free-tier
├─ packages/
│  ├─ contracts/                # shared Zod/JSON schemas (agent protocol, MCP types)
│  └─ ui/                       # shared design system
├─ eval/                        # golden datasets, promptfoo configs
├─ .github/workflows/           # ci.yml: lint→typecheck→test→eval-gate→build
├─ docs/                        # ARCHITECTURE.md, AGENTIC_LOOPS.md, DEPLOY.md, ADRs
└─ README.md
```

---

## 16. Deployment — Vercel + GitHub only (free tier)

- **Repo** on GitHub → **Vercel import** → auto deploys on push. Preview deploys per PR.
- **Infra (all Vercel-integrated, free):** Vercel Postgres (Neon + pgvector), Vercel KV (Upstash Redis), Vercel Blob.
- **Runtime:** Edge for the streaming API where feasible; Node for the LangGraph runtime (graph + checkpointer). Tune function memory/timeout for long research runs; rely on **checkpointer resumability** to survive serverless limits.
- **Models BYO-key:** user/recruiter enters an OpenAI/Anthropic/Groq key in the UI (stored server-side in an encrypted cookie / Vercel KV), or runs **demo mode** using free-tier Groq. Document `.env.example`:
  ```
  OPENAI_API_KEY= ANTHROPIC_API_KEY= XAI_API_KEY= GOOGLE_API_KEY=
  TAVILY_API_KEY= BRAVE_API_KEY= SERPER_API_KEY= JINA_API_KEY=
  COHERE_API_KEY= WOLFRAM_APP_ID=
  LANGFUSE_PUBLIC_KEY= LANGFUSE_SECRET_KEY=
  POSTGRES_URL= KV_REST_API_URL= KV_REST_API_TOKEN= BLOB_READ_WRITE_TOKEN=
  ```
- **Python engines** are *optional*: runnable via Docker locally; not required for the Vercel demo. The README documents how to enable them for the full multi-framework showcase.

---

## 17. CI/CD & DevEx

- **GitHub Actions** (`ci.yml`): `pnpm install → lint → typecheck (tsc --noEmit) → vitest → build → promptfoo eval gate → (Playwright smoke on preview)`. A faithfulness/cost regression **blocks merge**.
- **Pre-commit (Husky):** lint-staged, format, typecheck. **Changesets** for versioning. Branch protection + required checks on `main`.

---

## 18. Delivery roadmap (phased)

1. **Foundations** — monorepo, Next.js shell, Drizzle schema, Vercel Postgres/KV wiring, env + demo mode, Langfuse tracing, health + auth skeleton.
2. **Single-agent loop** — one LangGraph ReAct researcher with web_search + reader; streaming UI; checkpointer + resume; cost/latency dashboards.
3. **RAG** — pgvector ingest, hybrid retrieval + rerank, memory store.
4. **Multi-agent crew** — planner (HITL interrupt), fan-out researchers, synthesizer, critic reflection loop, fact-checker, finalizer.
5. **MCP + A2A** — expose/consume MCP tools; Python reference engines (CrewAI/AutoGen) behind Orchestrator REST.
6. **Quality bars** — promptfoo/RAGAS eval suite, golden set, CI gate, guardrails, e2e tests, docs + ADRs, polished UI, deploy + record a 90-second demo.

---

## 19. Definition of done + demo script

**Done when:** deployed on Vercel (free tier) with a public URL; a real research query runs end-to-end with live streaming, HITL plan approval, cited report, confidence score, cost/latency dashboard, replayable trace, passing CI eval gate, and full docs.

**Recruiter demo (90s):** open the URL → enter a hard research question → watch the plan appear and **approve it** → watch researchers fan out (animated graph + tool timeline) → watch the cited report stream in → show the confidence/cost dashboard and the eval-gate passing in CI → point to the repo (Python CrewAI/AutoGen engines + architecture docs).

---

## 20. Stretch / "go further" (chief-architect ambition)

- **Multi-tenant** orgs/projects with usage quotas and per-team model routing.
- **Agent marketplace** — declare crews as YAML; the graph compiles from the spec.
- **Eval-as-a-feature** — users see *why* an answer is trustworthy (per-claim faithfulness).
- **Self-hosted control plane** (Fly.io free-tier or local) for the Python engines + open-source Langfuse, to keep *everything* free/open.
- **Fine-tuned reranker / small classifier** for routing via a free GPU host to cut latency.

---

## 21. Constraints recap (hard rules)

- ✅ **GitHub + Vercel only** for the live deployment. ✅ **Free tiers only** — Vercel Postgres/KV/Blob + free-tier model providers. ❌ **No paid backends** (Supabase, Netlify, Render, Railway, Heroku) required for the demo. ✅ Python engines (CrewAI/AutoGen) optional/containerized — never a blocker for the Vercel demo. ✅ Everything observable, evaluable, streamed, and structured.

---

*Build it like the chief architect you are: loops are graphs, autonomy is bounded, every token is observed, every claim is cited, and the whole thing deploys for free on Vercel.* 🚀
