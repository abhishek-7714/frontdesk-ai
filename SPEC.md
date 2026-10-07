# FrontDesk AI: Build Spec for Claude Code

> **Read this whole file before writing any code.** Then open every image in `design/reference/` and study them; they are the visual target. This spec is written to be executed top to bottom. The build order in section 12 is the order you work in, and each phase ends with a checkpoint you must pass before moving on.

---

## 0. Context and the one thing that matters

We are a team of MBA students presenting a B2B AI product in a live class pitch **tomorrow**. The product is **FrontDesk AI**, a voice receptionist for clinics. Our fictional customer is **Fernleaf Clinic**, a multi-specialty outpatient clinic in Hyderabad.

The single goal of this build is **one flawless four-minute live demo**. Every decision trades breadth for reliability. Do not add features that are not in this spec. When in doubt, choose the option with fewer moving parts.

### The demo, exactly as the audience will see it

| # | Presenter (on stage) | Projector (laptop, `/monitor`) |
|---|---|---|
| 1 | Opens `/call` on their phone, taps **Call the clinic**, phone on speaker near the mic | Monitor flips from "Waiting for a call" to "Incoming call", a timer starts, a live waveform line appears |
| 2 | "I've had knee pain for about two weeks. Can I see an orthopaedic doctor this week?" | The patient's words appear in the transcript card; a **Policy checked** card appears showing the orthopaedics policy chunk the agent retrieved |
| 3 | Agent offers 2 or 3 slots with doctor, day, time and fee | A **Slots offered** card animates in, styled like a scheduled-visits widget, with time chips |
| 4 | "Thursday at 4 works." Agent confirms name | A large **Appointment booked** card lands: big "16:00", doctor, day |
| 5 | Agent asks two or three intake questions; presenter answers | An **Intake** card fills in field by field |
| 6 | Presenter hangs up | A **Summary** card appears, then a pill: "Shared with Dr. Meera Iyer" |
| 7 | Presenter switches to Claude (claude.ai, custom connector added) as the doctor and types: "What appointments do I have this week?" | Claude calls our MCP tool `get_schedule` and lists the week, including the patient who booked one minute ago, with the intake summary |

Step 7 is the payoff. The data must flow from the voice call into Postgres and out through MCP with zero manual steps.

---

## 1. Architecture

**One Railway service** (a Next.js app) plus **one Railway Postgres with pgvector**. ElevenLabs hosts the voice agent. Nothing else.

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

### Architecture principles (non-negotiable)

1. **One core, many surfaces.** All business logic lives in `lib/core/*`. API routes for the voice agent and MCP tools are thin adapters that validate input with zod, call a core function, and format output. The voice agent and Claude must call the *same* functions, so their behaviour cannot drift.
2. **Schemas defined once.** Zod schemas for every tool input live in `lib/schemas.ts` and are reused by API routes and MCP tool registration.
3. **Every state change emits an event.** Core functions that change state call `emit(callId, type, payload)`, which persists to `call_events` and publishes to the in-memory bus. The monitor is a pure projection of events. This is what makes the demo visible.
4. **Client tools, not webhooks.** ElevenLabs tools are configured as **client tools**: the agent asks the phone browser to run the tool; the browser already knows `call_id` and calls our API. This avoids webhook auth, public-URL tool configuration, and call correlation problems.
5. **Degrade, never crash.** Missing `OPENAI_API_KEY` falls back to Postgres full-text search. Missing `ANTHROPIC_API_KEY` falls back to a template summary. Any tool error returns a polite, structured message to the agent instead of throwing.
6. **Deterministic demo data.** Seed is generated relative to *today* in `Asia/Kolkata`, with a fixed RNG seed, so the demo works on any date and every rehearsal starts from the same state. A reset endpoint restores it in one call.
7. **Timezone discipline.** Store `timestamptz`. Compute and present everything in `Asia/Kolkata`. Never let the LLM produce ISO dates; the server resolves "this week", "tomorrow", "Thursday".

---

## 2. Tech stack (pin these)

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | `next start -p $PORT` on Railway (long-running Node server, SSE works) |
| Styling | Tailwind CSS v4 | Design tokens as CSS variables in `app/globals.css` (section 9) |
| Motion | `motion` package (`import { motion, AnimatePresence } from "motion/react"`) | Framer Motion's current package name |
| Fonts | `next/font/google`: **Inter Tight** (display), **Inter** (UI/body) | See typography rules in section 9 |
| Voice | `@elevenlabs/react` (`useConversation`) | It re-exports `@elevenlabs/client` |
| DB | Postgres 16 + pgvector on Railway, `pg` driver, plain SQL migrations | No ORM; keep it transparent |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) | Fallback: Postgres FTS |
| Summary LLM | Anthropic `claude-haiku-4-5` via `@anthropic-ai/sdk` | Fallback: template summary |
| MCP | `mcp-handler` + MCP TypeScript SDK, Streamable HTTP, stateless | **Before coding, read `node_modules/mcp-handler/README.md` for the installed major version and follow its API exactly** (v2 uses `server.registerTool` with `inputSchema` as a zod object and no `basePath`) |
| Validation | `zod` | Shared schemas |
| Scripts | `tsx` | migrate, seed, simulate |

Do not add: auth libraries, ORMs, Redis, state managers, component libraries (no shadcn), analytics.

---

## 3. Repository layout

