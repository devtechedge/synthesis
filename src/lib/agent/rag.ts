import { db } from "@/db";
import { documents, memories } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { embed, cosine } from "./llm";

/**
 * Synthesis — RAG / memory layer.
 *
 * Portable by design: embeddings are JSONB float[] and similarity is computed
 * in-engine (cosine), so this runs on any Vercel Postgres / Neon free DB
 * without requiring the pgvector extension. For larger corpora this is the one
 * seam to swap for pgvector + ANN — the interface stays identical.
 */

export type RetrievedDoc = {
  id: number;
  url: string;
  title: string | null;
  content: string | null;
  score: number;
  metadata: Record<string, unknown> | null;
};

export async function ingestDocument(
  runId: number | null,
  doc: { url: string; title?: string; content: string; metadata?: Record<string, unknown> },
): Promise<void> {
  const vector = await embed(`${doc.title ?? ""} ${doc.content}`.slice(0, 4000));
  await db.insert(documents).values({
    runId,
    url: doc.url,
    title: doc.title ?? null,
    content: doc.content.slice(0, 12000),
    embedding: vector,
    metadata: doc.metadata ?? {},
  });
}

export async function retrieve(runId: number, query: string, k = 5): Promise<RetrievedDoc[]> {
  const qvec = await embed(query);
  const rows = await db.select().from(documents).where(eq(documents.runId, runId));
  const scored = rows
    .filter((r) => Array.isArray(r.embedding) && r.embedding.length > 0)
    .map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      content: r.content,
      metadata: r.metadata,
      score: cosine(qvec, r.embedding as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored;
}

/* ------------------------------- Memory -------------------------------- */

export type MemoryHit = { id: number; content: string; score: number; importance: number };

export async function writeMemory(
  userId: string,
  kind: string,
  content: string,
  importance = 0.5,
): Promise<void> {
  const vector = await embed(content);
  await db.insert(memories).values({ userId, kind, content, embedding: vector, importance });
}

export async function recallMemory(userId: string, query: string, k = 3): Promise<MemoryHit[]> {
  const qvec = await embed(query);
  const rows = await db.select().from(memories).where(eq(memories.userId, userId)).orderBy(desc(memories.updatedAt)).limit(200);
  return rows
    .filter((r) => Array.isArray(r.embedding) && r.embedding.length > 0)
    .map((r) => ({
      id: r.id,
      content: r.content,
      importance: r.importance ?? 0.5,
      score: cosine(qvec, r.embedding as number[]) * (0.5 + (r.importance ?? 0.5)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
