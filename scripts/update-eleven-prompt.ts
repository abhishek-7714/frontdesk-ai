// Pushes agent/prompt.txt to the existing ElevenLabs agent, keeping its tools, LLM and other settings.
//   npx tsx scripts/update-eleven-prompt.ts
import "./load-env";
import { readFileSync } from "node:fs";

const API = "https://api.elevenlabs.io";
const key = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_ID;
if (!key || !agentId) {
  console.error("ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be set (.env.local).");
  process.exit(1);
}
const headers = { "xi-api-key": key, "content-type": "application/json" };

type PromptConfig = { prompt?: string; llm?: string; tool_ids?: string[] } & Record<string, unknown>;
const getPrompt = async (): Promise<PromptConfig> => {
  const res = await fetch(`${API}/v1/convai/agents/${agentId}`, { headers });
  if (!res.ok) throw new Error(`GET agent → ${res.status} ${await res.text()}`);
  const agent = (await res.json()) as { conversation_config?: { agent?: { prompt?: PromptConfig } } };
  return agent.conversation_config?.agent?.prompt ?? {};
};

async function main() {
  const before = await getPrompt();
  const text = readFileSync("agent/prompt.txt", "utf8").trim();
  if (before.prompt?.trim() === text) return console.log("Agent prompt is already up to date.");

  // Send the whole prompt object back so tool_ids and llm are not dropped by a partial update.
  // GET also returns the expanded `tools`, which the API refuses alongside `tool_ids`.
  const { tools: _expanded, ...keep } = before;
  void _expanded;
  const res = await fetch(`${API}/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ conversation_config: { agent: { prompt: { ...keep, prompt: text } } } }),
  });
  if (!res.ok) throw new Error(`PATCH agent → ${res.status} ${await res.text()}`);

  const after = await getPrompt();
  const ok = after.prompt?.trim() === text && after.llm === before.llm && (after.tool_ids?.length ?? 0) === (before.tool_ids?.length ?? 0);
  console.log(ok ? `✅ prompt updated (llm ${after.llm}, ${after.tool_ids?.length} tools kept)` : `❌ mismatch after update: ${JSON.stringify({ llm: after.llm, tools: after.tool_ids?.length })}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
