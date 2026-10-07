"use client";
import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * A thin white line like the heart-rate line in frame 05, animating continuously.
 * `level` (0..1) drives the amplitude: idle ≈ 0.1, patient ≈ 0.6, agent ≈ 0.9.
 */
export function Waveform({
  width,
  height,
  level,
  tag,
  marker = true,
  guides = true,
  strokeWidth = 2.5,
}: {
  width: number;
  height: number;
  level: number;
  tag?: string;
  marker?: boolean;
  guides?: boolean;
  strokeWidth?: number;
}) {
  const id = useId().replace(/:/g, "");
  const pathRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGGElement>(null);
  const levelRef = useRef(level);
  const smooth = useRef(level);
  const reduce = useReducedMotion();
  levelRef.current = level;

  useEffect(() => {
    let raf = 0;
    const N = 120;
    const mid = height / 2;
    const start = performance.now();
    const draw = (now: number) => {
      const t = reduce ? 0 : (now - start) / 1000;
      smooth.current += (levelRef.current - smooth.current) * 0.06;
      const amp = (height / 2 - 10) * Math.max(0.06, smooth.current);
      let d = "";
      let markerY = mid;
      for (let i = 0; i <= N; i++) {
        const x = i / N;
        const env = Math.pow(Math.sin(Math.PI * x), 1.4);
        const wave =
          Math.sin(x * 9.5 + t * 2.1) * 0.55 +
          Math.sin(x * 17.3 - t * 3.4) * 0.3 * (0.4 + smooth.current) +
          Math.sin(x * 4.1 + t * 1.2) * 0.35;
        const y = mid - amp * env * wave;
        d += `${i === 0 ? "M" : "L"}${(x * width).toFixed(1)},${y.toFixed(1)}`;
        if (i === N / 2) markerY = y;
      }
      pathRef.current?.setAttribute("d", d);
      dotRef.current?.setAttribute("transform", `translate(${width / 2},${markerY.toFixed(1)})`);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, height, reduce]);

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`fade-${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="white" stopOpacity="0" />
            <stop offset="0.18" stopColor="white" stopOpacity="0.95" />
            <stop offset="0.82" stopColor="white" stopOpacity="0.95" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`guide-${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="white" stopOpacity="0" />
            <stop offset="0.5" stopColor="white" stopOpacity="0.28" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        {guides &&
          [0.22, 0.5, 0.78].map((g) => <line key={g} x1={0} x2={width} y1={height * g} y2={height * g} stroke={`url(#guide-${id})`} strokeWidth={1} />)}
        {marker && <line x1={width / 2} x2={width / 2} y1={-6} y2={height} stroke="white" strokeOpacity={0.35} strokeDasharray="3 5" />}
        <path ref={pathRef} fill="none" stroke={`url(#fade-${id})`} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        {marker && (
          <g ref={dotRef}>
            <circle r={13} fill="#5C7DE4" stroke="white" strokeWidth={2.5} />
            <circle r={4.5} fill="white" />
          </g>
        )}
      </svg>
      {tag && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+6px)]">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={tag}
              initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="block whitespace-nowrap rounded-[10px] bg-white px-3.5 py-1.5 text-[15px] font-medium text-ink shadow-[0_8px_24px_-10px_rgba(10,20,60,0.5)]"
            >
              {tag}
            </motion.span>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
