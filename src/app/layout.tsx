import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const faviconSvg =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
      `<rect width="32" height="32" rx="8" fill="#0b0e1a"/>` +
      `<text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" font-weight="800" fill="url(#g)">S</text>` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop stop-color="#8b5cf6"/><stop offset="0.5" stop-color="#d946ef"/><stop offset="1" stop-color="#22d3ee"/>` +
      `</linearGradient></defs></svg>`,
  );

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
  icons: {
    icon: faviconSvg,
  },
  openGraph: {
    title: "Synthesis — Autonomous Multi-Agent Research Platform",
    description:
      "Plan → research → synthesize → critique → finalize. A cited, confidence-scored agentic research system.",
    type: "website",
  },
};

const THEME_BOOT = `(function(){try{var k="synthesis-theme";var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t="dark";var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t;if(t==="dark")r.classList.add("dark");else r.classList.remove("dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
