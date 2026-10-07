import type { Metadata } from "next";
import { CallApp } from "@/components/call/CallApp";

export const metadata: Metadata = { title: "Call Fernleaf Clinic" };

const PREVIEWS = ["idle", "connecting", "incall", "ended", "error"] as const;

// ?preview=<state> renders a static state for design review (no voice session starts).
export default async function CallPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const p = PREVIEWS.find((x) => x === preview) ?? null;
  return <CallApp clinicName={process.env.NEXT_PUBLIC_CLINIC_NAME ?? "Fernleaf Clinic"} preview={p} />;
}
