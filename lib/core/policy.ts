import { query, one } from "../db";
import { embed, toVectorLiteral } from "../embeddings";
import { emit } from "../events";

export type PolicyMatch = { doc_title: string; section: string; content: string };

// Patients say "knee" or "cost"; the documents say "Orthopaedics" or "fee".
// Expanding the query keeps the full-text fallback useful without embeddings.
const SYNONYMS: [RegExp, string[]][] = [
  [/\b(knee|back|joint|bone|ortho\w*|shoulder|ankle|wrist|sport|fracture|sprain|hip|neck)/i, ["orthopaedics"]],
  [/\b(heart|cardi\w*|bp|blood pressure|palpitation|chest)/i, ["cardiology"]],
  [/\b(fever|cold|cough|general|vaccin\w*|walk.?in|family)/i, ["general", "medicine"]],
  [/\b(cost|price|charge|fee|pay|much|rupee|upi|card|cash)/i, ["fee", "payment"]],
  [/\b(insur\w*|cashless|claim|policy card|mediclaim|star health|hdfc|icici|niva)/i, ["insurance", "cashless", "reimbursement"]],
  [/\b(timing|time|open|hour|close|sunday|when)/i, ["hours", "timings"]],
  [/\b(where|address|location|park\w*|reach|direction)/i, ["address", "parking", "location"]],
  [/\b(fast\w*|empty stomach|eat|lipid|sugar|cholesterol|blood test)/i, ["fasting", "test", "preparation"]],
  [/\b(cancel\w*|reschedul\w*|change|late|no.?show)/i, ["reschedule", "cancel"]],
  [/\b(bring|carry|document|first visit|id\b|report|x-?ray|mri)/i, ["bring"]],
  [/\b(emergenc\w*|breath\w*|faint\w*|stroke|bleed\w*|urgent)/i, ["emergency"]],
  [/\b(contact|phone|number|call you|email|e-mail|mail|whatsapp|reach you|front desk|reception)/i, ["contacting", "front", "desk", "phone", "email"]],
];

const STOP = new Set(
  "a an the i me my we you your is are am be to of for in on at and or with what which who how can could should would do does did have has will about this that it its there their our please tell know want need any some get".split(
    " ",
  ),
);

function ftsTerms(q: string): string {
  const words = q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const extra = SYNONYMS.filter(([re]) => re.test(q)).flatMap(([, s]) => s);
  const terms = Array.from(new Set([...words, ...extra])).map((w) => w.replace(/-/g, ""));
  return terms.filter(Boolean).join(" | ");
}

let embeddedCount: { n: number; at: number } | null = null;
async function hasEmbeddings(): Promise<boolean> {
  if (!embeddedCount || Date.now() - embeddedCount.at > 60_000) {
    const row = await one<{ n: number }>(`SELECT count(*)::int AS n FROM policy_chunks WHERE embedding IS NOT NULL`);
    embeddedCount = { n: row?.n ?? 0, at: Date.now() };
  }
  return embeddedCount.n > 0;
}

export async function searchPolicy(q: string, opts: { callId?: string; limit?: number } = {}): Promise<{ matches: PolicyMatch[]; method: "vector" | "fts" }> {
  const limit = opts.limit ?? 4;
  let matches: PolicyMatch[] = [];
  let method: "vector" | "fts" = "fts";

  if (await hasEmbeddings()) {
    const vec = await embed([q]);
    if (vec) {
      method = "vector";
      matches = await query<PolicyMatch>(
        `SELECT doc_title, section, content FROM (
           SELECT doc_title, section, content, 1 - (embedding <=> $1::vector) AS similarity
           FROM policy_chunks WHERE embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector LIMIT $2) t
         WHERE similarity > 0.25`,
        [toVectorLiteral(vec[0]), limit],
      );
    }
  }

  if (method === "fts") {
    const terms = ftsTerms(q);
    if (terms) {
      matches = await query<PolicyMatch>(
        `SELECT doc_title, section, content
         FROM policy_chunks, to_tsquery('english', $1) tsq
         WHERE tsv @@ tsq
         ORDER BY ts_rank_cd(tsv, tsq, 1) DESC
         LIMIT $2`,
        [terms, limit],
      );
    }
  }

  if (opts.callId) {
    const top = matches[0];
    await emit(opts.callId, "tool.search_policy", {
      query: q,
      count: matches.length,
      top: top ? { doc_title: top.doc_title, section: top.section, snippet: snippet(top.content) } : null,
    });
  }
  return { matches, method };
}

function snippet(s: string, n = 180): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length <= n ? flat : `${flat.slice(0, n).replace(/\s+\S*$/, "")}…`;
}
