import OpenAI from "openai";
import { env } from "./env";

export const EMBEDDING_MODEL = "text-embedding-3-small";

let client: OpenAI | null = null;

function openai(): OpenAI | null {
  const key = env().OPENAI_API_KEY;
  if (!key) return null;
  if (!client) client = new OpenAI({ apiKey: key, timeout: 8_000, maxRetries: 1 });
  return client;
}

export function embeddingsEnabled(): boolean {
  return Boolean(env().OPENAI_API_KEY);
}

/** Returns one vector per input, or null when embeddings are unavailable or the call fails. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  const c = openai();
  if (!c || texts.length === 0) return null;
  try {
    const res = await c.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
    return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } catch (err) {
    console.error("[embeddings] failed, falling back to FTS:", err instanceof Error ? err.message : err);
    return null;
  }
}

export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
