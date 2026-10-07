"use client";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Chip } from "../ui/Chip";
import { FlowerTile } from "../ui/FlowerTile";
import { Waveform } from "../ui/Waveform";
import { BarsIcon, ChevronDownIcon, ClockIcon } from "../ui/icons";
import { Initials, initialsOf } from "./EventCards";

export type IdleStats = {
  calls_today: number;
  booked_by_ai: number;
  avg_call_s: number | null;
  appointments_today: number;
  slots_today: number;
  slots_booked_today: number;
  doctors: { name: string; specialty: string; open_today: number; fee: number }[];
  next_visit: { time_label: string; long_day: string; patient_name: string; reason: string; doctor_name: string; specialty: string } | null;
};

/** Floats a widget gently; each gets a different phase. Positions are in 1920×1080 canvas pixels. */
function Floating({ x, y, phase, delay, children }: { x: number; y: number; phase: number; delay: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="absolute"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, y: 40, scale: 0.92, rotate: -4 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: -20, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
      transition={{ type: "spring", stiffness: 140, damping: 20, delay }}
    >
      <motion.div animate={reduce ? undefined : { y: [0, -8, 0, 8, 0] }} transition={{ duration: 6.5 + (phase % 3) * 0.7, repeat: Infinity, ease: "easeInOut", delay: -phase }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function fmtDuration(s: number | null) {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Ring({ value, size = 190 }: { value: number; size?: number }) {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <defs>
        <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B9C8F6" />
          <stop offset="1" stopColor="#5C7DE4" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#DCE4FA" strokeWidth={20} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ring-g)"
        strokeWidth={20}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0.04, value))) }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
      />
    </svg>
  );
}

