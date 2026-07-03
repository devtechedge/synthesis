/**
 * Synthesis — LLM abstraction.
 *
 * One typed interface. When an OpenAI-compatible key is present (OpenAI, Groq,
 * OpenRouter, local vLLM…) it performs REAL reasoning. With no key it is absent
 * and agents fall back to a deterministic, grounded simulator — so the deployed
 * demo ALWAYS works for recruiters while remaining fully functional.
 *
 * Principle #11: frameworks are configurations behind interfaces, not the architecture.
 */

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

const apiKey = process.env.OPENAI_API_KEY ?? process.env.GROQ_API_KEY ?? "";
const baseUrl =
  process.env.OPENAI_BASE_URL ??
  (process.env.GROQ_API_KEY ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1");

export const LLM_MODEL = process.env.OPENAI_MODEL ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
export const EMBED_MODEL = process.env.EMBED_MODEL ?? "text-embedding-3-small";

/** True only when a real model endpoint is configured. */
export const useRealLLM = apiKey.trim().length > 0;

/** Pricing per 1M tokens (USD). Conservative defaults. */
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  default: { in: 0.5, out: 1.5 },
};

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function costForTokens(model: string, inputT: number, outputT: number): number {
  const p = PRICING[model] ?? PRICING.default;
  return (inputT / 1_000_000) * p.in + (outputT / 1_000_000) * p.out;
}

interface CompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export async function complete(messages: ChatMessage[], opts?: { temperature?: number }): Promise<CompletionResult> {
  if (!useRealLLM) {
    throw new Error("complete() called without an API key — agent should use its simulator fallback.");
  }
  const temperature = opts?.temperature ?? 0.2;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      temperature,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const inputTokens = data.usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join("\n"));
  const outputTokens = data.usage?.completion_tokens ?? estimateTokens(content);
  return { content, inputTokens, outputTokens, costUsd: costForTokens(LLM_MODEL, inputTokens, outputTokens) };
}

/** Forced-JSON completion, parsed & validated by a Zod schema. */
export async function completeJson<T>(
  messages: ChatMessage[],
  parse: (raw: unknown) => T,
  opts?: { temperature?: number },
): Promise<{ value: T; inputTokens: number; outputTokens: number; costUsd: number }> {
  const { content, inputTokens, outputTokens, costUsd } = await complete(messages, opts);
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    // Fallback: extract the first {...} block.
    const m = content.match(/\{[\s\S]*\}/);
    json = m ? JSON.parse(m[0]) : (() => { throw new Error("Model returned non-JSON"); })();
  }
  return { value: parse(json), inputTokens, outputTokens, costUsd };
}

/* ----------------------------- Embeddings ------------------------------ */
/* Real (model) or deterministic hashing vector. Same cosine semantics per mode. */

const HASH_DIM = 256;

function hashEmbed(text: string): number[] {
  const vec = new Array<number>(HASH_DIM).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % HASH_DIM;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function embed(text: string): Promise<number[]> {
  if (!useRealLLM) return hashEmbed(text);
  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
    });
    if (!res.ok) throw new Error(`embed ${res.status}`);
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0].embedding;
  } catch {
    return hashEmbed(text);
  }
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    const n = Math.min(a.length, b.length);
    a = a.slice(0, n);
    b = b.slice(0, n);
  }
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / ((Math.sqrt(na) || 1) * (Math.sqrt(nb) || 1));
}