```
frontdesk-ai/
  app/
    layout.tsx                 # fonts, globals, metadata
    globals.css                # tokens + base styles
    page.tsx                   # P2 marketing landing (only if time remains); until then redirect to /call
    call/page.tsx              # patient phone page (P0)
    monitor/page.tsx           # live call monitor for the projector (P0)
    api/
      health/route.ts
      eleven/session/route.ts  # returns signedUrl for the private ElevenLabs agent
      calls/route.ts           # POST create call
      calls/[id]/transcript/route.ts
      calls/[id]/end/route.ts
      tools/[tool]/route.ts    # one dynamic route dispatching to core tool functions
      monitor/stream/route.ts  # SSE
      monitor/latest/route.ts  # snapshot of latest call (for page load / reconnect)
      admin/reset/route.ts     # demo reset (ADMIN_TOKEN)
      mcp/[secret]/route.ts    # MCP server for Claude
  components/
    ui/                        # GlassCard, PillButton, Squircle, FlowerTile, InlinePillImage, LiveDot, Waveform
    call/                      # CallScreen, CallOrb, CallControls
    monitor/                   # MonitorShell, TranscriptCard, EventCard variants, IdleState
  lib/
    core/
      calls.ts                 # createCall, appendTranscript, endCall (summary)
      policy.ts                # searchPolicy (vector + FTS fallback)
      scheduling.ts            # checkAvailability, bookAppointment, getSchedule, resolveDayPreference
      intake.ts                # saveIntake
      escalation.ts            # flagForStaff
      patients.ts              # findOrCreatePatient, getPatientBrief
    events.ts                  # emit(), bus singleton on globalThis, event types
    db.ts                      # pg Pool singleton, query helper
    schemas.ts                 # zod schemas for every tool
    time.ts                    # IST helpers (formatting, day ranges)
    embeddings.ts
    llm.ts                     # summary generation with fallback
    env.ts                     # zod-validated env
  db/migrations/001_init.sql
  data/policies/*.md           # 10 clinic policy documents (section 6)
  scripts/
    migrate.ts
    seed.ts                    # doctors, slots, patients, appointments, policies + embeddings
    simulate-call.ts           # fake call that drives the monitor with realistic timing
  public/images/               # local botanical images (section 9.6), never hotlinked at runtime
  design/reference/            # reference frames (already provided)
  agent/
    system-prompt.md           # paste into ElevenLabs
    tools.md                   # tool definitions to create in ElevenLabs
  .env.example
  README.md
```

---

## 4. Environment variables

`lib/env.ts` validates these at boot with zod and logs which optional features are disabled.

```
DATABASE_URL=                 # Railway Postgres (pgvector)
ELEVENLABS_API_KEY=           # server only, for signed URLs
ELEVENLABS_AGENT_ID=
OPENAI_API_KEY=               # optional: embeddings (else FTS fallback)
ANTHROPIC_API_KEY=            # optional: call summaries (else template)
MCP_SECRET=                   # long random string; MCP URL is /api/mcp/<MCP_SECRET>
ADMIN_TOKEN=                  # for /api/admin/reset and monitor admin controls
DEMO_DOCTOR_SLUG=meera-iyer   # the doctor persona used in Claude
CLINIC_TZ=Asia/Kolkata
NEXT_PUBLIC_CLINIC_NAME=Fernleaf Clinic
```

---

## 5. Data model (`db/migrations/001_init.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE doctors (
  id serial PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  specialty text NOT NULL,            -- 'Orthopaedics' | 'Cardiology' | 'General Medicine'
  bio text NOT NULL,
  consult_fee_inr int NOT NULL,
  slot_minutes int NOT NULL DEFAULT 30
);

CREATE TABLE patients (
  id serial PRIMARY KEY,
  name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_seed boolean NOT NULL DEFAULT false
);

CREATE TABLE slots (
  id serial PRIMARY KEY,
  doctor_id int NOT NULL REFERENCES doctors(id),
  starts_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','booked','blocked')),
  UNIQUE (doctor_id, starts_at)
);

CREATE TABLE calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','ended')),
  patient_id int REFERENCES patients(id),
  summary text,
  summary_input_tokens int,
  summary_output_tokens int,
  eleven_conversation_id text
);

