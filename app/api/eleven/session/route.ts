import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns a short-lived signed WebSocket URL for the private ElevenLabs agent.
// The API key never leaves the server. agentId is not secret and is returned as a fallback hint.
export async function GET() {
  const { ELEVENLABS_API_KEY: key, ELEVENLABS_AGENT_ID: agentId } = env();
  if (!key || !agentId) {
    return NextResponse.json({ error: "Voice agent is not configured on the server.", agentId: agentId ?? null }, { status: 503 });
  }
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
      headers: { "xi-api-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error(`[eleven] signed url failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return NextResponse.json({ error: "Could not reach the voice service.", agentId }, { status: 502 });
    }
    const data = (await res.json()) as { signed_url?: string };
    if (!data.signed_url) return NextResponse.json({ error: "Voice service returned no URL.", agentId }, { status: 502 });
    return NextResponse.json({ signedUrl: data.signed_url }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[eleven] signed url error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not reach the voice service.", agentId }, { status: 502 });
  }
}
