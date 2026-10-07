import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { emit } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const run = promisify(execFile);

// Re-runs the seed on the server (dates are relative to today), for demo mornings when the DB is not reachable directly.
export async function POST(req: Request) {
  const token = env().ADMIN_TOKEN;
  if (!token || req.headers.get("x-admin-token") !== token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const { stdout } = await run("node_modules/.bin/tsx", ["scripts/seed.ts"], { cwd: process.cwd(), env: process.env, timeout: 120_000 });
    await emit("00000000-0000-0000-0000-000000000000", "demo.reset", {});
    return NextResponse.json({ ok: true, log: stdout.split("\n").filter((l) => l.startsWith("[seed]")) });
  } catch (err) {
    console.error("[seed] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "seed failed; see server logs" }, { status: 500 });
  }
}
