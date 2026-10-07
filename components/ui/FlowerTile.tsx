"use client";
import { motion, useReducedMotion } from "motion/react";

export function FlowerTile({
  src,
  size = 72,
  radius,
  float = true,
  phase = 0,
  className = "",
  alt = "",
}: {
  src: string;
  size?: number;
  radius?: number;
  float?: boolean;
  phase?: number;
  className?: string;
  alt?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`squircle relative shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.28), boxShadow: "0 12px 30px -14px rgba(10,20,60,0.55)" }}
      animate={float && !reduce ? { y: [0, -8, 0, 8, 0] } : undefined}
      transition={float ? { duration: 7 + (phase % 3), repeat: Infinity, ease: "easeInOut", delay: -phase } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover" draggable={false} />
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_0_0_1px_rgba(255,255,255,0.12)]" />
    </motion.div>
  );
}
