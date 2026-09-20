"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunSummary, Plan, AgentEvent, EvidenceItem, Reflection } from "@/lib/agent/schemas";
import { AgentGraph } from "./AgentGraph";
import { Timeline, type TimelineEntry } from "./Timeline";
import { ReportView } from "./ReportView";
import ThemeToggle from "@/components/ThemeToggle";

type Phase = "idle" | "planning" | "awaiting" | "running" | "done" | "error";
type Tab = "timeline" | "report" | "evidence";

const EXAMPLES = [
  "Compare lithium-ion vs solid-state batteries for EVs in 2026",
  "What are the main risks of adopting Rust in large codebases?",
  "Assess the viability of small modular reactors by 2030",
];

interface FinalStats {
  confidence: number;
  costUsd: number;
  tokens: number;
  latencyMs: number;
}

export default function SynthesisApp({ initialRuns }: { initialRuns: RunSummary[] }) {
  const [runs, setRuns] = useState<RunSummary[]>(initialRuns);
  const [brief, setBrief] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState<number | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [nodeDone, setNodeDone] = useState<Record<string, boolean>>({});
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [report, setReport] = useState("");
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [finalStats, setFinalStats] = useState<FinalStats | null>(null);
  const [tab, setTab] = useState<Tab>("timeline");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const paneScrollRef = useRef<HTMLDivElement | null>(null);
  const paneScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshRuns = useCallback(async () => {
    try {
      const r = await fetch("/api/run", { cache: "no-store" });
      const j = await r.json();
      if (Array.isArray(j.runs)) setRuns(j.runs);
    } catch {
      /* ignore */
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
    setRunId(null);
    setPlan(null);
    setEntries([]);
    setNodeDone({});
    setActiveNode(null);
    setReport("");
    setEvidence([]);
    setReflection(null);
    setFinalStats(null);
    setError(null);
    setTab("timeline");
  }, []);

  const startRun = useCallback(async () => {
    const q = brief.trim();
    if (!q) return;
    reset();
    setPhase("planning");
    setError(null);
    try {
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: q }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "planning failed");
      setRunId(j.runId);
      setPlan(j.plan);
      setNodeDone({ planner: true });
      setPhase("awaiting");
      setTab("timeline");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [brief, reset]);

  const onEvent = useCallback((e: AgentEvent & { seq?: number }) => {
    switch (e.type) {
      case "status":
        // Each synthesizer pass streams a full report; clear so revisions replace, not concatenate.
        if (e.status === "synthesizing") setReport("");
        if (e.status === "done") setPhase("done");
        if (e.status === "error") setPhase("error");
        break;
      case "node_start":
        setActiveNode(e.node);
        if (e.node === "synthesizer") setReport("");
        break;
      case "node_end":
        setNodeDone((p) => ({ ...p, [e.node]: true }));
        setActiveNode((cur) => (cur === e.node ? null : cur));
        break;
      case "plan_ready":
        setPlan(e.plan);
        break;
      case "researcher":
        break;
      case "tool_call":
        break;
      case "evidence":
        setEvidence((p) => [...p, e.evidence]);
        break;
      case "report_chunk":
        setReport((p) => p + e.delta);
        setTab("report");
        break;
      case "reflection":
        setReflection(e.reflection);
        break;
      case "final":
        setFinalStats({ confidence: e.confidence, costUsd: e.costUsd, tokens: e.tokens, latencyMs: e.latencyMs });
        setPhase("done");
        break;
      case "error":
        setError(e.message);
        setPhase("error");
        break;
      default:
        break;
    }
    setEntries((p) => [...p, { seq: e.seq ?? p.length + 1, event: e }]);
  }, []);

  const approve = useCallback(async () => {
    if (runId == null) return;
    setPhase("running");
    setError(null);
    setEntries([]);
    setReport("");
    setEvidence([]);
    setNodeDone({ planner: true });
    setActiveNode(null);
    setReflection(null);
    setFinalStats(null);
    setTab("timeline");

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(`/api/run/${runId}/approve`, { method: "POST", signal: ac.signal });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `approve failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const json = JSON.parse(line.slice(5).trim());
          if (json.type === "__done__") {
            await refreshRuns();
            continue;
          }
          onEvent(json as AgentEvent & { seq?: number });
        }
      }
      setPhase("done");
      await refreshRuns();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    }
  }, [runId, onEvent, refreshRuns]);

  const loadRun = useCallback(async (id: number) => {
    reset();
    setPhase("planning");
    try {
      const r = await fetch(`/api/run/${id}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "not found");
      setRunId(j.run.id);
      const state = j.run.stateJson;
      setPlan(state?.plan ?? null);
      setReport(j.run.reportMarkdown ?? "");
      setEvidence(
        (j.evidence ?? []).map((e: EvidenceItem) => ({ ...e, source: { ...e.source } })),
      );
      setReflection(state?.reflection ?? null);
      setFinalStats(
        j.run.status === "done"
          ? { confidence: j.run.confidence ?? 0, costUsd: j.run.costUsd ?? 0, tokens: j.run.tokensUsed ?? 0, latencyMs: j.run.latencyMs ?? 0 }
          : null,
      );
      const done: Record<string, boolean> = {};
      const evs: TimelineEntry[] = [];
      for (const ev of j.events ?? []) {
        if (ev.type === "node_end") done[ev.node] = true;
        evs.push({ seq: ev.seq ?? evs.length + 1, event: ev });
      }
      setNodeDone({ planner: true, ...done });
      setActiveNode(null);
      setEntries(evs);
      setPhase(j.run.status === "done" ? "done" : "idle");
      setTab("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [reset]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = phase === "planning" || phase === "running";
  const showDashboard = phase !== "idle";

  useEffect(() => {
    const el = paneScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      el.classList.add("is-scrolling");
      if (paneScrollTimer.current) clearTimeout(paneScrollTimer.current);
      paneScrollTimer.current = setTimeout(() => el.classList.remove("is-scrolling"), 800);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (paneScrollTimer.current) clearTimeout(paneScrollTimer.current);
    };
  }, [showDashboard, tab]);

  return (
    <div className="app-bg min-h-screen">
      <header className="chrome-header sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 text-base font-black text-white shadow-lg shadow-violet-500/25">
              S
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-heading">Synthesis</p>
              <p className="hidden text-[0.68rem] text-dim sm:block">Autonomous Multi-Agent Research Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge phase={phase} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Brief intake */}
        <section className="panel p-4 sm:p-5">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-dim">
            Research brief
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            disabled={busy}
            rows={2}
            data-testid="brief-input"
            placeholder="Ask a complex research question - the crew will plan, search, retrieve, synthesize, critique, and return a cited report with a confidence score."
            className="input-surface w-full resize-none rounded-xl px-3.5 py-3 text-sm focus:border-violet-400/50 focus:outline-none focus:ring-1 focus:ring-violet-400/40 disabled:opacity-50"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!showDashboard && (
              <button
                onClick={startRun}
                disabled={!brief.trim() || busy}
                data-testid="launch-research"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/30 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
              >
                🚀 Launch research
              </button>
            )}
            {showDashboard && (
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-xl border border-theme bg-transparent px-4 py-2.5 text-sm font-semibold text-body transition hover:bg-[var(--surface-raised)]"
              >
                ✚ New brief
              </button>
            )}
            {phase === "idle" &&
              EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setBrief(ex)}
                  data-testid="example-prompt"
                  className="rounded-lg border border-theme bg-transparent px-2.5 py-1.5 text-xs text-dim transition hover:border-violet-400/40 hover:text-[color:var(--accent)]"
                >
                  {ex.length > 42 ? ex.slice(0, 42) + "…" : ex}
                </button>
              ))}
            <span className="ml-auto font-mono text-[0.7rem] text-dim">
              Engine: <span className="text-soft">LangGraph.js</span> · {evidence.length} evidence ·{" "}
              {finalStats ? `${(finalStats.tokens / 1000).toFixed(1)}k tok` : "—"}
            </span>
          </div>
          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400 dark:text-red-300">
              {error}
            </p>
          )}
        </section>

        {/* Plan approval (HITL) */}
        {phase === "awaiting" && plan && (
          <section className="approval-panel mt-5 p-4 sm:p-5" data-testid="plan-approval">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="approval-pulse h-2 w-2 shrink-0 rounded-full bg-violet-500 dark:bg-fuchsia-400" aria-hidden />
                <h2 className="text-sm font-bold tracking-tight text-violet-700 dark:text-violet-100">
                  Plan ready — human approval required
                </h2>
              </div>
              <button
                onClick={approve}
                data-testid="approve-execute"
                className="rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-violet-500/35 transition hover:scale-[1.02] hover:shadow-violet-500/50"
              >
                ✓ Approve &amp; execute
              </button>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-soft">{plan.rationale}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {plan.subQuestions.map((s, i) => (
                <div key={s.id} className="approval-step rounded-xl border border-theme bg-[var(--surface-raised)] px-3 py-2.5">
                  <p className="text-xs font-semibold text-heading">
                    {i + 1}. {s.question}
                  </p>
                  <p className="mt-1 font-mono text-[0.7rem] text-soft">strategy: {s.strategy}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dashboard */}
        {showDashboard && (
          <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <div className="panel p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-dim">Agent graph</h3>
                  {activeNode && <span className="font-mono text-[0.7rem] text-violet-500 dark:text-violet-300">executing: {activeNode}</span>}
                </div>
                <AgentGraph activeNode={activeNode} done={nodeDone} />
              </div>

              <div className="panel flex min-h-0 flex-col p-4">
                <div className="tab-rail mb-3 flex gap-1 p-1">
                  {(["timeline", "report", "evidence"] as Tab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition ${
                        tab === t
                          ? "bg-violet-500/25 text-violet-700 shadow-sm dark:bg-violet-500/30 dark:text-violet-100"
                          : "text-dim hover:text-body"
                      }`}
                    >
                      {t}
                      {t === "evidence" && evidence.length > 0 && (
                        <span className="ml-1 text-dim">({evidence.length})</span>
                      )}
                    </button>
                  ))}
                </div>
                <div ref={paneScrollRef} className="report-pane scrollbar-overlay min-h-0" tabIndex={0}>
                  {tab === "timeline" && <Timeline entries={entries} />}
                  {tab === "report" && <ReportView markdown={report} streaming={phase === "running"} />}
                  {tab === "evidence" && <EvidenceList items={evidence} />}
                </div>
              </div>
            </div>

            {/* Right rail */}
            <aside className="space-y-5">
              <BudgetPanel phase={phase} finalStats={finalStats} evidenceCount={evidence.length} />
              {reflection && <ReflectionCard reflection={reflection} />}
              <RecentRuns runs={runs} currentId={runId} onPick={loadRun} />
            </aside>
          </section>
        )}

        {!showDashboard && (
          <section className="mt-5">
            <RecentRuns runs={runs} currentId={runId} onPick={loadRun} />
          </section>
        )}
      </main>

      <footer className="border-t border-theme py-6 text-center font-mono text-xs text-dim">
        Synthesis · agentic-loop engineering · plan → research → synthesize → critique → finalize · deploy on GitHub + Vercel
      </footer>
    </div>
  );
}

function StatusBadge({ phase }: { phase: Phase }) {
  const map: Record<Phase, { label: string; cls: string; dot: string }> = {
    idle: { label: "Idle", cls: "border-[var(--border)] text-soft", dot: "bg-slate-400" },
    planning: { label: "Planning", cls: "border-violet-400/40 text-violet-600 dark:text-violet-300", dot: "bg-violet-400" },
    awaiting: { label: "Awaiting approval", cls: "border-fuchsia-400/45 text-fuchsia-700 dark:text-fuchsia-300", dot: "bg-fuchsia-400 pulse-dot" },
    running: { label: "Running", cls: "border-violet-400/40 text-violet-600 dark:text-violet-300", dot: "bg-violet-400" },
    done: { label: "Done", cls: "border-emerald-400/40 text-emerald-600 dark:text-emerald-300", dot: "bg-emerald-400" },
    error: { label: "Error", cls: "border-red-400/40 text-red-600 dark:text-red-300", dot: "bg-red-400" },
  };
  const s = map[phase];
  return (
    <span
      data-testid="status-badge"
      className={`inline-flex items-center gap-1.5 rounded-full border bg-[var(--surface-raised)] px-3 py-1 text-xs font-medium ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${phase === "running" ? "pulse-dot" : ""}`} />
      {s.label}
    </span>
  );
}

function BudgetPanel({
  phase,
  finalStats,
  evidenceCount,
}: {
  phase: Phase;
  finalStats: FinalStats | null;
  evidenceCount: number;
}) {
  const conf = finalStats?.confidence ?? 0;
  return (
    <div className="panel p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-dim">Telemetry</h3>
      <dl className="grid grid-cols-2 gap-3 text-center">
        <Stat label="Confidence" value={finalStats ? `${(conf * 100).toFixed(0)}%` : "—"} accent={conf >= 0.8 ? "emerald" : "amber"} />
        <Stat label="Cost (USD)" value={finalStats ? `$${finalStats.costUsd.toFixed(4)}` : "—"} />
        <Stat label="Tokens" value={finalStats ? finalStats.tokens.toLocaleString() : "—"} />
        <Stat label="Latency" value={finalStats ? `${(finalStats.latencyMs / 1000).toFixed(1)}s` : phase === "running" ? "…" : "—"} />
      </dl>
      <div className="mt-3 flex items-center justify-between font-mono text-[0.7rem] text-dim">
        <span>evidence: {evidenceCount}</span>
        <span>budget-capped · resumable</span>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "emerald" | "amber" }) {
  const c =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-300"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-300"
        : "text-heading";
  return (
    <div className="surface-inset rounded-lg px-2 py-2">
      <dd className={`font-mono text-base font-bold ${c}`}>{value}</dd>
      <dt className="mt-0.5 text-[0.62rem] uppercase tracking-wider text-dim">{label}</dt>
    </div>
  );
}

function ReflectionCard({ reflection }: { reflection: Reflection }) {
  const pct = Math.round(reflection.faithfulness * 100);
  return (
    <div className="panel p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">Critic / Reflexion</h3>
      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-[var(--inset)]">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-soft">
        Faithfulness <span className="font-bold text-heading">{pct}%</span> · recommendation{" "}
        <span className={reflection.recommendation === "accept" ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}>
          {reflection.recommendation}
        </span>
      </p>
      {reflection.unsupportedClaims.length > 0 && (
        <ul className="mt-2 space-y-1">
          {reflection.unsupportedClaims.map((c, i) => (
            <li key={i} className="text-[0.7rem] text-dim">
              • {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) return <p className="text-sm text-dim">No evidence gathered yet.</p>;
  return (
    <div className="space-y-2 pr-1">
      {items.map((e) => (
        <div key={e.id} className="surface-inset rounded-lg px-3 py-2">
          <p className="text-xs text-body">{e.claim}</p>
          <div className="mt-1 flex items-center gap-2 font-mono text-[0.68rem] text-dim">
            <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-600 dark:text-violet-300">{e.source.domain}</span>
            <span>cred {(e.source.credibility * 100).toFixed(0)}%</span>
            <span>rel {(e.score * 100).toFixed(0)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentRuns({
  runs,
  currentId,
  onPick,
}: {
  runs: RunSummary[];
  currentId: number | null;
  onPick: (id: number) => void;
}) {
  if (runs.length === 0) return null;
  return (
    <div className="panel p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-dim">Recent runs</h3>
      <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1 scrollbar-overlay">
        {runs.map((r) => (
          <button
            key={r.id}
            onClick={() => onPick(r.id)}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
              currentId === r.id
                ? "border-violet-400/40 bg-violet-500/10"
                : "border-theme bg-[var(--inset)] hover:bg-[var(--surface-raised)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                r.status === "done" ? "bg-emerald-400" : r.status === "error" ? "bg-red-400" : "bg-slate-500"
              }`}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-soft">{r.brief}</span>
            {r.confidence != null && (
              <span className="shrink-0 font-mono text-[0.65rem] text-dim">{(r.confidence * 100).toFixed(0)}%</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
