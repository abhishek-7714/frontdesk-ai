import type { ReactNode } from "react";

type Tone = "light" | "outline" | "active" | "glass" | "tint";

const tones: Record<Tone, string> = {
  light: "bg-[#EEF1F8] text-ink",
  outline: "border border-[#E2E6EF] bg-white text-ink",
  active: "bg-periwinkle text-white",
  glass: "bg-white/25 text-white border border-white/30",
  tint: "bg-periwinkle-100 text-periwinkle-600",
};

export function Chip({ tone = "light", className = "", children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[15px] font-medium tabular ${tones[tone]} ${className}`}>{children}</span>;
}
