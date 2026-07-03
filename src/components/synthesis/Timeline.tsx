"use client";

import { memo, useEffect, useRef } from "react";
import type { AgentEvent } from "@/lib/agent/schemas";

export interface TimelineEntry {
  seq: number;
  event: AgentEvent;
}

const ICON: Record<string, string> = {
  status: "●",
  node_start: "▶",
  node_end: "■",
  plan_ready: "✦",
  researcher: "🔬",
  tool_call: "🛠",
  evidence: "📌",
  report_chunk: "✍",
  reflection: "⚖",
  final: "✅",
  error: "✕",
  token: "·",
};

const COLOR: Record<string, string> = {
  node_start: "text-violet-300",
  node_end: "text-slate-400",
  plan_ready: "text-amber-300",
  researcher: "text-cyan-300",
  tool_call: "text-sky-300",
  evidence: "text-emerald-300",
  report_chunk: "text-fuchsia-300",
  reflection: "text-yellow-300",
  final: "text-emerald-400",
  error: "text-red-400",
  status: "text-slate-500",
};

function describe(e: AgentEvent): string {
  switch (e.type) {
    case "status":
      return `status → ${e.status}`;
    case "node_start":
      return `${e.agent}: ${e.label}`;
    case "node_end":
      return `${e.agent} complete`;
    case "plan_ready":
      return `Plan ready (${e.plan.subQuestions.length} vectors)`;
    case "researcher":
      return `researcher ${e.status}: ${e.question.slice(0, 60)}`;
    case "tool_call":
      return `${e.tool}() → ${JSON.stringify(e.result).slice(0, 50)}`;
    case "evidence":
      return `evidence [${e.evidence.source.domain}] cred ${(e.evidence.source.credibility * 100).toFixed(0)}%`;
    case "reflection":
      return `critic faithfulness ${(e.reflection.faithfulness * 100).toFixed(0)}% → ${e.reflection.recommendation}`;
    case "final":
      return `final · confidence ${(e.confidence * 100).toFixed(0)}% · $${e.costUsd.toFixed(4)}`;
    case "error":
      return e.message;
    default:
      return e.type;
  }
}

function TimelineBase({ entries }: { entries: TimelineEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length]);

  return (
    <div className="max-h-[460px] space-y-1 overflow-y-auto pr-1 font-mono text-xs">
      {entries.length === 0 && <p className="text-slate-600">Awaiting events…</p>}
      {entries.map((t) => (
        <div key={t.seq} className="flex gap-2 rounded-md px-2 py-1 hover:bg-white/[0.03]">
          <span className="select-none text-slate-600">{String(t.seq).padStart(3, "0")}</span>
          <span className={COLOR[t.event.type] ?? "text-slate-400"}>{ICON[t.event.type] ?? "·"}</span>
          <span className="min-w-0 flex-1 text-slate-300">{describe(t.event)}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

export const Timeline = memo(TimelineBase);
