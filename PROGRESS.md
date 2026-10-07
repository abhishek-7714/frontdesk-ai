# PROGRESS

(Morning checklist will replace this header when the overnight run finishes.)

## Environment findings (start of run)
- `.env` contained **only** `DATABASE_URL`. OPENAI_API_KEY, ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, MCP_SECRET, ADMIN_TOKEN were absent (not in the shell either).
- The Railway `DATABASE_URL` timed out on TCP connect from this machine (tried psql and `nc`, inside and outside the sandbox).
- Per your mid-run instruction: started a local `pgvector/pgvector:pg16` container `frontdesk-pg` on **port 55433** (54329 was taken by an unrelated SSH tunnel, left alone).
- Writing to `.env` was blocked by the permission guard, so `.env` is **untouched**. Overrides live in `.env.local` (gitignored): local `DATABASE_URL`, generated `MCP_SECRET`, `ADMIN_TOKEN`. Next.js and all scripts load `.env` then `.env.local` (local wins).

## Phase log

### Phase 1 — Skeleton and data ✅
- Next.js 15.5 + React 19 + Tailwind v4 + Inter / Inter Tight, tokens in `app/globals.css`.
- `npm run migrate && npm run seed` pass against local pgvector. `/api/health`: doctors 3, slots 252, policy_chunks 57 (embedded 0 — no OPENAI key, FTS fallback active).
- Decisions:
  - Built in the project root (not a `frontdesk-ai/` subfolder) — this folder is the repo.
  - Dev server runs on **port 3100** (port 3000 is used by another app on this Mac).
  - mcp-handler 2.x is installed → uses `@modelcontextprotocol/server` v2 + zod 4 (README requirement).
  - TypeScript pinned to 5.x (npm resolved TS 7, which Next 15 does not support).
  - Seed guarantee: Dr. Iyer's 2nd upcoming working day has the morning fully booked and **16:00 open**, so "ortho this week" deterministically offers the rehearsed 4 PM slot.
  - The seed is relative to "now": **re-run `npm run seed` on the morning of the demo** (reset alone does not move dates).

### Phase 2 — Core and tool endpoints ✅
- `lib/core/*` (calls, policy, scheduling, intake, escalation, patients), `lib/schemas.ts`, `lib/events.ts`, `/api/tools/[tool]`, calls routes, SSE stream, latest snapshot, admin reset, `/api/eleven/session`.
- Checkpoint: `bash scripts/curl-checkpoint.sh` creates a call → policy search (top hit "Orthopaedics › What to bring") → availability for "ortho this week" (today 5 PM, Fri 10:30, **Sat 4 PM**) → book (repeat is idempotent, same appointment id) → intake ×2 (merged) → end (template summary). `npx tsx scripts/check-schedule.ts this_week` shows the booking with intake + summary; `npm run reset` removes it and reopens the slot.
- Decisions:
  - FTS fallback uses an OR query with a small synonym table (knee→orthopaedics, cost→fee…), because `websearch_to_tsquery` ANDs every word and returned nothing for natural questions.
  - Tool inputs tolerate LLM quirks: null/"" optional fields, numeric strings for slot_id, unknown time_preference → "any".
  - `get_schedule` markdown opens with a "New from the AI receptionist" callout so the fresh booking is impossible to miss among ~30 seeded appointments.
  - Tools auto-create a call row if a tool arrives with an unknown call_id (never fails the agent).

### Phase 3 — Simulator and monitor ✅ (+ Task 2 design pass)
- `npm run simulate [-- --base URL --speed N --reset]` replays the rehearsed knee-pain call (picks the 4 PM slot).
- `/monitor`: idle = frame-05 composition (floating widgets fed by live DB stats); on `call.started` the transcript (left) and event feed (right) slide in; ended = "Booked and briefed" + pre-visit brief card + "Shared with Dr. Meera Iyer · available in Claude" pill.
- Design rounds (Playwright, `scripts/shoot-monitor.ts`, both 1920×1080 and 1440×900):
  - R1: headline collided with widgets, ring card crowded the top bar, empty "—" avg-call, Next.js dev badge visible, dead space under the waveform, summary capitalisation, timer vs chip mismatch.
  - R2: recomposed idle around a clear headline zone (112 px), vertically centred live column, dev indicator off, timer uses server duration, template summary fixed.
  - R3: balanced bottom row, slightly stronger agent-bubble contrast. Final set in `screenshots/monitor-*.png`.
- Decision: the monitor renders a fixed 1920×1080 design canvas scaled to the viewport (canvas extends on the long axis), so it can never overflow or scroll on any projector resolution.

