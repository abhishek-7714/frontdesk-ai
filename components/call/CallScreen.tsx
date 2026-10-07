"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { CallOrb } from "./CallOrb";
import { PillButton } from "../ui/PillButton";
import { InlinePillImage } from "../ui/InlinePillImage";
import { LiveDot } from "../ui/LiveDot";
import { LeafMark, MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon, CheckIcon, AlertIcon } from "../ui/icons";

type Phase = "idle" | "connecting" | "incall" | "ended" | "error";
export type PreviewState = Phase | null;

const TOOL_NAMES = ["search_policy", "check_availability", "book_appointment", "save_intake", "flag_for_staff"] as const;
const TOOL_TIMEOUT_MS = 6000;
const TOOL_FALLBACK = "The clinic system is taking too long. Apologise briefly and offer to have the front desk call the patient back.";
const EASE = [0.22, 1, 0.36, 1] as const;

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

export function CallScreen({ clinicName, preview }: { clinicName: string; preview: PreviewState }) {
  const conversation = useConversation();
  const [phase, setPhase] = useState<Phase>(preview ?? "idle");
  const [error, setError] = useState<string | null>(preview === "error" ? "We couldn't reach the voice line. Check your connection and try again." : null);
  const [startedAt, setStartedAt] = useState<number | null>(preview === "incall" ? Date.now() - 74_000 : null);
  const [lastLine, setLastLine] = useState<{ id: number; text: string } | null>(
    preview === "incall" ? { id: 1, text: "Dr. Meera Iyer can see you Saturday the 10th at 4 PM. The consultation fee is 900 rupees." } : null,
  );
  const [booking, setBooking] = useState<string | null>(
    preview === "ended" ? "Booked with Dr. Meera Iyer on Saturday the 10th at 4 PM. Consultation fee is 900 rupees." : null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [previewMuted, setPreviewMuted] = useState(false);

  const callIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const endedRef = useRef(false);
  const loggedShape = useRef(false);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const lineId = useRef(0);

  useEffect(() => {
    if (phase !== "incall") return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase]);

  const releaseWakeLock = useCallback(() => {
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, []);

  /** POST /api/calls/:id/end exactly once per call. */
  const finishCall = useCallback(() => {
    releaseWakeLock();
    const id = callIdRef.current;
    if (!id || endedRef.current) return;
    endedRef.current = true;
    void postJson(`/api/calls/${id}/end`, { eleven_conversation_id: conversationIdRef.current }).catch(() => {});
  }, [releaseWakeLock]);

  useEffect(() => () => finishCall(), [finishCall]);

  const clientTools = Object.fromEntries(
    TOOL_NAMES.map((name) => [
      name,
      async (params: Record<string, unknown>) => {
        const run = (async () => {
          try {
            const data = (await postJson(`/api/tools/${name}`, { call_id: callIdRef.current, ...params })) as { ok: boolean; result?: Record<string, unknown>; message?: string };
            if (name === "book_appointment" && data.ok && typeof data.result?.confirmation === "string") setBooking(data.result.confirmation);
            return data.ok ? JSON.stringify(data.result) : (data.message ?? TOOL_FALLBACK);
          } catch {
            return TOOL_FALLBACK;
          }
        })();
        return Promise.race([run, new Promise<string>((r) => setTimeout(() => r(TOOL_FALLBACK), TOOL_TIMEOUT_MS))]);
      },
    ]),
  );

  const start = async () => {
    if (preview) return;
    setError(null);
    setBooking(null);
    setLastLine(null);
    endedRef.current = false;
    setPhase("connecting");
    try {
      // Mic permission must be requested inside the tap handler (iOS Safari).
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setPhase("error");
      setError("Microphone access is needed to talk to Asha. Allow the microphone in your browser settings and try again.");
      return;
    }
    try {
      const [{ call_id }, session] = await Promise.all([
        postJson("/api/calls", {}) as Promise<{ call_id: string }>,
        fetch("/api/eleven/session", { cache: "no-store" }).then((r) => r.json() as Promise<{ signedUrl?: string; agentId?: string | null; error?: string }>),
      ]);
      if (!call_id) throw new Error("no call id");
      callIdRef.current = call_id;

      const sessionTarget = session.signedUrl ? { signedUrl: session.signedUrl } : session.agentId ? { agentId: session.agentId } : null;
      if (!sessionTarget) throw new Error(session.error ?? "Voice line is not configured.");

      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        /* wake lock is best-effort */
      }

      conversation.startSession({
        ...sessionTarget,
        clientTools,
        onConnect: ({ conversationId }) => {
          conversationIdRef.current = conversationId;
          setStartedAt(Date.now());
          setPhase("incall");
        },
        onMessage: (payload) => {
          if (process.env.NODE_ENV !== "production" && !loggedShape.current) {
            loggedShape.current = true;
            console.info("[call] onMessage payload shape:", Object.keys(payload));
          }
          const p = payload as { message?: string; role?: string; source?: string };
          const text = (p.message ?? "").trim();
          if (!text) return;
          const role = p.role === "user" || p.source === "user" ? "patient" : "agent";
          setLastLine({ id: ++lineId.current, text });
          if (callIdRef.current) void postJson(`/api/calls/${callIdRef.current}/transcript`, { role, text }).catch(() => {});
        },
        onDisconnect: (details) => {
          finishCall();
          if (details?.reason === "error") {
            setPhase((p) => (p === "connecting" ? "error" : "ended"));
            setError("The call dropped. Please try again.");
          } else {
            setPhase("ended");
          }
        },
        onError: (message) => {
          console.error("[call] error", message);
          setError(typeof message === "string" ? message : "Something went wrong with the call.");
        },
      });
    } catch (err) {
      console.error("[call] start failed", err);
      finishCall();
      setPhase("error");
      setError("We couldn't reach the voice line right now. Please try again in a moment.");
    }
  };

  const hangUp = () => {
    if (preview) return setPhase("ended");
    conversation.endSession();
    finishCall();
    setPhase("ended");
  };

  const muted = preview ? previewMuted : conversation.isMuted;
  const toggleMute = () => (preview ? setPreviewMuted((m) => !m) : conversation.setMuted(!conversation.isMuted));
  const orbMode = phase === "connecting" ? "connecting" : phase === "incall" ? (preview ? "speaking" : conversation.isSpeaking ? "speaking" : "listening") : "idle";
  const inCall = phase === "incall" || phase === "connecting";

  return (
    <div className="relative isolate min-h-[100dvh] overflow-hidden text-white">
      {/* Full-bleed botanical photo + overlay */}
      <div className="botanical-fallback fixed inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/hero-forest-flowers.jpg" alt="" className="h-full w-full object-cover" style={{ objectPosition: "50% 60%" }} />
        <div
          className="absolute inset-0 transition-[background] duration-700"
          style={{
            background: inCall
              ? "linear-gradient(rgba(8,16,22,0.62), rgba(8,16,22,0.48) 40%, rgba(8,16,22,0.78))"
              : "radial-gradient(90% 45% at 50% 30%, rgba(8,16,22,0.38), transparent 75%), linear-gradient(rgba(10,20,25,0.45), rgba(10,20,25,0.28) 40%, rgba(10,20,25,0.74))",
          }}
        />
      </div>

      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col px-5 [text-shadow:0_1px_18px_rgba(0,0,0,0.35)] pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LeafMark size={30} />
            <span className="text-[17px] font-medium tracking-[-0.01em]">{clinicName}</span>
          </div>
          <button
            onClick={phase === "idle" || phase === "ended" || phase === "error" ? start : undefined}
            aria-label="Call the clinic"
            className="squircle flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-periwinkle shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)] transition active:scale-95"
          >
            <PhoneIcon size={22} />
          </button>
        </header>

        {/* Headline */}
        <div className={`flex flex-1 flex-col items-center text-center ${inCall ? "pt-[3vh]" : "pt-[7vh]"}`}>
          <AnimatePresence mode="wait" initial={false}>
            {inCall ? (
              <motion.div
                key="incall"
                initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12, filter: "blur(8px)" }}
                transition={{ duration: 0.6, ease: EASE }}
                className="flex flex-col items-center"
              >
                <h1 className="display m-0 text-[52px]">{phase === "connecting" ? "Connecting…" : "Connected to Asha"}</h1>
                <div className="mt-4 h-7 font-display text-[22px] tracking-[-0.02em] text-white/85 tabular" aria-live="off">
                  {phase === "incall" && startedAt ? fmt(now - startedAt) : "Ringing Fernleaf Clinic"}
                </div>
              </motion.div>
            ) : phase === "ended" ? (
              <motion.div
                key="ended"
                initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.6, ease: EASE }}
              >
                <h1 className="display m-0 text-[58px]">
                  Thank you
                  <br />
                  for calling
                </h1>
                <p className="mx-auto mt-5 max-w-[320px] text-[17px] leading-[26px] text-white/85">
                  {booking ? "Your visit is booked. We've shared your answers with the doctor." : "Call us any time. Asha is available around the clock."}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12, filter: "blur(8px)" }}
                transition={{ duration: 0.6, ease: EASE }}
              >
                <h1 className="display m-0 text-[clamp(52px,15vw,64px)]">
                  {["Care", "is"].map((w, i) => (
                    <motion.span
                      key={w}
                      className="inline-block"
                      initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.8, ease: EASE, delay: 0.1 + i * 0.05 }}
                    >
                      {w}&nbsp;
                    </motion.span>
                  ))}
                  <motion.span
                    className="inline-block"
                    initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.3 }}
                  >
                    <InlinePillImage src="/images/tile-2.jpg" />
                  </motion.span>
                  <br />
                  {["one", "call", "away"].map((w, i) => (
                    <motion.span
                      key={w}
                      className="inline-block"
                      initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.8, ease: EASE, delay: 0.25 + i * 0.05 }}
                    >
                      {w}
                      {i < 2 ? " " : ""}
                    </motion.span>
                  ))}
                </h1>
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: EASE, delay: 0.5 }}
                  className="mx-auto mt-6 max-w-[330px] text-[17px] leading-[26px] text-white/90"
                >
                  Talk to Asha, our AI receptionist. Ask about fees, insurance or timings, or book a visit in under a minute.
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Orb + live line */}
          <AnimatePresence>
            {inCall && (
              <motion.div
                key="orb"
                className="mt-4 flex flex-col items-center"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 140, damping: 20 }}
              >
                <CallOrb mode={orbMode} size={190} />
                <div className="-mt-6 h-[52px] max-w-[330px] overflow-hidden" aria-live="polite">
                  <AnimatePresence mode="wait">
                    {lastLine && (
                      <motion.p
                        key={lastLine.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.35 }}
                        className="line-clamp-2 text-[16px] leading-[26px] text-white/90"
                      >
                        {lastLine.text}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom area */}
        <div className="mt-6">
          <AnimatePresence mode="wait" initial={false}>
            {inCall ? (
              <motion.div
                key="controls"
                className="flex items-center justify-center gap-10 pb-1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={toggleMute}
                    aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                    aria-pressed={muted}
                    disabled={phase !== "incall"}
                    className={`flex h-16 w-16 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50 ${muted ? "bg-white text-ink" : "glass-light text-white"}`}
                  >
                    {muted ? <MicOffIcon size={26} /> : <MicIcon size={26} />}
                  </button>
                  <span className="text-[13px] text-white/80">{muted ? "Unmute" : "Mute"}</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={hangUp}
                    aria-label="End call"
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-[0_14px_34px_-12px_rgba(229,72,77,0.8)] transition active:scale-95"
                  >
                    <PhoneOffIcon size={28} />
                  </button>
                  <span className="text-[13px] text-white/80">End</span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`card-${phase}`}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ type: "spring", stiffness: 140, damping: 20, delay: phase === "idle" ? 0.45 : 0.1 }}
                className="glass-light squircle rounded-[32px] p-4"
                style={{ background: "rgba(255,255,255,0.16)" }}
              >
                {phase === "error" ? (
                  <div className="flex items-start gap-3 px-2 pb-4 pt-2">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white/20">
                      <AlertIcon size={22} />
                    </span>
                    <div>
                      <div className="text-[17px] font-medium">Call didn&apos;t connect</div>
                      <p className="mt-1 text-[15px] leading-[22px] text-white/85">{error}</p>
                    </div>
                  </div>
                ) : phase === "ended" && booking ? (
                  <div className="flex items-start gap-3 px-2 pb-4 pt-2">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white text-periwinkle">
                      <CheckIcon size={22} strokeWidth={2.4} />
                    </span>
                    <div>
                      <div className="text-[17px] font-medium">Appointment confirmed</div>
                      <p className="mt-1 text-[15px] leading-[22px] text-white/85">{booking} Please bring any previous reports.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3.5 px-2 pb-4 pt-2">
                    <span
                      className="squircle flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] font-display text-[22px] tracking-[-0.03em]"
                      style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.6), rgba(255,255,255,0.2))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" }}
                    >
                      A
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[17px] font-medium">Asha · AI receptionist</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[14px] text-white/85">
                        <LiveDot color="#9EF0CD" /> Available now
                      </div>
                    </div>
                  </div>
                )}
                <PillButton variant="white" className="w-full" onClick={start}>
                  <PhoneIcon size={20} />
                  {phase === "error" ? "Try again" : phase === "ended" ? "Call again" : "Call the clinic"}
                </PillButton>
              </motion.div>
            )}
          </AnimatePresence>
          <p className="mt-4 text-center text-[13px] text-white/70">Powered by FrontDesk AI</p>
        </div>
      </div>
    </div>
  );
}