CREATE TABLE appointments (
  id serial PRIMARY KEY,
  slot_id int UNIQUE NOT NULL REFERENCES slots(id),
  doctor_id int NOT NULL REFERENCES doctors(id),
  patient_id int NOT NULL REFERENCES patients(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled')),
  source text NOT NULL CHECK (source IN ('voice_agent','seed')),
  call_id uuid REFERENCES calls(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intakes (
  id serial PRIMARY KEY,
  call_id uuid REFERENCES calls(id),
  appointment_id int REFERENCES appointments(id),
  chief_complaint text NOT NULL,
  duration text,
  severity text,               -- free text, e.g. "moderate, worse on stairs"
  current_medications text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE escalations (
  id serial PRIMARY KEY,
  call_id uuid REFERENCES calls(id),
  reason text NOT NULL,
  urgency text NOT NULL CHECK (urgency IN ('routine','urgent','emergency')),
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transcript_lines (
  id bigserial PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('patient','agent')),
  text text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE call_events (
  id bigserial PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE policy_chunks (
  id serial PRIMARY KEY,
  doc_slug text NOT NULL,
  doc_title text NOT NULL,
  section text NOT NULL,
  content text NOT NULL,
  embedding vector(1536),
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', doc_title || ' ' || section || ' ' || content)) STORED
);
CREATE INDEX ON policy_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON policy_chunks USING gin (tsv);
CREATE INDEX ON slots (doctor_id, starts_at);
CREATE INDEX ON call_events (call_id, id);
```

---

## 6. Seed data (`scripts/seed.ts`)

Idempotent: truncates and reseeds. Uses a fixed-seed RNG (e.g. mulberry32 with seed 42). All dates relative to "today" in IST.

### Doctors (fictional)

| slug | name | specialty | fee (INR) | bio (one line) |
|---|---|---|---|---|
| meera-iyer | Dr. Meera Iyer | Orthopaedics | 900 | Joint, knee and sports injuries; 14 years of practice |
| arjun-rao | Dr. Arjun Rao | Cardiology | 1,200 | Preventive cardiology and hypertension care |
| kavya-menon | Dr. Kavya Menon | General Medicine | 600 | Family medicine, fevers, routine check-ups |

### Slots

- Working days: Monday to Saturday. Sunday closed.
- Sessions: 10:00 to 13:00 and 16:00 to 19:00 IST, 30-minute slots (12 slots per doctor per day).
- Generate for today through today + 7 days. Slots earlier than "now + 60 min" today are `blocked`.
- Mark about 55% of future slots `booked` with seeded patients and appointments (`source='seed'`).
- **Guarantees for the demo (enforce after random fill):**
  - Dr. Meera Iyer has **at least 3 booked appointments today** (or the next working day if today is Sunday) and at least 8 across the week, each with a short seeded intake, so `get_schedule` looks like a real practice.
  - Dr. Meera Iyer has **at least 2 open slots on each of the next 3 working days**, including **16:00 on the second working day** (the rehearsed "Thursday at 4" equivalent).

### Seeded patients

About 30 fictional patients with plausible Indian names and fake numbers (`+91 98xxx xxxxx` pattern). Reasons for Dr. Iyer: lower back pain, post-ACL-surgery follow-up, shoulder stiffness, ankle sprain review, wrist fracture follow-up, etc. Seed intakes are one line each.

### Policy documents (`data/policies/*.md`)

Write 10 realistic markdown documents, 250 to 500 words each, with `##` sections (chunk by section). Facts must be consistent with the seed:

1. `fees-and-payments.md`: consult fees per specialty (above), follow-up within 7 days is free, UPI/cards/cash accepted, GST not applicable to consultations.
2. `timings-and-location.md`: Mon to Sat 10:00 to 13:00 and 16:00 to 19:00; Sunday closed; Road No. 12, Banjara Hills, Hyderabad; parking in basement.
3. `insurance-and-cashless.md`: empanelled with Star Health, HDFC ERGO, ICICI Lombard, Niva Bupa; outpatient consults are reimbursement only, not cashless; carry policy card and photo ID.
4. `cancellation-and-rescheduling.md`: free reschedule up to 2 hours before; no-show twice requires prepayment.
5. `orthopaedics-department.md`: conditions treated, what to bring (previous X-rays/MRI), wear loose clothing for knee exams, X-ray available on site (₹450).
6. `cardiology-department.md`: ECG on site (₹350), echo by appointment, bring BP log.
7. `general-medicine.md`: walk-ins accepted 10:00 to 11:00 only, vaccinations offered.
8. `test-preparation.md`: fasting 10 to 12 hours for lipid profile and fasting sugar; water allowed.
9. `emergencies-and-red-flags.md`: Fernleaf is outpatient only; chest pain, breathlessness, fainting, stroke signs, severe bleeding: call 112 or go to the nearest emergency department immediately.
10. `documents-and-first-visit.md`: arrive 10 minutes early, photo ID, previous prescriptions, list of medicines.

Embed each chunk with `text-embedding-3-small` in batches during seed. If `OPENAI_API_KEY` is missing, leave `embedding` null.

---

## 7. Core logic and API contracts

All tool endpoints: `POST /api/tools/[tool]` with JSON body `{ call_id, ...args }`. Validate with the zod schema for that tool. Respond `200` with `{ ok: true, result }` or `{ ok: false, message }` (still `200`, so the agent always gets something speakable). Target under 1.5 s per tool.

### 7.1 Calls

- `POST /api/calls` → `{ call_id }`. Emits `call.started`.
- `POST /api/calls/:id/transcript` body `{ role: 'patient'|'agent', text }` → inserts line, emits `transcript.line`. Ignore empty or tentative fragments (only final transcriptions).
- `POST /api/calls/:id/end` body `{ eleven_conversation_id? }` → sets `ended_at`, generates summary (7.7), emits `call.ended` with `{ summary, duration_s, appointment }`, then emits `handoff.ready` with `{ doctor_name }` 600 ms later.

### 7.2 `search_policy`

Input: `{ query: string }`. Embed query, cosine search top 4 (`embedding <=> $1`), filter similarity > 0.25. If no embeddings available, use `ts_rank` on `tsv` with `websearch_to_tsquery`. Result:

```json
{ "matches": [ { "doc_title": "Orthopaedics Department", "section": "What to bring", "content": "..." } ] }
```

Emit `tool.search_policy` with `{ query, top: { doc_title, section, snippet (first 180 chars) } }`.

### 7.3 `check_availability`

Input: `{ specialty?: string, doctor_name?: string, day_preference?: string, time_preference?: 'morning'|'afternoon'|'evening'|'any' }`.

- `resolveDayPreference` in `lib/core/scheduling.ts` maps natural phrases to IST date ranges: "today", "tomorrow", "this week" (today to Saturday), "next week", weekday names (next occurrence, including today if still bookable), "any"/missing (next 7 days). Write unit-style tests for it in a small script or vitest if time allows.
- Specialty matching is case-insensitive and tolerant ("ortho", "bones", "knee" all map to Orthopaedics; "heart" to Cardiology; anything else to General Medicine). Keep this mapping in one table.
- Return at most **3** open slots, spread across different days where possible, earliest first.

```json
{
  "today": "Thursday, 8 October",
  "doctor": { "name": "Dr. Meera Iyer", "specialty": "Orthopaedics", "fee_inr": 900 },
  "slots": [
    { "slot_id": 412, "spoken": "Friday the 9th at 11:30 AM" },
    { "slot_id": 437, "spoken": "Saturday the 10th at 4:00 PM" }
  ]
}
```

The `spoken` string is what the agent reads aloud. Emit `tool.check_availability` with doctor and slots (include `day_label` like "Fri 9" and `time_label` like "11:30").

### 7.4 `book_appointment`

Input: `{ slot_id: number, patient_name: string, patient_phone?: string, reason: string }`.

In one transaction: lock slot `FOR UPDATE`, check `open`, find or create patient (match on phone if given, else create), insert appointment (`source='voice_agent'`, `call_id`), set slot `booked`, set `calls.patient_id`. If the slot was taken, return `{ ok:false, message:"That slot was just taken. Please offer another time." }` plus two alternatives. Make the call idempotent per `(call_id, slot_id)`.

Result: `{ appointment_id, confirmation: "Booked with Dr. Meera Iyer on Saturday the 10th at 4:00 PM. Consultation fee is 900 rupees." }`. Emit `tool.book_appointment` with doctor, patient name, `day_label`, `time_label`, fee.

### 7.5 `save_intake`

Input: `{ chief_complaint: string, duration?: string, severity?: string, current_medications?: string, notes?: string }`. Links to the call's appointment if one exists. May be called more than once per call; upsert by `call_id` and merge non-empty fields. Emit `tool.save_intake` with all current fields so the monitor card fills in progressively.

### 7.6 `flag_for_staff`

Input: `{ reason: string, urgency: 'routine'|'urgent'|'emergency' }`. Insert escalation, emit `tool.flag_for_staff`.

### 7.7 Summary (`lib/llm.ts`)

On call end, build a two-to-three-sentence clinical-admin summary for the doctor from intake + appointment + transcript (last 40 lines). Use `claude-haiku-4-5`, `max_tokens: 200`, temperature 0.2, system prompt: "You write concise pre-visit briefs for doctors. Administrative facts and the patient's own words only. No diagnosis, no advice." Store token usage on the call row (used for the cost slide). Fallback template: `"{name}, booked for {day} {time}. Reports {chief_complaint} for {duration}; {severity}. Current medicines: {meds or 'none reported'}."`.

### 7.8 Events and SSE

`lib/events.ts`:

```ts
export type EventType =
  | 'call.started' | 'transcript.line'
  | 'tool.search_policy' | 'tool.check_availability' | 'tool.book_appointment'
  | 'tool.save_intake' | 'tool.flag_for_staff'
  | 'call.ended' | 'handoff.ready' | 'demo.reset';
export async function emit(callId: string, type: EventType, payload: unknown): Promise<void>;
```

- Bus: a Node `EventEmitter` stored on `globalThis.__fdBus` so it survives hot reload.
- `GET /api/monitor/stream`: `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';` Return a `ReadableStream` with `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Send a `: ping` comment every 15 s. Clean up the listener on `request.signal` abort.
- `GET /api/monitor/latest`: returns the most recent call with all its events in order. The monitor calls this on load and on every SSE reconnect, then applies live events (dedupe by event id).

### 7.9 Admin reset

`POST /api/admin/reset` with header `x-admin-token`. Deletes voice-agent appointments, their patients, intakes, escalations, calls (cascade transcript and events), and reopens their slots. Does not touch seed data. Emits `demo.reset` on the bus (no DB row) so the monitor returns to idle. Also expose `npm run reset` that calls it.

---

## 8. MCP server (the doctor's view in Claude)

Route: `app/api/mcp/[secret]/route.ts`. Wrap the `mcp-handler` handler: if `params.secret !== env.MCP_SECRET`, return `404`. Export the wrapper as `GET`, `POST` and `DELETE` as the installed version's README instructs. Server name `fernleaf-frontdesk`, version `1.0.0`.

The connector URL the doctor adds in Claude is `https://<railway-domain>/api/mcp/<MCP_SECRET>`.

Tool descriptions matter: Claude decides which tool to call from them. Write them exactly like this.

| Tool | Input (zod) | Description |
|---|---|---|
| `get_schedule` | `{ doctor?: string, range?: 'today'\|'tomorrow'\|'this_week'\|'next_7_days' }` | "Get a doctor's appointments at Fernleaf Clinic, with each patient's reason for visit and pre-visit intake summary. Defaults to the signed-in doctor, Dr. Meera Iyer, and to the next 7 days. Use this for any question about the doctor's schedule, upcoming patients, or who is coming in." |
| `get_patient_brief` | `{ patient_name: string }` | "Get the full pre-visit brief for one patient: upcoming appointment, intake answers, call summary and how they booked. Fuzzy-matches the name." |
| `list_recent_calls` | `{ limit?: number (default 5) }` | "List the most recent calls handled by the AI receptionist, with outcome (booked, information only, escalated) and summary." |
| `search_policy` | `{ query: string }` | "Search Fernleaf Clinic's internal policies (fees, insurance, timings, test preparation, department rules) and return the matching passages with their source document." |

Output format: return `content: [{ type: 'text', text }]` where `text` is **clean markdown** designed to read well in Claude. For `get_schedule`, group by day, and mark appointments booked by the AI receptionist in the last 24 hours:

```
**Dr. Meera Iyer · Orthopaedics · next 7 days (9 appointments)**

### Thursday, 8 October
- 10:30 · Ramesh Kulkarni · Lower back pain follow-up
  Intake: Pain improved since last visit, still stiff in the mornings.
- 16:00 · **Abhishek Jain** · Knee pain, 2 weeks · *Booked by AI receptionist 2 min ago*
  Intake: Pain on the right knee for two weeks, worse on stairs, moderate. No current medicines.
```

`get_schedule` resolves `doctor` by fuzzy match on name or slug; default `DEMO_DOCTOR_SLUG`. Booked-by-voice items must include the summary when one exists.

Verify with MCP Inspector: `npx @modelcontextprotocol/inspector`, transport Streamable HTTP, URL above. All four tools must list and run.

---

## 9. Design system (match `design/reference/` closely)

The reference is a premium health-tech site: **macro botanical photography, enormous light-weight grotesk headlines with tight tracking, frosted glass panels, soft periwinkle accents, large squircle cards, and floating widget cards**. It feels calm, expensive and organic. Reproduce that feeling. Do not reuse any text or imagery from the reference; reproduce the *style*.

### 9.1 What to take from each reference frame

| File | Pattern to reproduce |
|---|---|
| `01-hero-botanical.png` | Full-bleed dark botanical photo; centered giant white headline in two lines with an **inline rounded image pill** sitting inside the second line; small white body copy centered below; translucent pill CTA; small frosted promo card bottom-right; minimal top nav with logo left, links center, a white square icon button and an outlined icon button right |
| `02-lavender-feature-cards.png` | Pale lavender section; periwinkle headline, three centered lines; two large squircle cards side by side, one with dark floral image and white text, one with a soft blurred gradient and a row of rounded avatar tiles with carousel dots and a glass pill button |
| `03-dark-glass-panel-on-photo.png` | Wide **dark smoked glass** panel over a photo; segmented pill tabs at top (active tab is a lighter glass pill); thumbnail squircle left, bold title and muted body middle, two stacked glass pill buttons right; tiny outlined badges |
| `04-split-floating-tiles.png` | Split layout; left lavender with small eyebrow, large **grey** headline, solid periwinkle pill CTA, and **small rounded-square flower tiles floating** at scattered positions; right a photo with a tilted glass card |
| `05-blue-floating-widgets.png` | Solid periwinkle background; centered white headline with a small eyebrow; **white and translucent widget cards scattered around it** (ring progress card, line chart with a heart marker and a value tag, pill stat chips, a scheduled-visits card with big time and filter chips, a list card with toggles) |

**The `/monitor` page is built in the language of frame 05. The `/call` page is built in the language of frame 01 (with frame 03's glass). The optional landing page uses all five.**

### 9.2 Tokens (`app/globals.css`)

```css
:root {
  --periwinkle: #5C7DE4;        /* sampled from reference */
  --periwinkle-600: #4A69CF;
  --periwinkle-100: #DCE4FA;
  --lavender: #E6EBF5;          /* sampled from reference */
  --ink: #1C2333;
  --ink-muted: #6B7180;
  --headline-grey: #7A7F8C;     /* the grey headline in frame 04 */
  --white: #FFFFFF;
  --card-on-blue: #F3F6FE;      /* widget cards on periwinkle */
  --danger: #E5484D;
  --success: #3FBF8F;

  --glass-light-bg: rgba(255,255,255,0.14);
  --glass-light-border: rgba(255,255,255,0.28);
  --glass-dark-bg: rgba(38,38,44,0.42);
  --glass-dark-border: rgba(255,255,255,0.12);
  --glass-blur: 24px;

  --radius-sm: 12px;   /* chips */
  --radius-md: 20px;   /* small cards, tiles */
  --radius-lg: 28px;   /* widget cards */
  --radius-xl: 44px;   /* large feature cards */
  --radius-pill: 999px;

  --shadow-float: 0 20px 60px -20px rgba(20,30,80,0.35);
  --ease-out-expo: cubic-bezier(0.22, 1, 0.36, 1);
}
```

Glass utility: `background: var(--glass-light-bg); border: 1px solid var(--glass-light-border); backdrop-filter: blur(var(--glass-blur)) saturate(140%); -webkit-backdrop-filter: same;` Large cards use `--radius-xl`; where supported add `corner-shape: squircle` as progressive enhancement.

### 9.3 Typography

- **Display (Inter Tight, weight 400, never bold):** letter-spacing `-0.045em`, line-height `0.92`. Sizes: hero `clamp(56px, 9vw, 148px)`; section headline `clamp(40px, 5.5vw, 84px)`; monitor center headline `96px` at 1920 wide.
- **UI and body (Inter):** body 17/26, small 14/20, micro 12/16. Card titles Inter 500. Labels on glass are white at 80 to 90% opacity.
- Headline on light backgrounds is periwinkle (frame 02) or headline-grey (frame 04); on photos and on periwinkle it is white.
- Numbers in widgets (times, percentages) use Inter Tight 400 at large size with `font-variant-numeric: tabular-nums`.

### 9.4 Components (`components/ui`)

- `GlassCard` (variants `light`, `dark`, `solid-white`, `on-blue`), `radius` prop.
- `PillButton` (variants `glass`, `solid` periwinkle with white text, `white` with periwinkle text, `danger`), 48 to 56 px tall, Inter 500.
- `InlinePillImage`: an image squircle sized `0.82em` tall, `1em` wide, `border-radius: 0.22em`, vertically centered in a line of display text, with a subtle inner highlight. Used inside headlines exactly like the heart in frame 01.
- `FlowerTile`: rounded-square photo tile (48 to 96 px) that floats on a slow loop.
- `LiveDot`: 8 px dot with a pulsing ring.
- `Waveform`: an SVG line like the heart-rate line in frame 05, a thin white path animating continuously; amplitude driven by a `level` prop (agent speaking vs patient speaking vs idle).
- `Chip`: filter/time chips as in the scheduled-visits card.

### 9.5 Motion

- Default easing `--ease-out-expo`; springs `stiffness 140, damping 20` for cards.
- **Headline reveal:** split into words; each word animates from `opacity 0, y 24px, blur(8px)` to visible, 0.8 s, stagger 0.05 s.
- **Card entrance (monitor):** from `opacity 0, y 40, scale 0.92, rotate -4deg` to rest, spring. This mirrors the tilted tile that lands in the reference video.
- **Floating:** `FlowerTile` and idle widgets drift `y ±8px` over 6 to 8 s, each with a different phase.
- **Layout:** event feed uses `AnimatePresence` + `layout` so older cards slide down smoothly when a new one arrives.
- Respect `prefers-reduced-motion`: replace movement with opacity fades.

### 9.6 Imagery

Store every image locally in `public/images/` (the demo must not depend on a CDN). Use royalty-free photos from Unsplash (Unsplash License) or Pexels; download them during the build and record source URLs in `public/images/CREDITS.md`. Search terms and use:

| File | Search terms | Used on |
|---|---|---|
| `hero-forest-flowers.jpg` | "blue flowers forest dark moody macro", "forget-me-not forest" | `/call` background, landing hero |
| `petals-indigo.jpg` | "purple blue petals macro dark" | landing feature card, flower tiles |
| `lily-droplets.jpg` | "pink lily water droplets macro" | landing glass-panel section |
| `tile-1..5.jpg` | "single flower macro", various colours, cropped square | floating tiles |

If downloading is not possible, generate rich CSS fallbacks (layered radial gradients in deep teal, indigo and violet with a grain overlay via an inline SVG noise filter) so pages still look intentional. Doctor avatars: do not use photos of real people; use soft gradient squircles with initials.

---

## 10. Pages

### 10.1 `/call` (patient phone page, P0)

Mobile-first, designed at 390 x 844, must also look good on a laptop (centered column, max-width 440, photo still full-bleed).

**Layout (idle):**
- Full-bleed `hero-forest-flowers.jpg`, `object-cover`, with a top-to-bottom overlay `linear-gradient(rgba(10,20,25,0.35), rgba(10,20,25,0.15) 40%, rgba(10,20,25,0.65))`.
- Top bar: small leaf logo + "Fernleaf Clinic" (Inter 500, white) left; a white square icon button (phone icon, periwinkle) right, echoing frame 01.
- Headline centered in the upper half, display style, white: **"Care is [pill] one call away"**, with `InlinePillImage` (a flower tile) between "Care is" and "one", wrapping onto two lines like frame 01.
- Body (white 85%): "Talk to Asha, our AI receptionist. Ask about fees, insurance or timings, or book a visit in under a minute."
- Bottom: a light `GlassCard` (radius 32) containing a receptionist row (initials squircle "A", "Asha · AI receptionist", `LiveDot` + "Available now") and a full-width white `PillButton` **"Call the clinic"** with a phone icon.
- Tiny footer text: "Powered by FrontDesk AI".

**In call:**
- Headline crossfades to **"Connected to Asha"** with a running `mm:ss` timer below.
- Center: `CallOrb`, a 220 px glass circle with three concentric rings that scale and fade outward while `isSpeaking` is true (agent talking), and a gentler pulse when listening.
- Below the orb: the last transcript line in small white text (two lines max, fades between lines).
- Controls: glass mute button and a red `danger` end button (circles, 64 px).
- Connecting state: orb shimmer + "Connecting…". Error state: glass card with message and "Try again".

**Behaviour:**
1. On tap: request mic permission (must be inside the tap handler for iOS Safari), `POST /api/calls` → `call_id`, `GET /api/eleven/session` → `signedUrl`, then `conversation.startSession({ signedUrl })`. If the session route fails and a public agent id is configured, fall back to `{ agentId }`.
2. `clientTools`: one async function per tool name (`search_policy`, `check_availability`, `book_appointment`, `save_intake`, `flag_for_staff`). Each POSTs `{ call_id, ...params }` to `/api/tools/<name>` and **returns `JSON.stringify(result)`** (or the `message` on failure). Wrap each in a 6 s timeout that returns a speakable fallback.
3. `onMessage`: log the payload shape once in dev, then forward **final** user transcriptions and agent responses to `/api/calls/:id/transcript` with role `patient` or `agent`. Handle both `{ source, message }` and role-style payloads defensively.
4. `onDisconnect` (or end button): `endSession()`, then `POST /api/calls/:id/end` exactly once (guard with a ref).
5. Request a Screen Wake Lock during the call; release on end.

### 10.2 `/monitor` (projector view, P0)

Designed at **1920 x 1080** and must hold at 1440 x 900. No scrolling. Background solid `--periwinkle`. This is the frame-05 composition, live.

**Grid:** three columns `[520px | 1fr | 520px]`, 48 px padding, 32 px gaps.

- **Top bar:** leaf logo + "FrontDesk AI" (white, Inter 500) left; center "Fernleaf Clinic · Live front desk"; right a `LiveDot` with "Live" and, if `?admin=<ADMIN_TOKEN>` is in the URL, a small glass "Reset demo" button.
- **Center column:**
  - Eyebrow (white 80%, Inter 18): idle "Front desk", live "Incoming call", ended "Call complete".
  - Display headline (white, 96 px): idle **"Waiting for a call"**; live **caller name if known, else "New caller"**; ended **"Booked and briefed"** (or "Information only" / "Escalated to staff").
  - Under it: call timer in large tabular digits, and the `Waveform` across the column width, with a small value tag that says "Asha speaking" / "Patient speaking" (frame 05's "54 bpm" tag style). Drive the level from the most recent transcript role and timing.
  - Ended state: the **Summary card** (solid-white, radius 28, like the "Recovery goal" card) centered below, and the `handoff.ready` pill animating in: white pill, periwinkle text, "Shared with Dr. Meera Iyer · available in Claude".
- **Left column: Transcript card.** `GlassCard on-blue`, full height, title "Live transcript". Lines as bubbles: patient right-aligned white bubble with ink text, agent left-aligned translucent bubble with white text, Inter 20/30. Auto-scroll to newest with smooth motion; older lines fade at the top via a mask gradient.
- **Right column: Event feed.** Newest on top, max 5 visible. Card types:
  - `tool.search_policy` → **Policy checked**: white pill card, small grey label "Clinic policy", title = doc title, one-line snippet; small document icon.
  - `tool.check_availability` → **Slots offered**: white card like "Scheduled visits": doctor initials squircle + name + specialty + fee, then time chips row (`Fri 9 · 11:30`), chips animate in one by one.
  - `tool.book_appointment` → **Appointment booked**: white card with a periwinkle-tinted inner panel, very large time (`16:00`, Inter Tight 64), day label, doctor, patient name, a small "30 min" chip. On arrival, one soft glow pulse.
  - `tool.save_intake` → **Intake**: list card like "Taking pills": rows for Complaint, Duration, Severity, Medicines; each row appears as its field arrives, with a small green check toggle.
  - `tool.flag_for_staff` → **Escalated to staff**: white card with a red left accent and urgency chip.
- **Idle state:** center headline "Waiting for a call", decorative widget cards floating gently around the center at low opacity (today's stats from the DB: "Calls today", "Booked by AI", "Avg. call length"), like frame 05 before the call starts.
- New call (`call.started`) clears the previous call's cards with a fade, then begins fresh.

### 10.3 `/` landing (P2, only after P0 and P1 are complete and rehearsed)

Until then, `/` redirects to `/call`. If built, a single scrolling page for FrontDesk AI using all five reference patterns, in this order: (1) botanical hero "Every call answered, [pill] every patient heard" with CTA "Try the live line" linking to `/call` and a small glass promo card; (2) lavender section, periwinkle headline "Policy-grounded answers and a personal touch for every caller", two squircle cards "Voice receptionist" and "Your doctors, in Claude"; (3) lily photo with a dark glass panel and tabs "How it works · Under the hood · Pricing"; (4) split section with floating flower tiles, grey headline "Built for clinics that never want to miss a call", periwinkle CTA; (5) periwinkle stats section "Your whole front desk in one place" with floating widgets fed by live DB counts.

---

## 11. ElevenLabs agent configuration

Create the agent in the ElevenLabs dashboard. Save the exact text below into `agent/system-prompt.md` and `agent/tools.md` so the team can paste it.

- **Name:** Asha, Fernleaf Clinic
- **Voice:** a warm female voice with an Indian English accent from the voice library (test two or three; choose the one with the lowest perceived latency).
- **LLM:** the fastest Claude model offered in the agent's LLM dropdown (Haiku class); fall back to the platform default if Claude is unavailable.
- **Language:** English.
- **Authentication:** enabled (private agent; we use signed URLs).
- **Max call duration:** 5 minutes.
- **Turn-taking:** default; enable interruptions.

### First message

> Hello, thank you for calling Fernleaf Clinic. This is Asha. How can I help you today?

### System prompt

```
You are Asha, the receptionist at Fernleaf Clinic, a multi-specialty outpatient clinic in Banjara Hills, Hyderabad. You speak on the phone with patients.

Style
- Warm, calm, efficient. Indian English. One or two short sentences per turn. Never read lists longer than three items.
- Say dates and times naturally ("Saturday the 10th at 4 PM"). Never say IDs, codes or ISO dates.

What you can do
- Answer questions about fees, insurance, timings, location, test preparation and department rules. Every time the patient asks such a question, at any point in the call (including in the middle of booking), call search_policy with their question before you answer. Earlier search results do not count; search again for each new question. Answer only from what it returns, never from general knowledge.
- Only if search_policy returns nothing relevant, call flag_for_staff with urgency "routine" and say the front desk will call back. Never promise a call-back without calling flag_for_staff.
- Book appointments.
- Collect a short pre-visit intake.

Booking flow
1. Understand what the patient needs and which specialty fits: joints, bones, back, sports injuries go to Orthopaedics; heart, blood pressure, palpitations go to Cardiology; everything else goes to General Medicine.
2. Call check_availability with the specialty and the patient's day and time preferences in their own words (for example "this week", "Thursday", "tomorrow evening").
3. Offer at most three options using the "spoken" text, and mention the doctor's name and consultation fee once.
4. When they choose, confirm their full name, and ask for a mobile number. Read the number back once.
5. Call book_appointment with the chosen slot_id, name, and a short reason in the patient's words (no phone number; it comes from the call).
6. Then say you will ask two or three quick questions for the doctor. Ask, one at a time: what the problem is and how long it has been going on; how bad it is and what makes it worse; whether they take any regular medicines. After each answer, call save_intake with what you have so far.
7. Close: recap the doctor, day and time, remind them to bring previous reports, and say goodbye.

Safety rules (these override everything)
- You are not a doctor. Never diagnose, never suggest medicines or treatments, never interpret symptoms. If asked, say the doctor will advise at the visit.
- If the caller mentions chest pain, difficulty breathing, fainting, signs of stroke, severe bleeding, or thoughts of self-harm: immediately call flag_for_staff with urgency "emergency", tell them clearly to call 112 or go to the nearest emergency department now, and do not continue booking.
- If a tool fails, apologise briefly and offer to have the front desk call back.
```

### Client tools

Create each as **Tool type: Client**, **Wait for response: on**. Names and parameter identifiers must match the code exactly.

| Name | Description (paste as is) | Parameters |
|---|---|---|
| `search_policy` | Search Fernleaf Clinic's internal policies for fees, insurance, timings, location, test preparation and department rules. Call before answering any such question. | `query` (string, required): the patient's question rephrased as a search query |
| `check_availability` | Find open appointment slots. Returns up to three options with a slot_id and a spoken description. | `specialty` (string, optional), `doctor_name` (string, optional), `day_preference` (string, optional, in the patient's words), `time_preference` (string, optional: morning, afternoon, evening or any) |
| `book_appointment` | Book the slot the patient chose. | `slot_id` (number, required), `patient_name` (string, required), `patient_phone` (string, optional), `reason` (string, required) |
| `save_intake` | Save pre-visit intake answers for the doctor. Call after each answer with everything known so far. | `chief_complaint` (string, required), `duration` (string, optional), `severity` (string, optional), `current_medications` (string, optional), `notes` (string, optional) |
| `flag_for_staff` | Escalate to human staff for anything you cannot handle or any emergency. | `reason` (string, required), `urgency` (string, required: routine, urgent or emergency) |

---

## 12. Build order with checkpoints

Work strictly in this order. Do not start a phase until the previous checkpoint passes. Commit at every checkpoint.

**Phase 1: Skeleton and data (P0)**
Scaffold Next.js + Tailwind v4 + fonts + tokens; `lib/env.ts`, `lib/db.ts`; migration; seed with policies and embeddings; `/api/health` returning DB status, embedding count and enabled features.
✅ Checkpoint: `npm run migrate && npm run seed` succeeds locally against a Postgres with pgvector; `/api/health` reports doctors 3, slots > 200, policy chunks > 30.

**Phase 2: Core and tool endpoints (P0)**
`lib/core/*`, `lib/schemas.ts`, `lib/events.ts`, the tools route, calls routes, SSE stream, latest snapshot, admin reset.
✅ Checkpoint: a `curl` sequence (put it in README) creates a call, searches policy for "what should I bring for a knee appointment", checks availability for "ortho this week", books a slot, saves intake, ends the call; `get_schedule` core function shows the new booking; reset removes it.

**Phase 3: Simulator and monitor (P0)**
`scripts/simulate-call.ts` replays a realistic scripted call (the demo conversation in section 0) against the live API with human-like delays (patient lines 2 to 4 s apart, tool calls between). Then build `/monitor` against it.
✅ Checkpoint: `npm run simulate -- --base http://localhost:3000` makes the monitor play the whole story end to end, beautifully, at 1920 x 1080 and 1440 x 900. Take screenshots with Playwright (Chromium is preinstalled) and compare them against `design/reference/05-blue-floating-widgets.png` for spacing, type scale and card style. Iterate until it looks premium.

**Phase 4: MCP (P0)**
MCP route with four tools and markdown outputs.
✅ Checkpoint: MCP Inspector lists and runs all four tools; after a simulated call, `get_schedule` output shows the new booking marked "Booked by AI receptionist" with its intake.

**Phase 5: Phone page and voice (P0)**
`/call` UI first (idle, connecting, in-call, ended, error states, verified with Playwright screenshots at 390 x 844 against `01-hero-botanical.png`), then ElevenLabs wiring.
✅ Checkpoint: with the agent configured, a real call from a laptop browser books an appointment and the monitor reflects every step live.

**Phase 6: Deploy (P0)**
Railway: provision Postgres with pgvector (use Railway's pgvector Postgres template), deploy the app from GitHub, set env vars, start command `npm run migrate && npm start`, run seed once with `railway run npm run seed`. Confirm HTTPS domain.
✅ Checkpoint: real call from a phone on mobile data to the Railway URL works; connector added in claude.ai answers "What appointments do I have this week?" correctly.

**Phase 7: Polish and README (P1)**
Loading skeletons, error toasts, empty states, favicon, `<title>`s, README.

**Phase 8: Landing page (P2, optional)**

---

## 13. Quality bar and acceptance criteria

- No layout shift or overflow on the monitor at 1920 x 1080 or 1440 x 900; nothing scrolls.
- Every monitor card appears within 500 ms of its tool call completing.
- Monitor survives a page refresh mid-call (snapshot + reconnect, no duplicated cards).
- SSE reconnects automatically after a network blip.
- Tool endpoints never return non-200 to the agent; all failures are speakable.
- Booking is transactional and idempotent; double booking is impossible.
- `get_schedule` markdown renders cleanly in Claude and includes the fresh booking and its intake.
- Lighthouse accessibility ≥ 90 on `/call`; all icon buttons have `aria-label`; text on glass meets 4.5:1 contrast (darken overlay if needed).
- TypeScript strict passes; `npm run build` passes with zero errors.
- No secrets in client bundles (only `NEXT_PUBLIC_CLINIC_NAME` is public).

---

## 14. README (course submission)

The README must include: one-paragraph product description; architecture diagram (the ASCII from section 1 is fine); how RAG works (chunking by section, embeddings, pgvector cosine search, FTS fallback); how MCP works and how to connect it to Claude; setup steps (env, migrate, seed, run, simulate, reset); ElevenLabs agent setup (pointing to `agent/`); **cost per call** measured from a real call (ElevenLabs minutes from their dashboard, Haiku tokens from the `calls` table, embedding cost negligible) and the projection to 10,000 users; known limitations (no real telephony number yet, single clinic, token-in-URL MCP auth instead of OAuth, synthetic data only). Ship a `.env.example`; never commit `.env`.

---

## 15. Demo-day runbook (put this in README too)

1. Morning: `npm run reset`; open `/monitor?admin=<token>` on the laptop in full screen; run one test call; reset again.
2. Ten minutes before: open `/call` on the presenting phone (on mobile data, not campus Wi-Fi), grant mic permission once; open claude.ai on the laptop in a second window with the connector enabled; run one `get_schedule` query to warm it.
3. Fallbacks, in order: call from the laptop's `/call` page if the phone fails; run `npm run simulate` against production if voice fails entirely; play the recorded backup video if the network fails.
