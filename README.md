# FrontDesk AI

FrontDesk AI is a voice receptionist for outpatient clinics. A patient calls the clinic from their phone and talks to an AI agent. The agent answers policy questions from the clinic's own documents, finds and books an appointment, and collects a short pre-visit intake. Every step shows up live on a front-desk monitor. The booking and intake then go straight to the doctor: in Claude, through an MCP connector, the doctor can ask "What appointments do I have this week?" and see the patient who booked a minute ago. The demo customer is **Fernleaf Clinic**, a fictional multi-specialty clinic in Hyderabad. All data is synthetic.

## Architecture

```
 Phone browser (/call)                     Laptop browser (/monitor)            Claude.ai (doctor)
 ElevenLabs React SDK                      EventSource (SSE)                    Custom connector
      |  voice (WebRTC/WS)                        ^                                    |
      v                                           |                                    v
 ElevenLabs Agent  --client tool calls-->  [Phone page runs the tool,      ]   /api/mcp/[secret]
 (LLM + STT + TTS)                         [ POSTs to our API with call_id ]   (Streamable HTTP)
                                                  |                                    |
                                                  v                                    v
                                   Next.js API routes  ---->  lib/core (single source of business logic)
                                                  |                 |
                                                  |                 +--> event bus (in-memory) --> SSE
                                                  v
                                   Postgres + pgvector (Railway)
```

- **One core, many surfaces.** All business logic lives in `lib/core/*`. The voice tool routes and the MCP tools are thin adapters over the same functions, with zod schemas shared from `lib/schemas.ts`.
- **Client tools, not webhooks.** The ElevenLabs agent asks the phone browser to run each tool. The browser already knows the `call_id`, so it POSTs to `/api/tools/<name>` directly.
- **Events drive the monitor.** Every state change writes a row to `call_events` and publishes on an in-memory bus. `/monitor` is a projection of those events over SSE. After a refresh, `/api/monitor/latest` rebuilds the snapshot without duplicating cards.
- **Degrade, never crash.** Without `OPENAI_API_KEY`, policy search uses Postgres full-text search. Without `ANTHROPIC_API_KEY`, call summaries come from a template. Tool endpoints always return 200 with a message the agent can speak.

## Pages and endpoints

| Path | Method | What it is |
|---|---|---|
| `/` | GET | Landing page for FrontDesk AI, with live clinic numbers from the DB |
| `/call` | GET | Patient phone page (idle, connecting, in-call, ended, error). `/call?preview=<state>` renders one state statically |
| `/monitor` | GET | Live front-desk monitor for the projector. `/monitor?admin=<ADMIN_TOKEN>` adds a reset button |
| `/api/health` | GET | DB status, row counts, enabled features |
| `/api/calls` | POST | Start a call and return `{ call_id }` |
| `/api/calls/[id]/transcript` | POST | Append a transcript line `{ role, text }` |
| `/api/calls/[id]/end` | POST | End the call and generate the summary (idempotent) |
| `/api/tools/[tool]` | POST | Voice agent tools: `search_policy`, `check_availability`, `book_appointment`, `save_intake`, `flag_for_staff` |
| `/api/monitor/stream` | GET | SSE event stream for the monitor |
| `/api/monitor/latest` | GET | Snapshot of the current or most recent call |
| `/api/eleven/session` | GET | ElevenLabs signed URL for the browser (503 until the agent is configured) |
| `/api/admin/reset` | POST | Remove demo calls and bookings, reopen slots. Header `x-admin-token` |
| `/api/admin/seed` | POST | Re-seed everything relative to today. Header `x-admin-token` |
| `/api/mcp/[MCP_SECRET]` | GET/POST/DELETE | MCP server for Claude. Read: `get_schedule`, `get_patient_brief`, `list_recent_calls`, `search_policy`. Act: `block_day`, `reopen_day`, `notify_front_desk` |
| `/api/desk/notes/[id]/done` | POST | Dismiss a doctor's note on the monitor. Header `x-admin-token` |

## How RAG works

1. **Chunking.** Each policy document in `data/policies/*.md` is split on `## ` headings, so one chunk is one section (for example "Orthopaedics › What to bring"). The seed stores 57 chunks with their document title and section heading.
2. **Embeddings.** When `OPENAI_API_KEY` is set, the seed embeds each chunk with `text-embedding-3-small` (1536 dimensions) into a pgvector column.
3. **Retrieval.** `search_policy` embeds the question and ranks chunks by cosine distance in pgvector, then returns the top hits with document and section so the monitor can show which policy the agent used.
4. **Fallback.** Without embeddings, retrieval uses Postgres full-text search with an OR query and a small synonym table (knee → orthopaedics, cost → fee). Natural questions still find the right section this way, while `websearch_to_tsquery` would AND every word and return nothing.

## How MCP works

`/api/mcp/<MCP_SECRET>` is a stateless Streamable HTTP MCP server built with `mcp-handler`. A wrong secret returns 404. Its doctor-facing tools return clean markdown:

