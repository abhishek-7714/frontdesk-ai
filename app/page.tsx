import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { getTodayStats, type TodayStats } from "@/lib/core/calls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "FrontDesk AI · The voice receptionist for clinics" } };

export default async function Home() {
  let stats: TodayStats | null = null;
  try {
    stats = await getTodayStats();
  } catch {
    /* the landing page still renders without live numbers */
  }
  return <Landing stats={stats} />;
}
