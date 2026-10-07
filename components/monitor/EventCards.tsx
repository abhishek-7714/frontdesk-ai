"use client";
import { AnimatePresence, motion } from "motion/react";
import type { FeedItem } from "./state";
import { Chip } from "../ui/Chip";
import { AlertIcon, CalendarIcon, CheckIcon, ChevronDownIcon, ClockIcon, DocIcon } from "../ui/icons";
import { useStickyScroll } from "./useStickyScroll";

const spring = { type: "spring" as const, stiffness: 140, damping: 20 };

function Eyebrow({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "danger" }) {
  return (
    <span className={`text-[13px] font-medium uppercase tracking-[0.08em] ${tone === "danger" ? "text-danger" : "text-[#9AA0AE]"}`}>{children}</span>
  );
}

export function Initials({ text, size = 52, tone = "periwinkle" }: { text: string; size?: number; tone?: "periwinkle" | "sage" | "glass" }) {
  const bg =
    tone === "glass"
      ? "linear-gradient(145deg, rgba(255,255,255,0.55), rgba(255,255,255,0.18))"
      : tone === "sage"
        ? "linear-gradient(145deg, #CFE7DE, #9CC9B8)"
        : "linear-gradient(145deg, #C9D5FA, #8EA6EF)";
  return (
    <span
      className="squircle inline-flex shrink-0 items-center justify-center font-display font-normal tracking-[-0.03em] text-white"
      style={{ width: size, height: size, borderRadius: size * 0.3, background: bg, fontSize: size * 0.4, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" }}
    >
      {text}
    </span>
  );
}

function PolicyCard({ item }: { item: Extract<FeedItem, { kind: "policy" }> }) {
  return (
    <div className="squircle flex items-start gap-4 rounded-[28px] bg-white p-5 pr-6 text-ink shadow-[var(--shadow-float)]">
      <span className="squircle flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] bg-periwinkle-100 text-periwinkle-600">
        <DocIcon size={26} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>Policy checked</Eyebrow>
          <span className="text-[13px] text-[#9AA0AE]">Clinic policy</span>
        </div>
        {item.top ? (
          <>
            <div className="mt-1 text-[20px] font-medium leading-7 tracking-[-0.01em]">
              {item.top.doc_title} <span className="text-ink-muted">· {item.top.section}</span>
            </div>
            <p className="mt-1 text-[15px] leading-[22px] text-ink-muted">{item.top.snippet}</p>
          </>
        ) : (
          <div className="mt-1 text-[18px] text-ink-muted">No matching policy for “{item.query}”</div>
        )}
      </div>
    </div>
  );
}

function SlotsCard({ item, booked }: { item: Extract<FeedItem, { kind: "slots" }>; booked: { day_label: string; time_label: string } | null }) {
  return (
    <div className="squircle rounded-[28px] bg-white p-6 text-ink shadow-[var(--shadow-float)]">
      <div className="flex items-center justify-between">
        <span className="text-[24px] font-normal tracking-[-0.02em]">Slots offered</span>
        <Chip tone="outline" className="h-8 px-3.5 text-[14px]">
          All {item.slots.length}
        </Chip>
      </div>
      <div className="mt-4 flex items-center gap-3.5">
        <Initials text={item.doctor.initials} size={48} />
        <div className="min-w-0">
          <div className="text-[18px] font-medium leading-6">{item.doctor.name}</div>
          <div className="text-[15px] text-ink-muted">
            {item.doctor.specialty} · ₹{item.doctor.fee_inr.toLocaleString("en-IN")}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.slots.map((s, i) => {
          const active = booked && booked.day_label === s.day_label && booked.time_label === s.time_label;
          return (
            <motion.span
              key={s.slot_id}
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...spring, delay: 0.25 + i * 0.12 }}
            >
              <Chip tone={active ? "active" : "light"} className="h-10 px-4 text-[16px]">
                {active && <CheckIcon size={16} />}
                {s.day_label} · {s.time_label}
              </Chip>
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}

function BookedCard({ item }: { item: Extract<FeedItem, { kind: "booked" }> }) {
  return (
    <motion.div
      className="squircle rounded-[28px] bg-white p-3 text-ink"
      initial={{ boxShadow: "0 0 0 0 rgba(255,255,255,0.0), var(--shadow-float)" }}
      animate={{
        boxShadow: [
          "0 0 0 0 rgba(255,255,255,0.0), 0 20px 60px -20px rgba(20,30,80,0.35)",
          "0 0 0 14px rgba(255,255,255,0.28), 0 20px 60px -20px rgba(20,30,80,0.35)",
          "0 0 0 28px rgba(255,255,255,0), 0 20px 60px -20px rgba(20,30,80,0.35)",
        ],
      }}
      transition={{ duration: 1.6, delay: 0.35, ease: "easeOut" }}
    >
      <div
        className="squircle relative overflow-hidden rounded-[22px] p-5 text-white"
        style={{ background: "linear-gradient(135deg, #9DB2F2 0%, #7391EA 45%, #5C7DE4 100%)" }}
      >
        <span className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/20 blur-2xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-medium uppercase tracking-[0.08em] text-white/85">
              <CalendarIcon size={16} /> Appointment booked
            </div>
            <div className="mt-1 text-[18px] font-medium">{item.doctor.name}</div>
            <div className="text-[15px] text-white/75">{item.doctor.specialty}</div>
          </div>
          <Initials text={initialsOf(item.patient_name)} size={60} tone="glass" />
        </div>
        <div className="relative mt-3 flex items-end gap-3">
          <span className="font-display text-[72px] leading-[0.9] tracking-[-0.045em] tabular">{item.time_label}</span>
          <span className="mb-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/25 px-3 text-[14px] font-medium">
            <ClockIcon size={14} /> {item.duration_min} min
          </span>
        </div>
        <div className="relative mt-1 text-[17px] text-white/90">{item.long_day}</div>
      </div>
      <div className="flex items-center justify-between gap-3 px-3 pb-1.5 pt-3.5">
        <div className="min-w-0">
          <div className="truncate text-[18px] font-medium">{item.patient_name}</div>
          <div className="text-[15px] text-ink-muted">{item.reason}</div>
        </div>
        <Chip tone="tint">₹{item.fee_inr.toLocaleString("en-IN")}</Chip>
      </div>
    </motion.div>
  );
}

const INTAKE_ROWS: { key: "chief_complaint" | "duration" | "severity" | "current_medications"; label: string; tile: string }[] = [
  { key: "chief_complaint", label: "Complaint", tile: "/images/tile-1.jpg" },
  { key: "duration", label: "Duration", tile: "/images/tile-3.jpg" },
  { key: "severity", label: "Severity", tile: "/images/tile-2.jpg" },
  { key: "current_medications", label: "Medicines", tile: "/images/tile-5.jpg" },
];

function IntakeCard({ item }: { item: Extract<FeedItem, { kind: "intake" }> }) {
  const filled = INTAKE_ROWS.filter((r) => item.fields[r.key]).length;
  return (
    <div className="squircle rounded-[28px] bg-white p-6 text-ink shadow-[var(--shadow-float)]">
      <div className="flex items-center justify-between">
        <span className="text-[24px] font-normal tracking-[-0.02em]">Intake</span>
        <span className="text-[15px] text-ink-muted tabular">
          {filled} of {INTAKE_ROWS.length}
        </span>
      </div>
      <div className="mt-3 flex flex-col">
        <AnimatePresence initial={false}>
          {INTAKE_ROWS.filter((r) => item.fields[r.key]).map((r) => (
            <motion.div
              key={r.key}
              layout
              initial={{ opacity: 0, height: 0, y: 12 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              transition={spring}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3.5 border-t border-[#EEF0F5] py-2.5 first:border-t-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.tile} alt="" className="squircle h-11 w-11 shrink-0 rounded-[13px] object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#9AA0AE]">{r.label}</div>
                  <div className="text-[17px] leading-6">{item.fields[r.key]}</div>
                </div>
                <motion.span
                  initial={{ backgroundColor: "#E7EAF1" }}
                  animate={{ backgroundColor: "#3FBF8F" }}
                  transition={{ delay: 0.35, duration: 0.4 }}
                  className="relative flex h-7 w-12 shrink-0 items-center rounded-full px-1"
                >
                  <motion.span
                    initial={{ x: 0 }}
                    animate={{ x: 20 }}
                    transition={{ ...spring, delay: 0.35 }}
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-success"
                  >
                    <CheckIcon size={13} strokeWidth={2.6} />
                  </motion.span>
                </motion.span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function EscalationCard({ item }: { item: Extract<FeedItem, { kind: "escalation" }> }) {
  return (
    <div className="squircle relative overflow-hidden rounded-[28px] bg-white p-5 pl-7 text-ink shadow-[var(--shadow-float)]">
      <span className="absolute inset-y-0 left-0 w-2 bg-danger" />
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[20px] font-medium text-danger">
          <AlertIcon size={20} /> Escalated to staff
        </span>
        <Chip tone="light" className={item.urgency === "emergency" ? "bg-danger/10 text-danger" : ""}>
          {item.urgency}
        </Chip>
      </div>
      <p className="mt-2 text-[17px] text-ink-muted">{item.reason}</p>
    </div>
  );
}

export function FeedCard({ item, booked }: { item: FeedItem; booked: { day_label: string; time_label: string } | null }) {
  switch (item.kind) {
    case "policy":
      return <PolicyCard item={item} />;
    case "slots":
      return <SlotsCard item={item} booked={booked} />;
    case "booked":
      return <BookedCard item={item} />;
    case "intake":
      return <IntakeCard item={item} />;
    case "escalation":
      return <EscalationCard item={item} />;
  }
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function EventFeed({ feed, booked }: { feed: FeedItem[]; booked: { day_label: string; time_label: string } | null }) {
  // Newest first. Every card stays reachable by scrolling; the panel follows new cards unless the viewer scrolled down to read.
  const { ref, onScroll, unseen, jump, atStart, atEnd } = useStickyScroll<HTMLDivElement>("top", feed[0]?.key);
  // Fade whichever edge has more content beyond it.
  const mask = atStart && atEnd ? undefined : `linear-gradient(to bottom, ${atStart ? "black" : "transparent"} 0, black 56px, black calc(100% - 96px), ${atEnd ? "black" : "transparent"} 100%)`;
  return (
    <div className="relative h-full">
      <div
        ref={ref}
        onScroll={onScroll}
        tabIndex={0}
        aria-label="Call events"
        className="soft-scroll -mx-6 -mt-4 flex h-[calc(100%+16px)] flex-col gap-5 overflow-y-auto overscroll-contain px-6 pb-10 pt-4 outline-none"
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {feed.map((item) => (
            <motion.div
              key={item.key}
              layout
              initial={{ opacity: 0, y: 40, scale: 0.92, rotate: -4 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.3 } }}
              transition={spring}
              style={{ transformOrigin: "30% 0%" }}
              className="shrink-0"
            >
              <FeedCard item={item} booked={booked} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {unseen && (
          <motion.button
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            onClick={() => jump()}
            className="absolute left-1/2 top-3 inline-flex h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-periwinkle px-4 text-[15px] font-medium text-white shadow-[var(--shadow-float)]"
          >
            <ChevronDownIcon size={16} className="rotate-180" /> New update
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