- `get_schedule`: the doctor's appointments for a range (`today`, `tomorrow`, `this_week`, `next_7_days`). It opens with a "New from the AI receptionist" callout so fresh bookings stand out, and each is marked "Booked by AI receptionist" with its intake.
- `get_patient_brief`: a patient's details, intake answers, and call summary.
- `list_recent_calls`: recent calls with outcome and summary.
- `search_policy`: the same policy search the voice agent uses.

The doctor can also act from Claude. Each of these tools asks Claude to confirm with the doctor before running:

- `block_day`: marks the doctor unavailable for one day ("Saturday", "the 10th"). It closes that day's open slots so Asha can't offer them, flags the patients already booked for the front desk to reschedule, and alerts the monitor. It never cancels appointments or contacts patients.
- `reopen_day`: undoes a block.
- `notify_front_desk`: sends a note that appears on the monitor's top bar.

**Reset demo** clears all of these. `npx tsx scripts/desk-check.ts` exercises them over MCP and then undoes them.

**Connect it to Claude:** in claude.ai, open Settings → Connectors → Add custom connector and paste `https://<your-domain>/api/mcp/<MCP_SECRET>`. Then ask "What appointments do I have this week?"

To test without Claude, run `npx tsx scripts/mcp-check.ts`, which lists and calls all four tools. The MCP Inspector UI also works with Node 22 or newer: run `npx @modelcontextprotocol/inspector`, choose Streamable HTTP, and enter the same URL.

## Setup

Requires Node 20+ and Postgres 16 with pgvector.

```bash
npm install
cp .env.example .env.local        # fill DATABASE_URL, MCP_SECRET, ADMIN_TOKEN (others optional)

# Local Postgres with pgvector, if you need one
docker run -d --name frontdesk-pg -p 55433:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg16

npm run migrate
npm run seed                      # dates are relative to today: re-run on demo morning
npm run dev                       # http://localhost:3100
```

Scripts load `.env` and then `.env.local`. Values in `.env.local` win.

| Command | Does |
|---|---|
| `npm run simulate [-- --base URL --speed N --reset --scenario S]` | Replays a call against the API, without voice. `booking` (default) is the rehearsed knee-pain call; `info` asks policy questions only; `emergency` reports chest pain and escalates to staff |
| `npm run reset` | Removes demo calls and bookings and reopens slots. Does not move dates, so use `seed` for that |
| `bash scripts/curl-checkpoint.sh` | Runs every tool endpoint with curl (set `BASE`) |
| `npx tsx scripts/check-schedule.ts this_week` | Prints the `get_schedule` markdown |
| `npx tsx scripts/mcp-check.ts` | Lists and calls all MCP tools over HTTP |
| `npx tsx scripts/e2e-flow.ts [--base URL]` | Full check: health → reset → simulated call driving a real browser on `/monitor` (incl. mid-call refresh) → MCP shows booking → reset |
| `npx tsx scripts/race-check.ts [--base URL]` | Sends 10 simultaneous bookings for one slot; exactly one must succeed |
| `npx tsx scripts/shoot-scenarios.ts`, `shoot-monitor.ts`, `shoot-landing.ts` | Playwright screenshots into `screenshots/` |
| `npm run build && npm start` | Production build. Set `NEXT_DIST_DIR=.next-prod` to build next to a running `npm run dev` |

## ElevenLabs agent setup

The agent prompt and tool definitions are in `agent/`: `system-prompt.md`, `prompt.txt`, and `tools.md`.

**Scripted:** put `ELEVENLABS_API_KEY` in `.env.local`, then run:

```bash
npx tsx scripts/create-eleven-agent.ts --dry-run   # shows the requests
npx tsx scripts/create-eleven-agent.ts             # creates 5 client tools + agent, writes ELEVENLABS_AGENT_ID to .env.local
```

**Dashboard fallback:**

1. Create an agent and paste `agent/prompt.txt` as the system prompt.
2. Set the first message, pick an Indian-English voice, and choose Claude Haiku as the LLM.
3. Enable authentication so only signed URLs work, and set the max duration to 300 s.
4. Add the five tools from `agent/tools.md` as **Client** tools with **Wait for response** on. Names and parameter identifiers must match exactly.
5. Copy the agent ID into `ELEVENLABS_AGENT_ID`.

To check the setup, `GET /api/eleven/session` should return `{ "signedUrl": ... }`.

After editing `agent/prompt.txt`, push it to the live agent with `npx tsx scripts/update-eleven-prompt.ts`. It keeps the agent's tools and model.

## Deploying (Railway)

Live: **https://frontdesk-ai-production-eff4.up.railway.app** (Railway project `courteous-youthfulness`, services `pgvector` + `frontdesk-ai`, auto-deploys on push to `main`).

