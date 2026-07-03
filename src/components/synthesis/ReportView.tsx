"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github-dark.css";

function ReportViewBase({ markdown, streaming }: { markdown: string; streaming?: boolean }) {
  if (!markdown) {
    return <p className="text-sm text-slate-600">The cited report will stream in here as the synthesizer works…</p>;
  }
  return (
    <div className="markdown-body relative max-w-none">
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-fuchsia-400 align-middle" aria-hidden />
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export const ReportView = memo(ReportViewBase);
