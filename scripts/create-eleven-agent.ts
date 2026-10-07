// Creates the "Asha, Fernleaf Clinic" ElevenLabs agent through the API:
// five client tools (wait for response), auth enabled, Claude Haiku, a warm Indian-English female voice.
// Writes ELEVENLABS_AGENT_ID into .env.local and prints it (set it on Railway too).
//
//   ELEVENLABS_API_KEY=... npx tsx scripts/create-eleven-agent.ts [--voice-id <id>] [--dry-run]
import "./load-env";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const API = "https://api.elevenlabs.io";
const key = process.env.ELEVENLABS_API_KEY;
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const voiceArg = args.includes("--voice-id") ? args[args.indexOf("--voice-id") + 1] : undefined;

const FIRST_MESSAGE = "Hello, thank you for calling Fernleaf Clinic. This is Asha. How can I help you today?";
const PROMPT = readFileSync("agent/prompt.txt", "utf8").trim();
const LLM_PREFERENCE = ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-sonnet-4-6"];

const str = (description: string) => ({ type: "string", description });
const TOOLS = [
  {
    name: "search_policy",
    description:
      "Search Fernleaf Clinic's internal policies for fees, insurance, timings, location, test preparation and department rules. Call before answering any such question.",
    properties: { query: str("The patient's question rephrased as a search query") },
    required: ["query"],
  },
  {
    name: "check_availability",
    description: "Find open appointment slots. Returns up to three options with a slot_id and a spoken description.",
    properties: {
      specialty: str("Orthopaedics, Cardiology or General Medicine, or the patient's words (e.g. knee, heart)"),
      doctor_name: str("A specific doctor's name, if the patient asked for one"),
      day_preference: str("The patient's day preference in their own words, e.g. 'this week', 'Thursday', 'tomorrow evening'"),
      time_preference: str("morning, afternoon, evening or any"),
    },
    required: [],
  },
  {
    name: "book_appointment",
    description: "Book the slot the patient chose.",
    properties: {
      slot_id: { type: "number", description: "The slot_id of the option the patient chose, from check_availability" },
      patient_name: str("The patient's full name"),
      patient_phone: str("The patient's mobile number"),
      reason: str("Short reason for the visit, in the patient's words"),
    },
    required: ["slot_id", "patient_name", "reason"],
  },
  {
    name: "save_intake",
    description: "Save pre-visit intake answers for the doctor. Call after each answer with everything known so far.",
    properties: {
      chief_complaint: str("The main problem, in the patient's words"),
      duration: str("How long it has been going on"),
      severity: str("How bad it is and what makes it worse"),
      current_medications: str("Regular medicines, or 'none'"),
      notes: str("Anything else the doctor should know"),
    },
    required: ["chief_complaint"],
  },
  {
    name: "flag_for_staff",
    description: "Escalate to human staff for anything you cannot handle or any emergency.",
    properties: { reason: str("Why staff are needed"), urgency: str("routine, urgent or emergency") },
    required: ["reason", "urgency"],
  },
];

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (dry) {
    console.log(`[dry-run] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 300) : "");
    return {} as T;
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": key!, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function pickVoice(): Promise<string | undefined> {
  if (voiceArg) return voiceArg;
  try {
    type Shared = { voices: { voice_id: string; public_owner_id: string; name: string; accent?: string; gender?: string; cloned_by_count?: number; description?: string }[] };
    const q = new URLSearchParams({ page_size: "30", gender: "female", language: "en", accent: "indian", sort: "cloned_by_count" });
    const { voices = [] } = await api<Shared>("GET", `/v1/shared-voices?${q}`);
    const warm = voices.find((v) => /warm|friendly|soft|calm|customer|support|conversational/i.test(`${v.name} ${v.description ?? ""}`)) ?? voices[0];
    if (!warm) return undefined;
    console.log(`voice: ${warm.name} (${warm.voice_id}) — adding to your library`);
    const added = await api<{ voice_id?: string }>("POST", `/v1/voices/add/${warm.public_owner_id}/${warm.voice_id}`, { new_name: `Asha · ${warm.name}` });
    return added.voice_id ?? warm.voice_id;
  } catch (err) {
    console.warn(`voice search failed, using the platform default voice: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

function saveAgentId(id: string) {
  const file = ".env.local";
  const line = `ELEVENLABS_AGENT_ID=${id}`;
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const next = /^ELEVENLABS_AGENT_ID=.*$/m.test(current) ? current.replace(/^ELEVENLABS_AGENT_ID=.*$/m, line) : `${current.trimEnd()}\n${line}\n`;
  writeFileSync(file, next);
}

async function main() {
  if (!key && !dry) throw new Error("ELEVENLABS_API_KEY is not set (add it to .env or .env.local)");

  const toolIds: string[] = [];
  for (const t of TOOLS) {
    const r = await api<{ id: string }>("POST", "/v1/convai/tools", {
      tool_config: {
        type: "client",
        name: t.name,
        description: t.description,
        parameters: { type: "object", properties: t.properties, required: t.required },
        expects_response: true,
        response_timeout_secs: 20,
      },
    });
    console.log(`tool ${t.name}: ${r.id ?? "(dry-run)"}`);
    toolIds.push(r.id);
  }

  const voiceId = await pickVoice();
  let agentId: string | undefined;
  for (const llm of [...LLM_PREFERENCE, undefined]) {
    try {
      const r = await api<{ agent_id: string }>("POST", "/v1/convai/agents/create", {
        name: "Asha, Fernleaf Clinic",
        conversation_config: {
          agent: {
            first_message: FIRST_MESSAGE,
            language: "en",
            prompt: { prompt: PROMPT, ...(llm ? { llm } : {}), tool_ids: toolIds, temperature: 0.3 },
          },
          ...(voiceId ? { tts: { voice_id: voiceId } } : {}),
          conversation: { max_duration_seconds: 300 },
        },
        platform_settings: { auth: { enable_auth: true } },
      });
      agentId = r.agent_id;
      console.log(`agent created with llm=${llm ?? "platform default"}`);
      break;
    } catch (err) {
      console.warn(`create with llm=${llm ?? "default"} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (dry) return;
  if (!agentId) throw new Error("Agent creation failed for every LLM option — follow the dashboard steps in PROGRESS.md.");
  saveAgentId(agentId);
  console.log(`\nELEVENLABS_AGENT_ID=${agentId}\nSaved to .env.local. Also set it in Railway → Variables.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
