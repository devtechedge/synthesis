# Synthesis — Autonomous Multi-Agent Research Platform

> A Vercel-native, **free-tier-only** agentic research system. A recruiter can open the
> deployed URL, type a hard research question, approve the plan, and watch a crew of
> agents **plan → research → synthesize → critique → finalize** a **cited, confidence-scored
> report** streaming in real time — with a live agent graph, telemetry dashboard, and a
> replayable execution timeline.

Built to demonstrate **senior-level agentic-loop engineering**: the loop is a graph, autonomy
is bounded, every token is observed, every claim is cited, and the whole thing deploys for
free on **GitHub + Vercel**.

---

## ✨ What it does

1. **Brief** — you enter a complex research question.
2. **Planner** — decomposes it into research vectors (sub-questions + strategies). The run
   then **pauses** for **human-in-the-loop approval**.
3. **Research crew (parallel fan-out)** — researcher agents call tools (`web_search`,
   `read_url`), grade relevance, extract typed evidence, and ingest it into the RAG corpus.
4. **Synthesizer** — drafts a **cited Markdown report**, streamed token-by-token.
5. **Critic (Reflexion)** — scores faithfulness; if below threshold, it loops the
   synthesizer (bounded). You literally see the revision pass in the graph.
6. **Fact-checker** — audits source credibility.
7. **Finalizer** — assembles artifacts and emits a **confidence score + cost/latency dashboard**.

Everything is **persisted & replayable**: every event is stored, so any past run can be
re-opened and its full execution replayed.

---

## 🧠 Agentic-loop engineering principles (actually enforced)

| Principle | How Synthesis implements it |
|---|---|
| **The loop is a graph, not a `while`** | A real `StateGraph` executor (`src/lib/agent/graph.ts`): nodes, conditional edges, explicit `END`, structural termination. |
| **Plan → Act → Observe → Reflect** | ReAct tool-selection + a dedicated Reflexion critic node with a bounded revision loop. |
| **Bounded autonomy + budget** | Hard caps: max steps, max tokens, max cost (USD), wall-clock. Breach → graceful finalization, never a crash. |
| **Human-in-the-loop** | The planner emits a checkpoint; the run suspends at `awaiting_approval` and resumes on approval. |
| **Resumable / idempotent state** | Full state checkpointed to Postgres after every node; runs resume from the last checkpoint. |
| **Structured everything** | All agent I/O is Zod-validated; LLMs are forced to JSON. |
| **Streaming-first** | SSE token deltas **and** structured state events drive the live graph + timeline. |
| **Observe before optimize** | Every LLM/tool call is a traced span with latency/tokens/cost. |
| **Eval-driven** | `/api/eval` golden-set harness + a CI gate that fails the build on regression. |
| **Fail safe, fail cheap** | Retry/backoff, per-tool error isolation, automatic model fallback path, partial results over crashes. |

---

## 🏗️ Architecture

```
Browser ──SSE──▶ Next.js (App Router) ──▶ Orchestration (StateGraph)
                                              │
        ┌──────────────┬──────────────────────┼───────────────────────┐
        ▼              ▼                      ▼                       ▼
   Agent crew      Tools / MCP bus        RAG / Memory           Observability
   planner         web_search, read_url,  JSONB embeddings,      event store +
   researcher      compute, query_memory  cosine retrieval,      cost/token/lat
   synthesizer                            long-term memory        spans
   critic
   fact_checker
   finalizer
        │
        ▼
   Postgres: runs · checkpoints · events · documents · evidence · memories · eval_runs
```

**Swappable engine contract.** Everything sits behind a small set of interfaces
(`Orchestrator`/`Agent`/`Tool`/`Retriever`). The default engine is a TypeScript
**LangGraph-style** state machine. CrewAI / AutoGen backends plug in by implementing the same
`runResearch` / `planResearch` contract.