### Phase 4 — MCP ✅
- `/api/mcp/<MCP_SECRET>` (mcp-handler 2.x, stateless Streamable HTTP; wrong secret → 404). Tools: `get_schedule`, `get_patient_brief`, `list_recent_calls`, `search_policy`, descriptions verbatim from SPEC §8, clean markdown output.
- Checkpoint: after a simulated call, `npx tsx scripts/mcp-check.ts` lists all 4 tools and runs each; `get_schedule` shows the new booking under "New from the AI receptionist" with intake, and the patient brief includes intake + call summary.
- Decision: MCP Inspector v2 requires Node ≥ 22 (this Mac has Node 20) and Inspector v1's CLI rewrote the URL path to `/mcp`, so verification uses `scripts/mcp-check.ts`, which speaks the same JSON-RPC over Streamable HTTP. With Node 22 you can still use the Inspector UI: `npx @modelcontextprotocol/inspector`, transport Streamable HTTP, URL `https://<domain>/api/mcp/<MCP_SECRET>`.

### Phase 5 — Phone page ✅ (UI + SDK wiring) · live voice ⛔ blocked on ElevenLabs key
- `/call` with idle, connecting, in-call, ended, error states (`/call?preview=<state>` renders each statically). Screenshots at 390×844 in `screenshots/call-390-*.png`, laptop at `screenshots/call-1440-idle.png`.
- Round 1 vs `01-hero-botanical.png`: the photo was hidden behind the body background (stacking context) and the in-call view overflowed 844 px. Round 2: `isolate` wrapper, tighter in-call spacing, radial scrim + text shadow for 4.5:1 text contrast over the flowers.
- ElevenLabs wiring per SPEC §10.1: mic permission inside the tap, `POST /api/calls` + `GET /api/eleven/session` (signed URL; falls back to `agentId` if the server returns one), five client tools that POST `{call_id, ...params}` and return `JSON.stringify(result)` or the speakable message, 6 s timeout fallback, final transcripts forwarded with role mapping, `/end` exactly once (ref guard), Screen Wake Lock.
- Not verified: a real voice call (needs ELEVENLABS_API_KEY + agent).

### Task 4 — ElevenLabs agent ⛔ SKIPPED (no ELEVENLABS_API_KEY in .env)
- Prepared `scripts/create-eleven-agent.ts` (request format checked against current docs: `POST /v1/convai/tools` ×5 with `type: client`, `expects_response: true`, then `POST /v1/convai/agents/create` with `tool_ids`, `llm: claude-haiku-4-5` (fastest Claude in their list; falls back to sonnet-4-5 → sonnet-4-6 → platform default), auth enabled, 300 s max, first message, system prompt from `agent/prompt.txt`, and an Indian-English female voice found via `/v1/shared-voices`). Dry run passes. It writes `ELEVENLABS_AGENT_ID` into `.env.local`.
- `/api/eleven/session` returns 503 "Voice agent is not configured" until both the key and the agent ID are set; verify it returns `{ signedUrl }` after setup.
- Dashboard fallback steps are in the README ("ElevenLabs agent setup").

### Phase 6 — Deploy ⛔ blocked (no Railway CLI on this Mac; Railway DATABASE_URL unreachable from here)
- Steps are in the README ("Deploying (Railway)"). After deploying, run `npx tsx scripts/e2e-flow.ts --base https://<app>.up.railway.app`.

### Phase 7 — Polish and README ✅
- README + `.env.example`. Titles and favicon were already in place.
- Simulator scenarios `--scenario booking|info|emergency`. The monitor's non-booking endings now read correctly: "Call summary" and a "Front desk alerted" pill for escalations, not the doctor handoff. Template summaries for information calls name the policy topics consulted. Screenshots: `screenshots/monitor-*-{info,emergency}-*.png`.
- Bug fixed: `/call` created the call row before checking the voice session, so a failed start flipped the projector to "Incoming call". The page now gets the session first.
- Monitor reopens the event stream with backoff if the browser gives up (verified by killing and restarting the server mid-session).
- Quality bar verified on a production build: build passes, e2e passes, race check passes, Lighthouse a11y 100 on `/call`, `/monitor` and `/`, no secrets in client bundles (README "Quality checks").

### Phase 8 — Landing page ✅
- `/` is now the landing page. It has five sections in the reference styles, and its stat widgets read live numbers from the DB, with an offline fallback if the DB is down. The demo still uses `/call` and `/monitor` directly.
- Checked at 1440 and 390 wide with no horizontal overflow (`scripts/shoot-landing.ts`).

### Still needs keys / you
- `ELEVENLABS_API_KEY` → `npx tsx scripts/create-eleven-agent.ts` → a real voice call (the Phase 5 checkpoint).
- Railway deploy (Phase 6), then connect the MCP URL in claude.ai.
- Cost per call in the README after the first real call.
- Optional: `OPENAI_API_KEY` (embeddings) and `ANTHROPIC_API_KEY` (LLM summaries). Re-run `npm run seed` after adding the OpenAI key so chunks get embedded.
