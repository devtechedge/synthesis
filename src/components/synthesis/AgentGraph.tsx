"use client";

import { memo } from "react";

type NodeState = "pending" | "active" | "done";

interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  agent: string;
}

const NODES: GraphNode[] = [
  { id: "planner", label: "Planner", x: 60, y: 130, agent: "planner" },
  { id: "fan_out", label: "Research Crew", x: 200, y: 130, agent: "researcher" },
  { id: "synthesizer", label: "Synthesizer", x: 350, y: 130, agent: "synthesizer" },
  { id: "critic", label: "Critic", x: 500, y: 130, agent: "critic" },
  { id: "fact_checker", label: "Fact-checker", x: 640, y: 70, agent: "fact_checker" },
  { id: "finalizer", label: "Finalizer", x: 640, y: 200, agent: "finalizer" },
];

const EDGES: [string, string, boolean][] = [
  ["planner", "fan_out", false],
  ["fan_out", "synthesizer", false],
  ["synthesizer", "critic", false],
  ["critic", "synthesizer", true], // Reflexion back-edge
  ["critic", "fact_checker", false],
  ["fact_checker", "finalizer", false],
];

const R = 22;

function stateColor(s: NodeState) {
  if (s === "active") return { fill: "#7c3aed", stroke: "#a78bfa", glow: true };
  if (s === "done") return { fill: "#059669", stroke: "#34d399", glow: false };
  return { fill: "#1e293b", stroke: "#334155", glow: false };
}

function AgentGraphBase({
  activeNode,
  done,
}: {
  activeNode: string | null;
  done: Record<string, boolean>;
}) {
  const stateOf = (id: string): NodeState =>
    activeNode === id ? "active" : done[id] ? "done" : "pending";

  const pos = (id: string) => NODES.find((n) => n.id === id)!;

  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 720 280" className="h-[220px] w-full min-w-[640px]">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#475569" />
          </marker>
        </defs>

        {EDGES.map(([from, to, loop], i) => {
          const a = pos(from);
          const b = pos(to);
          if (loop) {
            const mx = (a.x + b.x) / 2;
            return (
              <path
                key={`e${i}`}
                d={`M ${a.x + R} ${a.y - R + 4} Q ${mx} 40 ${b.x - R} ${b.y - R + 4}`}
                fill="none"
                stroke="#7c3aed"
                strokeOpacity={done["critic"] ? 0.8 : 0.3}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
            );
          }
          return (
            <line
              key={`e${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#334155"
              strokeWidth={1.5}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {NODES.map((n) => {
          const s = stateOf(n.id);
          const c = stateColor(s);
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              {c.glow && <circle r={R + 8} fill="#7c3aed" opacity={0.18} className="pulse-dot" />}
              <circle r={R} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
              <text textAnchor="middle" y={4} fontSize={9} fontWeight={700} fill="#f8fafc">
                {n.label.split(" ").map((w) => w[0]).join("").slice(0, 3)}
              </text>
              <text textAnchor="middle" y={R + 16} fontSize={10} fontWeight={600} fill={s === "pending" ? "#64748b" : "#cbd5e1"}>
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const AgentGraph = memo(AgentGraphBase);
