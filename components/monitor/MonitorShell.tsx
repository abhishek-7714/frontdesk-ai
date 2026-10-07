"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { initialState, reducer, speakingState, type MonitorEvent } from "./state";
import { TranscriptCard } from "./TranscriptCard";
import { EventFeed } from "./EventCards";
import { IdleWidgets, type IdleStats } from "./IdleState";
import { Waveform } from "../ui/Waveform";
import { LiveDot } from "../ui/LiveDot";
import { CheckIcon, LeafMark, RefreshIcon, SparkIcon } from "../ui/icons";

const DESIGN_W = 1920;
const DESIGN_H = 1080;
const PAD = 48;
const GAP = 32;
const SIDE = 520;
const STALE_MS = 30 * 60_000;
const EASE = [0.22, 1, 0.36, 1] as const;

/** Fit a 1920×1080 design to any screen: scale uniformly, extend the canvas on the long axis. No scrolling, no overflow. */
function useCanvas() {
  const [c, setC] = useState({ scale: 1, w: DESIGN_W, h: DESIGN_H });
  useLayoutEffect(() => {
    const fit = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const scale = Math.min(vw / DESIGN_W, vh / DESIGN_H);
      setC({ scale, w: vw / scale, h: vh / scale });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return c;
}

function Headline({ lines, size }: { lines: string[]; size: number }) {
  const key = lines.join("|");
  let w = 0;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.h1
        key={key}
        className="display m-0 text-center text-white"
        style={{ fontSize: size }}
        exit={{ opacity: 0, filter: "blur(8px)", y: -12, transition: { duration: 0.35 } }}
      >
        {lines.map((line, li) => (
          <span key={li} className="block">
            {line.split(" ").map((word) => {
              const i = w++;
              return (
                <motion.span
                  key={`${word}-${i}`}
                  className="inline-block"
                  initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.8, ease: EASE, delay: 0.1 + i * 0.05 }}
                >
                  {word}
                  {" "}
                </motion.span>
              );
            })}
          </span>
        ))}
      </motion.h1>
    </AnimatePresence>
  );
}

function Eyebrow({ text }: { text: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={text}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="mb-6 text-center text-[22px] tracking-[-0.01em] text-white/85"
      >
        {text}
      </motion.div>
    </AnimatePresence>
  );
}

