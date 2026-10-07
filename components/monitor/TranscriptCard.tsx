"use client";
import { AnimatePresence, motion } from "motion/react";
import type { TranscriptLine } from "./state";
import { LiveDot } from "../ui/LiveDot";

export function TranscriptCard({ lines, live }: { lines: TranscriptLine[]; live: boolean }) {
  // Render only the most recent lines anchored to the bottom: no scrolling, older lines fade out at the top.
  const recent = lines.slice(-14);
  return (
    <div className="glass-on-blue squircle flex h-full flex-col overflow-hidden rounded-[28px] text-white">
      <div className="flex items-center justify-between px-7 pb-2 pt-6">
        <span className="text-[24px] font-normal tracking-[-0.02em]">Live transcript</span>
        <span className="flex items-center gap-2 text-[15px] text-white/80">
          {live ? <LiveDot color="#ffffff" /> : <span className="h-2 w-2 rounded-full bg-white/50" />}
          {live ? "Listening" : "Ended"}
        </span>
      </div>
      <div className="fade-top-mask relative flex min-h-0 flex-1 flex-col justify-end gap-3.5 overflow-hidden px-6 pb-6">
        <AnimatePresence initial={false}>
          {recent.map((l, i) => {
            const prev = recent[i - 1];
            const showRole = !prev || prev.role !== l.role;
            const patient = l.role === "patient";
            return (
              <motion.div
                key={l.id}
                layout="position"
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 160, damping: 22 }}
                className={`flex shrink-0 flex-col ${patient ? "items-end" : "items-start"}`}
              >
                {showRole && <span className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-[0.08em] text-white/65">{patient ? "Patient" : "Asha · AI"}</span>}
                <div
                  className={`max-w-[88%] px-5 py-3 text-[20px] leading-[30px] ${
                    patient ? "rounded-[22px] rounded-br-[8px] bg-white text-ink shadow-[0_10px_30px_-16px_rgba(10,20,60,0.55)]" : "rounded-[22px] rounded-bl-[8px] bg-white/[0.2] text-white"
                  }`}
                >
                  {l.text}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {lines.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-[18px] text-white/70">
            <span className="mb-3 flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-2 w-2 rounded-full bg-white/70"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </span>
            Connecting the caller…
          </div>
        )}
      </div>
    </div>
  );
}
