import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synthesis — Autonomous Multi-Agent Research Platform",
  description:
    "A Vercel-native agentic research system: LangGraph.js orchestration, ReAct + Reflexion loops, hybrid RAG, HITL approval, streaming, observability, and an eval gate. Deploy on GitHub + Vercel, free tier only.",
  keywords: [
    "AI agent",
    "LangGraph",
    "LangChain",
    "multi-agent",
    "RAG",
    "agentic loops",
    "ReAct",
    "Reflexion",
    "Vercel",
  ],
  openGraph: {
    title: "Synthesis — Autonomous Multi-Agent Research Platform",
    description: "Plan → research → synthesize → critique → finalize. A cited, confidence-scored agentic research system.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
