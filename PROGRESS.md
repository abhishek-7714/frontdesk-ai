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