export function IdleWidgets({ stats, width, height }: { stats: IdleStats | null; width: number; height: number }) {
  // Lay out relative to the canvas centre so extra width/height (non-16:9 screens) spreads evenly.
  const cx = width / 2;
  const cy = height / 2;
  const s = stats;
  const util = s && s.slots_today ? s.slots_booked_today / s.slots_today : 0.6;
  const bars = [0.45, 0.7, 0.55, 0.85, 1];

  return (
    <>
      {/* Ring card — "Recovery goal" analogue */}
      <Floating x={cx - 640} y={cy - 420} phase={0.4} delay={0.05}>
        <div className="squircle w-[310px] rounded-[30px] bg-card-on-blue p-6 text-ink shadow-[var(--shadow-float)]">
          <div className="flex items-start justify-between">
            <span className="text-[26px] leading-[1.05] tracking-[-0.02em]">
              Today&apos;s
              <br />
              schedule
            </span>
            <Chip tone="outline" className="h-8 px-3 text-[14px]">
              Today <ChevronDownIcon size={14} />
            </Chip>
          </div>
          <div className="relative mx-auto mt-3 h-[180px] w-[180px]">
            <Ring value={util} size={180} />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-display text-[44px] leading-none tracking-[-0.04em] text-periwinkle-600 tabular">{s ? Math.round(util * 100) : "—"}%</span>
              <span className="mt-1 text-[14px] text-periwinkle-600/80">slots booked</span>
            </div>
          </div>
        </div>
      </Floating>

      {/* Line-open waveform — "54 bpm" analogue */}
      <Floating x={cx - 190} y={cy - 410} phase={1.6} delay={0.15}>
        <div className="pt-10">
          <Waveform width={380} height={110} level={0.32} tag="Line open · 24/7" strokeWidth={2.5} />
        </div>
      </Floating>

      {/* Calls today pill with bars — "Cardiac indicators" analogue */}
      <Floating x={cx + 340} y={cy - 300} phase={2.3} delay={0.25}>
        <div className="flex h-[120px] w-[330px] items-center justify-between rounded-full bg-white px-9 text-ink shadow-[var(--shadow-float)]">
          <div>
            <div className="text-[14px] text-[#A8AEBB]">Calls today</div>
            <div className="font-display text-[40px] leading-[1.05] tracking-[-0.04em] tabular">{s?.calls_today ?? 0}</div>
          </div>
          <div className="flex h-14 items-end gap-2.5">
            {bars.map((b, i) => (
              <motion.span
                key={i}
                className="w-2 rounded-full"
                style={{ background: "linear-gradient(#8EA6EF, #5C7DE4)" }}
                initial={{ height: 6 }}
                animate={{ height: 56 * b }}
                transition={{ delay: 0.6 + i * 0.08, type: "spring", stiffness: 120, damping: 16 }}
              />
            ))}
          </div>
        </div>
      </Floating>

      {/* Booked by AI — "Analysis of the day" analogue */}
      <Floating x={cx + 440} y={cy - 130} phase={3.1} delay={0.35}>
        <div className="glass-light flex h-[112px] w-[330px] items-center gap-5 rounded-full !bg-white/60 px-5 text-ink shadow-[var(--shadow-float)]">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white/80 text-periwinkle">
            <BarsIcon size={30} />
          </span>
          <div>
            <div className="text-[14px] text-ink-muted">Booked by AI today</div>
            <div className="flex items-center gap-2.5">
              <span className="font-display text-[38px] leading-[1.05] tracking-[-0.04em] tabular">{s?.booked_by_ai ?? 0}</span>
              <span className="rounded-full bg-white px-2.5 py-0.5 text-[13px] font-medium text-periwinkle-600">of {s?.calls_today ?? 0} calls</span>
            </div>
          </div>
        </div>
      </Floating>

      {/* Receptionist session — "Doctor's session" analogue */}
      <Floating x={cx - 900} y={cy - 90} phase={4.2} delay={0.2}>
        <div className="flex items-center">
          <div className="glass-on-blue flex h-[132px] items-center gap-5 rounded-[30px] py-4 pl-4 pr-8 text-white">
            <FlowerTile src="/images/tile-1.jpg" size={100} float={false} />
            <div>
              <div className="font-display text-[30px] leading-[1] tracking-[-0.03em]">
                Asha
                <br />
                <span className="text-white/90">AI receptionist</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[14px] text-white/80">
                <span className="h-2 w-2 rounded-full bg-[#9EF0CD]" /> Available now
              </div>
            </div>
          </div>
          <span className="h-px w-6 bg-white/50" />
          <span className="-ml-1 mr-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-periwinkle" />
          <div className="glass-on-blue flex h-[132px] w-[150px] flex-col items-center justify-center rounded-[30px] text-white">
            <span className="font-display text-[40px] leading-none tracking-[-0.04em] tabular">{s?.avg_call_s ? fmtDuration(s.avg_call_s) : "24/7"}</span>
            <span className="mt-2 text-[13px] text-white/75">{s?.avg_call_s ? "avg. call" : "always on"}</span>
          </div>
        </div>
      </Floating>

      {/* Doctors on duty — "Taking pills" analogue */}
      <Floating x={cx - 700} y={cy + 190} phase={5.0} delay={0.3}>
        <div className="w-[460px] text-white">
          <div className="flex items-center justify-between px-1">
            <span className="text-[24px] tracking-[-0.02em]">Doctors on duty</span>
            <span className="text-[14px] text-white/75 underline-offset-4">Today</span>
          </div>
          <div className="mt-3 flex flex-col">
            {(s?.doctors ?? []).map((d, i) => (
              <div key={d.name} className="flex items-center gap-4 border-b border-white/15 py-2.5 last:border-b-0">
                <FlowerTile src={`/images/tile-${[1, 2, 4][i % 3]}.jpg`} size={58} float={false} />
                <div className="min-w-0 flex-1">
                  <div className="text-[19px] font-medium leading-6">{d.name}</div>
                  <div className="mt-1.5 flex gap-2">
                    <span className="rounded-full bg-white/20 px-3 py-0.5 text-[13px]">{d.specialty}</span>
                    <span className="rounded-full bg-white/80 px-3 py-0.5 text-[13px] text-periwinkle-600 tabular">{d.open_today} open</span>
                  </div>
                </div>
                <span className={`flex h-8 w-14 items-center rounded-full px-1 ${d.open_today > 0 ? "justify-end bg-[#7FE0B8]" : "justify-start bg-white/25"}`}>
                  <span className="h-6 w-6 rounded-full bg-white shadow" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </Floating>

      {/* Next visit — "Scheduled visits" analogue */}
      <Floating x={cx + 210} y={cy + 175} phase={2.8} delay={0.4}>
        <div className="squircle w-[440px] rounded-[30px] bg-white p-6 text-ink shadow-[var(--shadow-float)]">
          <div className="flex items-center justify-between">
            <span className="text-[24px] tracking-[-0.02em]">Next visit</span>
            <Chip tone="outline" className="h-8 px-3.5 text-[14px]">
              All {s?.appointments_today ?? 0}
            </Chip>
          </div>
          <div className="squircle relative mt-4 overflow-hidden rounded-[22px] p-5 text-white" style={{ background: "linear-gradient(135deg, #A9BCF4, #6F8DE8)" }}>
            <span className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/25 blur-2xl" />
            <div className="relative flex items-start justify-between">
              <div className="min-w-0">
                <div className="text-[18px] font-medium">{s?.next_visit?.specialty ?? "Orthopaedics"}</div>
                <div className="truncate text-[15px] text-white/75">{s?.next_visit?.patient_name ?? "—"}</div>
              </div>
              <Initials text={initialsOf(s?.next_visit?.patient_name ?? "F C")} size={64} tone="glass" />
            </div>
            <div className="relative mt-2 flex items-end gap-3">
              <span className="font-display text-[52px] leading-[0.95] tracking-[-0.045em] tabular">{s?.next_visit?.time_label ?? "—"}</span>
              <span className="mb-1.5 inline-flex h-7 items-center gap-1 rounded-full bg-white/25 px-2.5 text-[13px] font-medium">
                <ClockIcon size={13} /> 30 min
              </span>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {["All", "Today", "Tomorrow", "Week"].map((c, i) => (
              <Chip key={c} tone={i === 0 ? "light" : "outline"} className="h-9 text-[14px]">
                {c}
              </Chip>
            ))}
          </div>
        </div>
      </Floating>
    </>
  );
}
