import { db } from "@/db";
import { documents } from "@/db/schema";
import { embed } from "./llm";

/**
 * Document ingest for a research run.
 * Retrieval/memory helpers were unused by the agent graph and were removed.
 */
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