function useNow(active: boolean, ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function splitName(name: string): string[] {
  const words = name.split(" ");
  return words.length > 2 ? [words.slice(0, 2).join(" "), words.slice(2).join(" ")] : [name];
}

export function MonitorShell({ adminToken }: { adminToken: string | null }) {
  const canvas = useCanvas();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [stats, setStats] = useState<IdleStats | null>(null);
  const [conn, setConn] = useState<"connecting" | "live" | "down">("connecting");
  const [resetting, setResetting] = useState(false);
  const live = state.phase === "live";
  const now = useNow(live || state.phase === "ended", 200);

  const loadSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor/latest", { cache: "no-store" });
      const data = (await res.json()) as { call: { id: string; ended_at: string | null } | null; events: MonitorEvent[]; stats: IdleStats | null };
      if (data.stats) setStats(data.stats);
      const stale = data.call?.ended_at && Date.now() - Date.parse(data.call.ended_at) > STALE_MS;
      dispatch({ type: "snapshot", callId: data.call && !stale ? data.call.id : null, events: data.call && !stale ? data.events : [] });
    } catch {
      /* keep current state; the SSE reconnect will retry */
    }
  }, []);

  // Snapshot on load and on every (re)connect, then live events (deduped by id in the reducer).
  const firstOpen = useRef(true);
  useEffect(() => {
    void loadSnapshot();
    const es = new EventSource("/api/monitor/stream");
    es.onopen = () => {
      setConn("live");
      if (!firstOpen.current) void loadSnapshot();
      firstOpen.current = false;
    };
    es.onerror = () => setConn(es.readyState === EventSource.CLOSED ? "down" : "connecting");
    es.addEventListener("fd", (msg) => {
      const event = JSON.parse((msg as MessageEvent).data) as MonitorEvent;
      dispatch({ type: "event", event });
      if (event.type === "demo.reset" || event.type === "call.ended") void loadSnapshot();
    });
    const statsTimer = setInterval(() => void loadSnapshot(), 30_000);
    return () => {
      es.close();
      clearInterval(statsTimer);
    };
  }, [loadSnapshot]);

  const resetDemo = async () => {
    if (!adminToken) return;
    setResetting(true);
    try {
      await fetch("/api/admin/reset", { method: "POST", headers: { "x-admin-token": adminToken } });
    } finally {
      setTimeout(() => setResetting(false), 600);
    }
  };

  const { level, tag } = speakingState(state.lines, now, state.phase);
  const centreW = canvas.w - PAD * 2 - SIDE * 2 - GAP * 2;
  const elapsed = state.phase === "ended" && state.ended ? state.ended.duration_s * 1000 : state.startedAt ? now - state.startedAt : 0;

  const outcome = state.ended?.outcome;
  const eyebrow = state.phase === "idle" ? "Front desk" : state.phase === "live" ? "Incoming call" : "Call complete";
  const headline =
    state.phase === "idle"
      ? ["Waiting", "for a call"]
      : state.phase === "live"
        ? splitName(state.patientName ?? "New caller")
        : outcome === "escalated"
          ? ["Escalated", "to staff"]
          : outcome === "information"
            ? ["Information", "only"]
            : ["Booked", "and briefed"];

  return (
    <div className="fixed inset-0 overflow-hidden bg-periwinkle" style={{ background: "radial-gradient(120% 90% at 50% 0%, #6A89EA 0%, #5C7DE4 55%, #5574DC 100%)" }}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: canvas.w, height: canvas.h, transform: `scale(${canvas.scale})` }}
      >
        {/* Top bar */}
        <header className="absolute inset-x-0 top-0 z-20 flex h-[120px] items-center justify-between px-12 text-white">
          <div className="flex items-center gap-3.5">
            <span className="glass-on-blue squircle flex h-12 w-12 items-center justify-center rounded-[14px]">
              <LeafMark size={28} />
            </span>
            <span className="text-[22px] font-medium tracking-[-0.02em]">FrontDesk AI</span>
          </div>
          <div className="text-[18px] text-white/80">Fernleaf Clinic · Live front desk</div>
          <div className="flex items-center gap-4">
            {adminToken && (
              <button
                onClick={resetDemo}
                aria-label="Reset demo"
                className="glass-on-blue inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-medium text-white transition hover:bg-white/25"
              >
                <motion.span animate={resetting ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.6 }}>
                  <RefreshIcon size={17} />
                </motion.span>
                Reset demo
              </button>
            )}
            <span className="glass-on-blue inline-flex h-11 items-center gap-2.5 rounded-full px-5 text-[16px] font-medium">
              <LiveDot color={conn === "live" ? "#9EF0CD" : conn === "connecting" ? "#FFD27A" : "#FF8E8E"} pulse={conn === "live"} />
              {conn === "live" ? "Live" : conn === "connecting" ? "Connecting" : "Offline"}
            </span>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {state.phase === "idle" ? (
            <motion.main key="idle" className="absolute inset-0" exit={{ opacity: 0, transition: { duration: 0.5 } }}>
              <IdleWidgets stats={stats} width={canvas.w} height={canvas.h} />
              <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: 20 }}>
                <Eyebrow text={eyebrow} />
                <Headline lines={headline} size={112} />
              </div>
            </motion.main>
          ) : (
            <motion.main
              key={`call-${state.callId}`}
              className="absolute grid"
              style={{ left: PAD, right: PAD, top: 120, bottom: PAD, gridTemplateColumns: `${SIDE}px 1fr ${SIDE}px`, columnGap: GAP }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.4 } }}
            >
              <motion.section
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.15 }}
                className="min-h-0"
              >
                <TranscriptCard lines={state.lines} live={live} />
              </motion.section>

              <section className={`relative flex min-h-0 flex-col items-center ${state.phase === "live" ? "justify-center pb-16" : ""}`}>
                <div className={`flex w-full flex-col items-center transition-[padding] duration-700 ease-[var(--ease-out-expo)] ${state.phase === "ended" ? "pt-6" : "pt-0"}`}>
                  <Eyebrow text={eyebrow} />
                  <Headline lines={headline} size={96} />
                  <motion.div layout className="mt-7 flex items-center gap-3 font-display text-[44px] leading-none tracking-[-0.03em] text-white/90 tabular">
                    {live && <LiveDot color="#ffffff" size={10} />}
                    {fmtClock(elapsed)}
                  </motion.div>
                </div>

                <AnimatePresence initial={false}>
                  {state.phase === "live" && (
                    <motion.div
                      key="wave"
                      className="mt-20"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.5 } }}
                    >
                      <Waveform width={Math.min(660, centreW - 40)} height={190} level={level} tag={tag} />
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {state.phase === "ended" && state.ended && (
                    <motion.div
                      key="summary"
                      className="mt-10 w-full max-w-[640px]"
                      initial={{ opacity: 0, y: 40, scale: 0.92, rotate: -4 }}
                      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.2 }}
                    >
                      <div className="squircle rounded-[28px] bg-white p-8 text-ink shadow-[var(--shadow-float)]">
                        <div className="flex items-center justify-between">
                          <span className="text-[26px] leading-tight tracking-[-0.02em]">Pre-visit brief</span>
                          <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#E2E6EF] px-3.5 text-[14px] font-medium text-ink-muted">
                            <SparkIcon size={14} /> Summary
                          </span>
                        </div>
                        <p className="mt-4 text-[21px] leading-[31px] text-ink">{state.ended.summary}</p>
                        {state.ended.appointment && (
                          <div className="mt-6 flex flex-wrap gap-2">
                            <span className="inline-flex h-10 items-center rounded-full bg-periwinkle px-4 text-[16px] font-medium text-white tabular">
                              {state.ended.appointment.long_day} · {state.ended.appointment.time_label}
                            </span>
                            <span className="inline-flex h-10 items-center rounded-full bg-[#EEF1F8] px-4 text-[16px] font-medium">{state.ended.appointment.doctor_name}</span>
                            <span className="inline-flex h-10 items-center rounded-full bg-[#EEF1F8] px-4 text-[16px] font-medium tabular">{fmtClock(state.ended.duration_s * 1000)} call</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {state.handoff && (
                    <motion.div
                      key="handoff"
                      className="mt-7"
                      initial={{ opacity: 0, y: 24, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 160, damping: 18 }}
                    >
                      <span className="inline-flex h-14 items-center gap-3 rounded-full bg-white pl-2.5 pr-6 text-[18px] font-medium text-periwinkle-600 shadow-[var(--shadow-float)]">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-periwinkle text-white">
                          <CheckIcon size={18} strokeWidth={2.4} />
                        </span>
                        Shared with {state.handoff} · available in Claude
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              <motion.section
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.25 }}
                className="min-h-0"
              >
                <EventFeed feed={state.feed} booked={state.bookedSlot} />
                {state.feed.length === 0 && (
                  <div className="glass-on-blue -mt-[100%] flex h-[220px] flex-col items-center justify-center rounded-[28px] border-dashed text-center text-[18px] text-white/75">
                    <SparkIcon size={26} className="mb-3 text-white/80" />
                    Asha&apos;s actions appear here
                    <span className="mt-1 text-[15px] text-white/55">policy checks · slots · bookings · intake</span>
                  </div>
                )}
              </motion.section>
            </motion.main>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
