import type { Metadata } from "next";
import { MonitorShell } from "@/components/monitor/MonitorShell";

export const metadata: Metadata = { title: "Live monitor" };
export const dynamic = "force-dynamic";

export default async function MonitorPage({ searchParams }: { searchParams: Promise<{ admin?: string }> }) {
  const { admin } = await searchParams;
  return <MonitorShell adminToken={admin ?? null} />;
}
