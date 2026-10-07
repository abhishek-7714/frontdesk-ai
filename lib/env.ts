import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ELEVENLABS_API_KEY: optional,
  ELEVENLABS_AGENT_ID: optional,
  OPENAI_API_KEY: optional,
  ANTHROPIC_API_KEY: optional,
  MCP_SECRET: optional,
  ADMIN_TOKEN: optional,
  DEMO_DOCTOR_SLUG: optional.transform((v) => v ?? "meera-iyer"),
  CLINIC_TZ: optional.transform((v) => v ?? "Asia/Kolkata"),
  NEXT_PUBLIC_CLINIC_NAME: optional.transform((v) => v ?? "Fernleaf Clinic"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  cached = parsed.data;
  const off: string[] = [];
  if (!cached.OPENAI_API_KEY) off.push("embeddings (using Postgres full-text search)");
  if (!cached.ANTHROPIC_API_KEY) off.push("LLM summaries (using template)");
  if (!cached.ELEVENLABS_API_KEY) off.push("ElevenLabs signed URLs");
  if (!cached.MCP_SECRET) off.push("MCP server");
  if (!cached.ADMIN_TOKEN) off.push("admin reset");
  if (off.length) console.warn(`[env] disabled: ${off.join(", ")}`);
  return cached;
}

export function features() {
  const e = env();
  return {
    embeddings: Boolean(e.OPENAI_API_KEY),
    llmSummary: Boolean(e.ANTHROPIC_API_KEY),
    elevenlabs: Boolean(e.ELEVENLABS_API_KEY && e.ELEVENLABS_AGENT_ID),
    mcp: Boolean(e.MCP_SECRET),
    admin: Boolean(e.ADMIN_TOKEN),
  };
}