### Portability note (no pgvector required)
Embeddings are stored as **JSONB float arrays** with cosine similarity computed in-engine, so
the system runs on **any** Vercel Postgres / Neon free DB. (Swap to pgvector + ANN later — the
`retrieve()` interface stays identical.)

---

## 🗂️ Key source

```
src/
├─ db/schema.ts                 # Drizzle schema (runs, events, evidence, memories, eval_runs)
├─ lib/agent/
│  ├─ schemas.ts                # Zod state + AgentEvent union (the agent protocol)
│  ├─ llm.ts                    # OpenAI-compatible client + deterministic simulated mode
│  ├─ tools.ts                  # web_search / read_url / compute / query_memory
│  ├─ rag.ts                    # embeddings, ingest, hybrid cosine retrieve, memory
│  ├─ graph.ts                  # StateGraph executor (nodes, edges, budget, checkpoints)
│  ├─ agents.ts                 # planner, researcher, synthesizer, critic, fact-checker, finalizer
│  ├─ engine.ts                 # buildResearchGraph + planResearch (HITL) + runResearch (stream)
│  └─ tracer.ts                 # observability emitter (SSE + durable event store + cost spans)
├─ app/api/
│  ├─ run/route.ts              # POST create+plan · GET list runs
│  ├─ run/[id]/route.ts         # GET run detail + replayable events + evidence
│  ├─ run/[id]/approve/route.ts # POST → SSE resume stream
│  └─ eval/route.ts             # GET eval harness (CI gate)
└─ components/synthesis/        # App, AgentGraph, Timeline, ReportView
```

---

## 🚀 Local dev

```bash
npm install
cp .env.example .env          # set DATABASE_URL (and optionally LLM/search keys)
npx drizzle-kit push          # create tables
npm run dev
```

Open http://localhost:3000.

### Demo mode (no keys)
With **no API keys**, Synthesis runs a **deterministic, grounded simulated engine**: the planner
decomposes your brief, tools return realistic results, evidence is extracted, and the report is
synthesized from that evidence with citations. The Reflexion loop, RAG, telemetry, and eval all
exercise the real code paths. **The deployed demo always works.**

### Real mode (add a key)
Set `OPENAI_API_KEY` (or `GROQ_API_KEY`) and the planner/researcher/synthesizer/critic perform
genuine LLM reasoning. Add `TAVILY_API_KEY`/`SERPER_API_KEY` for live web search and
`JINA_API_KEY` for live page reads.

---

## ✅ Evaluation & CI gate

`GET /api/eval?limit=2` runs the full pipeline headless against a golden set and asserts
agent-grade metrics (evidence coverage, citation coverage, reflection faithfulness, latency).

`.github/workflows/ci.yml` runs **lint → typecheck → build**, then a separate **eval-gate** job
that boots Postgres + the production server and fails the build if the eval score regresses.

Run it locally:
```bash
curl localhost:3000/api/eval?limit=2
```

---

## ☁️ Deploy on Vercel (free tier)

1. Push this repo to GitHub.
2. Import it on [Vercel](https://vercel.com) — auto-deploys on push, preview deploys per PR.
3. Add a **Vercel Postgres** store and set `DATABASE_URL`. (Vercel KV/Blob optional.)
4. (Optional) add model/search keys as env vars for real-LLM mode.
5. Visit the deployed URL and run a research brief.

No Supabase / Netlify / Render / Railway required.

---

## 🔐 Environment variables

See [`.env.example`](./.env.example). Only `DATABASE_URL` is required to run; everything else
enables real-LLM / live-tool mode.

---

## 🛣️ Roadmap

- CrewAI / AutoGen Python reference engines behind the same REST contract
- pgvector + ANN retrieval for larger corpora
- MCP tool-server exposure + external MCP consumption
- Langfuse-hosted tracing, per-team model routing, agent-marketplace YAML

---

Built as a senior-portfolio demonstration of agentic-loop engineering.
