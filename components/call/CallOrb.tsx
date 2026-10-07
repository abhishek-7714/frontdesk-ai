"use client";
import { motion, useReducedMotion } from "motion/react";

/** 220px glass circle. Three concentric rings ripple outward while the agent speaks; a gentle pulse while listening; shimmer while connecting. */
export function CallOrb({ mode, size = 220 }: { mode: "connecting" | "speaking" | "listening" | "idle"; size?: number }) {
  const reduce = useReducedMotion();
  const speaking = mode === "speaking";
  return (
    <div className="relative flex items-center justify-center" style={{ width: size * 1.7, height: size * 1.7 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full border border-white/40"
          style={{ width: size, height: size }}
          animate={
            reduce
              ? { opacity: speaking ? 0.5 : 0.2 }
              : speaking
                ? { scale: [1, 1.62], opacity: [0.55, 0] }
                : mode === "listening"
                  ? { scale: [1, 1.12 + i * 0.06], opacity: [0.28, 0] }
                  : { scale: 1, opacity: 0 }
          }
          transition={{ duration: speaking ? 1.8 : 2.8, repeat: Infinity, ease: "easeOut", delay: i * (speaking ? 0.6 : 0.9) }}
        />
      ))}
      <motion.div
        className="glass-light relative overflow-hidden rounded-full"
        style={{ width: size, height: size, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 30px 80px -30px rgba(0,0,0,0.6)" }}
        animate={reduce ? undefined : speaking ? { scale: [1, 1.035, 1] } : mode === "listening" ? { scale: [1, 1.015, 1] } : { scale: 1 }}
        transition={{ duration: speaking ? 0.9 : 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(70% 70% at 35% 25%, rgba(255,255,255,0.35), transparent 60%)" }} />
        <span
          className="absolute inset-[18%] rounded-full opacity-90"
          style={{ background: "radial-gradient(circle at 50% 40%, rgba(160,190,255,0.55), rgba(92,125,228,0.25) 55%, transparent 75%)", filter: "blur(6px)" }}
        />
        {mode === "connecting" && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)",
              backgroundSize: "200% 100%",
              animation: "fd-shimmer 1.6s linear infinite",
            }}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/tile-1.jpg" alt="" className="squircle h-[30%] w-[30%] rounded-[28%] object-cover shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]" />
        </div>
      </motion.div>
    </div>
  );
}
