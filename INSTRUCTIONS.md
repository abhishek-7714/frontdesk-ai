# FrontDesk AI: how to run and verify it

The submitted code contains **no API keys or secrets**. You add your own in one file, `.env.local`, as described below.

You can verify the product three ways, from least to most setup:

| Option | Time | Keys needed |
|---|---|---|
| A. Use the live deployment | 1 min | None |
| B. Run locally with a simulated call (full monitor, booking, MCP; no voice) | ~10 min | None (only a database) |
| C. Run locally with real voice calls | ~15 min | Your own ElevenLabs API key |

---

## A. Live deployment

- Patient phone page: https://frontdesk-ai-production-eff4.up.railway.app/call
- Front-desk monitor: https://frontdesk-ai-production-eff4.up.railway.app/monitor
- Landing page: https://frontdesk-ai-production-eff4.up.railway.app

Open the monitor on a laptop and `/call` on a phone, then book a visit by voice. The MCP link for Claude and the admin reset link contain secrets, so the team shares them on request instead of putting them in this zip.

---

## B. Run locally without any API key

**You need** Node.js 20 or newer, and Docker (for Postgres with pgvector).

```bash
# 1. Install
npm install

# 2. Start Postgres 16 with pgvector on port 55433
docker run -d --name frontdesk-pg -p 55433:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg16

# 3. Create your env file from the template
cp .env.example .env.local
```

Open `.env.local` and set these three values:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:55433/postgres
MCP_SECRET=any-long-random-string      # e.g. output of: openssl rand -hex 24
ADMIN_TOKEN=another-long-random-string # e.g. output of: openssl rand -hex 24
```

```bash
# 4. Create the tables and the demo data (10 policy documents, 3 doctors, a week of slots)
npm run migrate
npm run seed

# 5. Start the app on http://localhost:3100
npm run dev
```

Then verify:

1. Open http://localhost:3100/monitor in a browser (add `?admin=<your ADMIN_TOKEN>` for a Reset button).
2. In a second terminal, run `npm run simulate`. A scripted knee-pain call plays through the real API, and the monitor shows each card: Policy checked → Slots offered → Appointment booked → Intake → Pre-visit brief. Add `-- --scenario emergency` or `-- --scenario info` to see the other endings.
3. Run `npx tsx scripts/mcp-check.ts`. It lists and calls the MCP tools that Claude uses, including `get_schedule` showing the booking you just simulated.
4. Optional full check (drives a real browser): run `npx playwright install chromium` once, then `npx tsx scripts/e2e-flow.ts`. Note that this check resets the demo data.

---

## C. Real voice calls (your own ElevenLabs key)

1. Create an API key at **elevenlabs.io → Profile → API Keys**, with **ElevenLabs Agents: Write** and **Voices: Write**. Everything else can be "No access".
2. Add it to `.env.local`:
   ```bash
   ELEVENLABS_API_KEY=sk_...your key...
   ```
3. Create the voice agent "Asha" (5 client tools, Claude Haiku 4.5, Indian-English voice) in your account:
   ```bash
   npx tsx scripts/create-eleven-agent.ts
   ```
   This writes `ELEVENLABS_AGENT_ID=agent_...` into `.env.local` for you.
4. Restart `npm run dev`, open http://localhost:3100/call, tap **Call the clinic** and allow the microphone.

Each call uses about 722 ElevenLabs credits (2.4 minutes on average).

---

## Every key and where it goes

All keys go in **`.env.local`** in the project root. The file is never committed; `.env.example` lists every variable.

| Variable | Required? | Where to get it | What it enables |
|---|---|---|---|
| `DATABASE_URL` | Yes | Your Postgres 16 + pgvector (step B2) | Everything |
| `MCP_SECRET` | For MCP | Any random string (`openssl rand -hex 24`) | MCP server at `/api/mcp/<MCP_SECRET>` |
| `ADMIN_TOKEN` | For reset | Any random string | Monitor Reset button, `/api/admin/reset`, `/api/admin/seed` |
| `ELEVENLABS_API_KEY` | For voice | elevenlabs.io → Profile → API Keys | Real voice calls on `/call` |
| `ELEVENLABS_AGENT_ID` | For voice | Written by `scripts/create-eleven-agent.ts` | Which agent the phone page connects to |
| `OPENAI_API_KEY` | Optional | platform.openai.com → API keys | Embedding-based policy search. Without it, Postgres full-text search is used. Re-run `npm run seed` after adding it. |
| `ANTHROPIC_API_KEY` | Optional | console.anthropic.com → API keys | Claude-written pre-visit briefs. Without it, a template is used. |

`DEMO_DOCTOR_SLUG`, `CLINIC_TZ` and `NEXT_PUBLIC_CLINIC_NAME` have working defaults.

Check what is switched on at http://localhost:3100/api/health; the `features` field shows each one.

---

## Connecting Claude (optional)

claude.ai needs a public HTTPS address, so this works with the live deployment or a tunnel (e.g. `ngrok http 3100`). In claude.ai, go to Settings → Connectors → Add custom connector, and use `https://<your-address>/api/mcp/<MCP_SECRET>`. Then ask: "What appointments do I have this week?"

---

## If something doesn't work

| Symptom | Fix |
|---|---|
| `DATABASE_URL is required` | `.env.local` is missing or not in the project root |
| `extension "vector" is not available` | Use the `pgvector/pgvector:pg16` image, not plain Postgres |
| `/call` says the voice line isn't configured | `ELEVENLABS_API_KEY` or `ELEVENLABS_AGENT_ID` is missing; restart `npm run dev` after editing `.env.local` |
| Port 3100 in use | `npx next dev -p 3200`, and pass `--base http://localhost:3200` to the scripts |
| No slots offered | The demo data is relative to the day it was seeded; run `npm run seed` again |