1. Create a Postgres service from Railway's **pgvector** template.
2. Add a service from this GitHub repo. `railway.json` sets the start command (`npm run migrate && npm run seed -- --if-empty && npm start`), so a fresh database is migrated and seeded on first boot, while an existing one is left alone. It also sets the `/api/health` health check.
3. Set the env vars from `.env.example`. Use `DATABASE_URL=${{pgvector.DATABASE_URL_PRIVATE}}` (Railway's private network).
4. Generate a domain: `railway domain --service frontdesk-ai`.
5. To re-seed later, e.g. on demo morning, no database access is needed:
   ```bash
   curl -X POST https://<app>/api/admin/seed -H "x-admin-token: <ADMIN_TOKEN>"
   ```
6. To verify, pass the production secrets: `MCP_SECRET=… ADMIN_TOKEN=… npx tsx scripts/e2e-flow.ts --base https://<app>`. Get them with `railway variables --service frontdesk-ai`.

## Quality checks (local, production build)

| Check | Result |
|---|---|
| `npm run build` / `npm run typecheck` | Pass, zero errors |
| `e2e-flow.ts` against `npm start` | All checks pass, including mid-call refresh with no duplicate cards |
| Monitor event stream after a server restart | Reconnects and shows the next call without a page reload |
| `race-check.ts` (10 simultaneous bookings for one slot) | 1 booked, 9 got a speakable refusal, all HTTP 200 |
| Lighthouse accessibility | `/call` 100 · `/monitor` 100 · `/` 100 |
| Secrets in client bundles | None. `MCP_SECRET`, `ADMIN_TOKEN` and `DATABASE_URL` values, and the API key names, are absent from `static/` |

## Cost per call (measured)

These numbers come from the three real test calls on 8 Oct 2026, read from the ElevenLabs conversation records (`GET /v1/convai/conversations/:id`). The plan is ₹100 for 30,000 credits, so 1 credit = ₹0.0033.

| Call | Length | Credits billed | Claude Haiku 4.5 input tokens | Output tokens |
|---|---|---|---|---|
| 1 | 118 s | 623 | 46,890 | 844 |
| 2 | 159 s | 745 | 50,832 | 927 |
| 3 | 156 s | 797 | 53,483 | 953 |
| **Average** | **144 s (2.4 min)** | **722** | **50,402** | **908** |

- **One typical session (one booking call): 722 credits ≈ ₹2.41**, or about ₹1.00 per minute of talk. This is the all-in voice cost: speech-to-text, the Claude Haiku 4.5 usage below (about $0.06 at list price) and text-to-speech are all billed inside these credits.
- **LLM tokens per call:** about 50,000 input and 900 output (Claude Haiku 4.5 inside ElevenLabs). Input is large because the system prompt and the growing conversation are re-sent on each of the ~16 agent turns. ElevenLabs reported zero cached input tokens.
- **Other AI cost: ₹0 today.** The pre-visit brief uses the template (no Anthropic key) and policy search uses full-text search (no OpenAI key). With both keys on, the brief costs about 1,000 Haiku tokens and the embeddings about 20 tokens per question, a few paise per call.
- **Hosting:** one Railway app and one Postgres instance, a fixed monthly cost that doesn't grow with calls at this scale.

### At 10,000 users

Assume 1 call per user per month: 10,000 calls × ₹2.41 ≈ **₹24,000 per month** (7.2 million credits). The current plan's 30,000 credits cover only about 41 calls a month, so this needs a higher ElevenLabs tier, where credits cost less.

What we'd change at that scale:
1. **Prompt caching.** The ~50,000 input tokens per call are mostly the same prompt re-sent every turn; caching it cuts the LLM part sharply.
2. **Shorter turns.** Asha's replies are already capped at one or two sentences; fewer turns per booking lowers both voice and LLM cost.
3. **Telephony and speech.** A SIP phone number replaces the web page, and self-hosted open speech models become worth testing once volume justifies the hardware.
4. **RAG with embeddings.** Turn on `text-embedding-3-small` for better paraphrase matching. The cost is negligible.

## Known limitations

- No real phone number yet. Patients call from a web page; Twilio or SIP telephony would be the next step.
- Single clinic and single tenant.
- MCP auth is a secret token in the URL, not OAuth.
- Synthetic data only. This is not a medical device, and the agent never diagnoses.
- The event bus is in-memory, so it assumes one app instance.

## Demo-day runbook

1. **Morning:** re-seed production so the dates are relative to today: `curl -X POST https://<app>/api/admin/seed -H "x-admin-token: <ADMIN_TOKEN>"`. Open `https://<app>/monitor?admin=<ADMIN_TOKEN>` on the laptop in full screen. Run one test call, then press **Reset demo** on the monitor.
2. **Ten minutes before:** open `/call` on the presenting phone, using mobile data rather than campus Wi-Fi, and grant mic permission once. Open claude.ai on the laptop in a second window with the connector enabled. Run one `get_schedule` query to warm it up.
3. **Fallbacks, in order:**
   - Call from the laptop's `/call` page if the phone fails.
   - Run `npm run simulate -- --base https://<app>` against production if voice fails entirely. Add `--scenario info` or `--scenario emergency` for the other endings.
   - Play the recorded backup video if the network fails.
