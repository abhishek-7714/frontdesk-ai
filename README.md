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
| `/` | GET | Redirects to `/call` |
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
| `/api/mcp/[MCP_SECRET]` | GET/POST/DELETE | MCP server for Claude. Tools: `get_schedule`, `get_patient_brief`, `list_recent_calls`, `search_policy` |

## How RAG works

1. **Chunking.** Each policy document in `data/policies/*.md` is split on `## ` headings, so one chunk is one section (for example "Orthopaedics › What to bring"). The seed stores 57 chunks with their document title and section heading.
2. **Embeddings.** When `OPENAI_API_KEY` is set, the seed embeds each chunk with `text-embedding-3-small` (1536 dimensions) into a pgvector column.
3. **Retrieval.** `search_policy` embeds the question and ranks chunks by cosine distance in pgvector, then returns the top hits with document and section so the monitor can show which policy the agent used.
4. **Fallback.** Without embeddings, retrieval uses Postgres full-text search with an OR query and a small synonym table (knee → orthopaedics, cost → fee). Natural questions still find the right section this way, while `websearch_to_tsquery` would AND every word and return nothing.

## How MCP works

`/api/mcp/<MCP_SECRET>` is a stateless Streamable HTTP MCP server built with `mcp-handler`. A wrong secret returns 404. It exposes four doctor-facing tools, each returning clean markdown:

- `get_schedule`: the doctor's appointments for a range (`today`, `tomorrow`, `this_week`, `next_7_days`). It opens with a "New from the AI receptionist" callout so fresh bookings stand out, and each is marked "Booked by AI receptionist" with its intake.
- `get_patient_brief`: a patient's details, intake answers, and call summary.
- `list_recent_calls`: recent calls with outcome and summary.
- `search_policy`: the same policy search the voice agent uses.

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
| `npm run simulate [-- --base URL --speed N --reset]` | Replays the rehearsed knee-pain call against the API, without voice |
| `npm run reset` | Removes demo calls and bookings and reopens slots. Does not move dates, so use `seed` for that |
| `bash scripts/curl-checkpoint.sh` | Runs every tool endpoint with curl (set `BASE`) |
| `npx tsx scripts/check-schedule.ts this_week` | Prints the `get_schedule` markdown |
| `npx tsx scripts/mcp-check.ts` | Lists and calls all MCP tools over HTTP |
| `npx tsx scripts/e2e-flow.ts [--base URL]` | Full check: health → reset → simulated call driving a real browser on `/monitor` (incl. mid-call refresh) → MCP shows booking → reset |
| `npm run build && npm start` | Production build |

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

## Deploying (Railway)

1. Create a Postgres service from Railway's **pgvector** template.
2. Deploy this repo from GitHub. Set the start command to `npm run migrate && npm start`.
3. Set the env vars from `.env.example`. `DATABASE_URL` should reference the pgvector service.
4. Seed once with `railway run npm run seed`, and again on demo morning.
5. Verify the deploy with `npx tsx scripts/e2e-flow.ts --base https://<app>.up.railway.app`.

## Cost per call

> **To fill in after the first real call.** These numbers must come from a measured call. They are not filled in yet because no live voice call has run.

| Item | Source | Per call |
|---|---|---|
| ElevenLabs Conversational AI minutes | ElevenLabs dashboard → call history | _TBD_ |
| Claude Haiku summary tokens | `SELECT summary_input_tokens, summary_output_tokens FROM calls ORDER BY started_at DESC LIMIT 1;` | _TBD_ |
| Embeddings (one query per policy question) | `text-embedding-3-small`, ~20 tokens | ≈ $0 |
| **Total** | | _TBD_ |

To project costs to 10,000 users: monthly cost = cost per call × calls per user per month × 10,000. Hosting adds a fixed Railway cost for one app and one Postgres instance.

## Known limitations

- No real phone number yet. Patients call from a web page; Twilio or SIP telephony would be the next step.
- Single clinic and single tenant.
- MCP auth is a secret token in the URL, not OAuth.
- Synthetic data only. This is not a medical device, and the agent never diagnoses.
- The event bus is in-memory, so it assumes one app instance.

## Demo-day runbook

1. **Morning:** run `npm run seed` (dates are relative to today), then `npm run reset`. Open `/monitor?admin=<token>` on the laptop in full screen. Run one test call, then reset again.
2. **Ten minutes before:** open `/call` on the presenting phone, using mobile data rather than campus Wi-Fi, and grant mic permission once. Open claude.ai on the laptop in a second window with the connector enabled. Run one `get_schedule` query to warm it up.
3. **Fallbacks, in order:**
   - Call from the laptop's `/call` page if the phone fails.
   - Run `npm run simulate -- --base https://<app>` against production if voice fails entirely.
   - Play the recorded backup video if the network fails.
