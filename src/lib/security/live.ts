/**
 * Live provider gate for public demos.
 * Real LLM/search spend only when LIVE_MODE=true AND keys are present,
 * and (if PUBLIC_RUN_TOKEN is set) the request carries a matching x-run-token.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type LiveStore = { allowLive: boolean };
const als = new AsyncLocalStorage<LiveStore>();

function envLiveFlag(): boolean {
  return (process.env.LIVE_MODE ?? "").trim().toLowerCase() === "true";
}

export function hasLlmKey(): boolean {
  return Boolean((process.env.OPENAI_API_KEY ?? process.env.GROQ_API_KEY ?? "").trim());
}

export function hasSearchKey(): boolean {
  return Boolean(
    (process.env.TAVILY_API_KEY ?? "").trim() ||
      (process.env.SERPER_API_KEY ?? "").trim() ||
      (process.env.JINA_API_KEY ?? "").trim(),
  );
}

/** Whether this request / isolate may call paid providers. */
export function allowLiveProviders(): boolean {
  const store = als.getStore();
  if (store) return store.allowLive;
  // Outside a request context (unit tests / scripts): require LIVE_MODE + LLM key
  return envLiveFlag() && hasLlmKey();
}

/**
 * Resolve live permission for an incoming request and run `fn` inside that context.
 * Without LIVE_MODE or keys → simulated. With PUBLIC_RUN_TOKEN → require header match.
 */
export function resolveLiveForRequest(req: Request): boolean {
  if (!envLiveFlag()) return false;
  if (!hasLlmKey() && !hasSearchKey()) return false;
  const token = (process.env.PUBLIC_RUN_TOKEN ?? "").trim();
  if (token) {
    const header = (req.headers.get("x-run-token") ?? "").trim();
    if (header !== token) return false;
  }
  return true;
}

export function runWithLiveGate<T>(allowLive: boolean, fn: () => T): T {
  return als.run({ allowLive }, fn);
}

export async function runWithLiveGateAsync<T>(allowLive: boolean, fn: () => Promise<T>): Promise<T> {
  return als.run({ allowLive }, fn);
}
