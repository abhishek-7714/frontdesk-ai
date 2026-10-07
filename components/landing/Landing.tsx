"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { TodayStats } from "@/lib/core/calls";
import { Chip } from "../ui/Chip";
import { FlowerTile } from "../ui/FlowerTile";
import { InlinePillImage } from "../ui/InlinePillImage";
import { LiveDot } from "../ui/LiveDot";
import { Waveform } from "../ui/Waveform";
import { ArrowRightIcon, BarsIcon, CalendarIcon, CheckIcon, DocIcon, LeafMark, PhoneIcon, ScreenIcon, SparkIcon } from "../ui/icons";
import { Initials, initialsOf } from "../monitor/EventCards";

const EASE = [0.22, 1, 0.36, 1] as const;
const CLINIC = process.env.NEXT_PUBLIC_CLINIC_NAME ?? "Fernleaf Clinic";

/** Display headline that reveals word by word (opacity, y 24, blur 8 → rest). */
function Reveal({ children, className = "", delay = 0 }: { children: ReactNode[]; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <span className={className}>
      {children.map((w, i) => (
        <motion.span
          key={i}
          className="inline-block"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, filter: "blur(8px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.8, ease: EASE, delay: delay + i * 0.05 }}
        >
          {w}
          {i < children.length - 1 && " "}
        </motion.span>
      ))}
    </span>
  );
}

const words = (s: string) => s.split(" ");

function Float({ phase = 0, children, className = "" }: { phase?: number; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 40, scale: 0.92, rotate: -4 }}
      whileInView={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.1 + phase * 0.08 }}
    >
      <motion.div animate={reduce ? undefined : { y: [0, -8, 0, 8, 0] }} transition={{ duration: 6.5 + (phase % 3) * 0.7, repeat: Infinity, ease: "easeInOut", delay: -phase }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

export function Landing({ stats }: { stats: TodayStats | null }) {
  return (
    <main className="overflow-x-clip bg-lavender">
      <Hero />
      <Features />
      <HowItWorks />
      <Split />
      <Stats stats={stats} />
      <footer className="bg-periwinkle px-6 pb-10 pt-4 text-center text-[14px] text-white/75">
        FrontDesk AI · a class project. {CLINIC} is fictional and all data is synthetic.
      </footer>
    </main>
  );
}

/* (1) Botanical hero — frame 01 */
function Hero() {
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/hero-forest-flowers.jpg" alt="" className="botanical-fallback absolute inset-0 -z-10 h-full w-full object-cover" style={{ objectPosition: "50% 60%" }} />
      <div
        className="absolute inset-0 -z-10"
        style={{ background: "radial-gradient(70% 45% at 50% 42%, rgba(8,16,22,0.42), transparent 75%), linear-gradient(rgba(10,20,25,0.45), rgba(10,20,25,0.2) 40%, rgba(10,20,25,0.7))" }}
      />

      <nav className="mx-auto flex w-full max-w-[1320px] items-center justify-between px-5 py-5 md:px-10 md:py-7">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-medium tracking-[-0.01em]">
          <LeafMark size={30} /> FrontDesk AI
        </Link>
        <div className="hidden items-center gap-9 text-[16px] text-white/90 md:flex">
          <a href="#features" className="hover:text-white">Product</a>
          <a href="#how" className="hover:text-white">How it works</a>
          <a href="#stats" className="hover:text-white">Live clinic</a>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/call" aria-label="Call the clinic" className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-periwinkle-600 transition hover:bg-white/90">
            <PhoneIcon size={20} />
          </Link>
          <Link href="/monitor" aria-label="Open the live monitor" className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/70 transition hover:bg-white/10">
            <ScreenIcon size={20} />
          </Link>
        </div>
      </nav>

      <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col items-center justify-center px-5 pb-28 pt-6 text-center md:px-10">
        <h1 className="display text-[clamp(52px,9vw,148px)] [text-shadow:0_2px_30px_rgba(0,0,0,0.25)]">
          <Reveal className="block">{words("Every call answered,")}</Reveal>
          <Reveal className="block" delay={0.15}>
            {["every", <InlinePillImage key="pill" src="/images/tile-2.jpg" />, "patient", "heard"]}
          </Reveal>
        </h1>
        <motion.p
          className="mt-8 max-w-[560px] text-[17px] leading-[26px] text-white/90 [text-shadow:0_1px_12px_rgba(0,0,0,0.35)] md:text-[19px] md:leading-[29px]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.6 }}
        >
          FrontDesk AI is a voice receptionist for clinics. It answers from your own policies, books the visit, takes a short intake, and hands the doctor a brief they can read in Claude.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.75 }} className="mt-10">
          <Link href="/call" className="glass-light inline-flex h-14 items-center gap-2.5 rounded-full px-8 text-[17px] font-medium transition hover:bg-white/25">
            <PhoneIcon size={18} /> Try the live line
          </Link>
        </motion.div>
      </div>

      <motion.div
        className="glass-light squircle absolute bottom-6 right-6 hidden w-[300px] items-center gap-4 rounded-[28px] p-4 pl-5 lg:flex"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 20, delay: 1 }}
      >
        <div className="flex-1">
          <p className="text-[14px] leading-[20px] text-white/90">
            Watch the front desk <b className="font-semibold text-white">live</b> while you call.
          </p>
          <Link href="/monitor" className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/20 px-3.5 text-[13px] font-medium hover:bg-white/30">
            Open monitor <ArrowRightIcon size={14} />
          </Link>
        </div>
        <FlowerTile src="/images/tile-4.jpg" size={64} float={false} />
      </motion.div>
    </section>
  );
}

/* (2) Lavender feature cards — frame 02 */
function Features() {
  const doctors = ["Dr. Meera Iyer", "Dr. Arjun Rao", "Dr. Kavya Menon", "Front desk", "Clinic admin"];
  return (
    <section id="features" className="px-5 py-24 md:px-10 md:py-32">
      <h2 className="display mx-auto max-w-[1000px] text-center text-[clamp(40px,5.5vw,84px)] text-periwinkle">
        <Reveal>{words("Policy-grounded answers and a personal touch for every caller")}</Reveal>
      </h2>
      <div className="mx-auto mt-16 grid max-w-[1200px] gap-6 md:grid-cols-2">
        <motion.div
          className="squircle relative isolate flex min-h-[440px] flex-col overflow-hidden rounded-[44px] p-8 text-white md:min-h-[480px] md:p-10"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/petals-indigo.jpg" alt="" className="botanical-fallback absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/35 via-black/10 to-black/55" />
          <p className="text-[16px] text-white/85">Voice receptionist</p>
          <div className="my-auto text-center">
            <p className="display text-balance text-[clamp(34px,3.6vw,52px)]">Asha picks up on the first ring</p>
            <p className="mx-auto mt-4 max-w-[400px] text-[16px] leading-[24px] text-white/85">
              She answers fees, insurance and timings from your documents, offers real slots, and books the visit before the caller hangs up.
            </p>
          </div>
          <div className="flex justify-center">
            <Link href="/call" className="glass-light inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium hover:bg-white/25">
              <PhoneIcon size={16} /> Call Asha
            </Link>
          </div>
        </motion.div>

        <motion.div
          className="squircle relative isolate flex min-h-[440px] flex-col overflow-hidden rounded-[44px] p-8 text-white md:min-h-[480px] md:p-10"
          style={{ background: "radial-gradient(60% 70% at 15% 20%, #8FA3E8, transparent 70%), radial-gradient(60% 60% at 90% 90%, #B79AD8, transparent 70%), linear-gradient(140deg, #6E86D6, #8B7FC9 60%, #A99BD3)" }}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
        >
          <p className="display text-[clamp(34px,3.6vw,52px)]">Your doctors, in Claude</p>
          <p className="mt-4 max-w-[420px] text-[16px] leading-[24px] text-white/85">
            Each booking reaches Claude through MCP. The doctor asks &ldquo;What appointments do I have this week?&rdquo; and sees each new patient with their intake.
          </p>
          <div className="my-auto flex justify-center gap-3 pt-6">
            {doctors.map((d, i) => (
              <div key={d} className={i > 2 ? "hidden sm:block" : ""} style={{ opacity: i === 1 ? 1 : 0.85 }}>
                <Initials text={initialsOf(d.replace("Dr. ", ""))} size={i === 1 ? 92 : 76} tone={i % 2 ? "glass" : "periwinkle"} />
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === 1 ? "bg-white" : "bg-white/45"}`} />
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <a href="#how" className="glass-light inline-flex h-12 w-full max-w-[260px] items-center justify-center rounded-full text-[15px] font-medium hover:bg-white/25">
              See the MCP tools
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* (3) Dark glass panel on the lily photo — frame 03 */
const TABS = {
  "How it works": {
    title: "One call, three surfaces",
    body: "The patient talks to Asha from their phone. Every step appears on the front-desk monitor as it happens. The booking, intake and call summary go straight to the doctor's schedule.",
    badges: ["Voice", "Live monitor", "Claude"],
    tile: "/images/tile-1.jpg",
    actions: [
      { label: "Call the clinic", href: "/call", icon: <PhoneIcon size={16} /> },
      { label: "Open monitor", href: "/monitor", icon: <ScreenIcon size={16} /> },
    ],
  },
  "Under the hood": {
    title: "One core, many surfaces",
    body: "An ElevenLabs voice agent runs client tools in the browser, which call one shared core. Policy search uses pgvector embeddings, with full-text search as a fallback. Claude reads the same data through a Streamable HTTP MCP server.",
    badges: ["RAG", "pgvector", "MCP"],
    tile: "/images/tile-3.jpg",
    actions: [
      { label: "Search policy", href: "#features", icon: <DocIcon size={16} /> },
      { label: "Live numbers", href: "#stats", icon: <BarsIcon size={16} /> },
    ],
  },
  Pricing: {
    title: "Pay for answered calls",
    body: "Each call's cost is voice minutes plus a few hundred tokens for the summary. Embeddings cost next to nothing. There's no telephony hardware and no extra front-desk headcount at peak hours.",
    badges: ["Per call", "No setup"],
    tile: "/images/tile-5.jpg",
    actions: [
      { label: "Try the line", href: "/call", icon: <PhoneIcon size={16} /> },
      { label: "See the clinic", href: "#stats", icon: <CalendarIcon size={16} /> },
    ],
  },
} as const;
type TabName = keyof typeof TABS;

function HowItWorks() {
  const [tab, setTab] = useState<TabName>("How it works");
  const t = TABS[tab];
  return (
    <section id="how" className="relative isolate flex min-h-[760px] items-center justify-center px-4 py-24 md:px-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/lily-droplets.jpg" alt="" className="botanical-fallback absolute inset-0 -z-10 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-black/15" />
      <motion.div
        className="glass-dark squircle w-full max-w-[1000px] rounded-[36px] p-5 text-white md:p-7"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 140, damping: 20 }}
      >
        <div role="tablist" aria-label="About FrontDesk AI" className="mx-auto flex w-fit gap-1 rounded-full p-1">
          {(Object.keys(TABS) as TabName[]).map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={tab === name}
              onClick={() => setTab(name)}
              className={`h-11 rounded-full px-4 text-[15px] font-medium transition md:px-5 ${tab === name ? "bg-white/25 text-white" : "text-white/80 hover:text-white"}`}
            >
              {name}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            role="tabpanel"
            className="mt-6 grid items-center gap-6 md:grid-cols-[200px_1fr_220px]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <FlowerTile src={t.tile} size={200} radius={28} float={false} className="hidden md:block" />
            <div>
              <h3 className="text-[22px] font-semibold leading-[28px] tracking-[-0.01em]">{t.title}</h3>
              <p className="mt-2 text-[16px] leading-[24px] text-white/80">{t.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {t.badges.map((b) => (
                  <span key={b} className="rounded-md border border-white/40 px-2 py-0.5 text-[12px] font-medium text-white/85">
                    {b}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {t.actions.map((a) => (
                <Link key={a.label} href={a.href} className="glass-light inline-flex h-14 items-center justify-center gap-2 rounded-full text-[16px] font-medium hover:bg-white/25">
                  {a.icon} {a.label}
                </Link>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </section>
  );
}

/* (4) Split with floating flower tiles — frame 04 */
function Split() {
  const tiles = [
    { src: "/images/tile-1.jpg", size: 60, cls: "left-[10%] top-[9%]" },
    { src: "/images/tile-2.jpg", size: 96, cls: "right-[14%] top-[13%]" },
    { src: "/images/tile-3.jpg", size: 72, cls: "left-[5%] top-[50%]" },
    { src: "/images/tile-4.jpg", size: 70, cls: "right-[10%] bottom-[18%]" },
    { src: "/images/tile-5.jpg", size: 68, cls: "left-[17%] bottom-[6%]" },
  ];
  return (
    <section className="grid min-h-[760px] md:grid-cols-2">
      <div className="relative flex flex-col items-center justify-center px-6 py-28 text-center">
        {tiles.map((t, i) => (
          <div key={t.src} className={`absolute hidden sm:block ${t.cls}`}>
            <FlowerTile src={t.src} size={t.size} phase={i * 1.3} />
          </div>
        ))}
        <p className="text-[17px] text-ink">For clinic owners</p>
        <h2 className="display mt-5 max-w-[520px] text-balance text-[clamp(40px,4.4vw,64px)] text-headline-grey">
          <Reveal>{words("Built for clinics that never want to miss a call")}</Reveal>
        </h2>
        <Link href="/call" className="mt-10 inline-flex h-14 items-center gap-2 rounded-full bg-periwinkle px-9 text-[17px] font-medium text-white transition hover:bg-periwinkle-600">
          Try the live line
        </Link>
      </div>
      <div className="relative isolate flex min-h-[520px] items-center justify-center overflow-hidden p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/lily-droplets.jpg" alt="" className="botanical-fallback absolute inset-0 -z-10 h-full w-full object-cover" style={{ objectPosition: "40% 50%" }} />
        <motion.div
          className="glass-light squircle relative w-[300px] rounded-[28px] p-6 text-white"
          initial={{ opacity: 0, y: 40, rotate: 0 }}
          whileInView={{ opacity: 1, y: 0, rotate: -9 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        >
          <p className="text-[17px] font-medium leading-[24px] [text-shadow:0_1px_8px_rgba(0,0,0,0.35)]">
            Every booking arrives with a pre-visit brief, so the doctor walks in prepared.
          </p>
          <Link href="/monitor" className="mt-6 inline-flex h-10 items-center gap-1.5 rounded-full bg-white/25 px-4 text-[14px] font-medium hover:bg-white/35">
            See it live <ArrowRightIcon size={14} />
          </Link>
          <div className="absolute -right-6 -top-6">
            <FlowerTile src="/images/tile-2.jpg" size={64} float={false} />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* (5) Periwinkle stats with floating widgets fed by live DB counts — frame 05 */
function Stats({ stats }: { stats: TodayStats | null }) {
  const pct = stats && stats.slots_today ? Math.round((stats.slots_booked_today / stats.slots_today) * 100) : null;
  const r = 62;
  const c = 2 * Math.PI * r;
  const next = stats?.next_visit;
  const avg = stats?.avg_call_s ? `${Math.floor(stats.avg_call_s / 60)}:${String(stats.avg_call_s % 60).padStart(2, "0")}` : null;

  return (
    <section id="stats" className="relative bg-periwinkle px-5 py-24 text-white lg:min-h-[920px] lg:py-0">
      <div className="relative z-10 flex flex-col items-center text-center lg:absolute lg:inset-0 lg:justify-center">
        <p className="inline-flex items-center gap-2.5 text-[18px] text-white/85">
          {stats && <LiveDot />} {stats ? `Live from ${CLINIC}` : `${CLINIC} · offline preview`}
        </p>
        <h2 className="display mt-4 max-w-[760px] text-[clamp(44px,5.5vw,84px)]">
          <Reveal>{words("Your whole front desk in one place")}</Reveal>
        </h2>
        <Link href="/monitor" className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-periwinkle-600 transition hover:bg-white/90">
          <ScreenIcon size={16} /> Open the live monitor
        </Link>
      </div>

      <div className="mx-auto mt-14 grid max-w-[560px] gap-4 sm:grid-cols-2 lg:mt-0 lg:block lg:max-w-none">
        {/* Ring: today's slots booked */}
        <Float phase={0} className="lg:absolute lg:left-[22%] lg:top-[6%]">
          <div className="squircle w-full rounded-[28px] bg-card-on-blue p-6 text-ink shadow-[var(--shadow-float)] lg:w-[230px]">
            <div className="flex items-start justify-between">
              <p className="text-[18px] leading-[22px]">
                Slots
                <br />
                booked today
              </p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[12px] text-ink-muted">Today</span>
            </div>
            <div className="relative mx-auto mt-3 h-[150px] w-[150px]">
              <svg viewBox="0 0 150 150" className="h-full w-full -rotate-90" aria-hidden>
                <circle cx="75" cy="75" r={r} fill="none" stroke="#DCE4FA" strokeWidth="12" />
                <motion.circle
                  cx="75"
                  cy="75"
                  r={r}
                  fill="none"
                  stroke="url(#ring)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={c}
                  initial={{ strokeDashoffset: c }}
                  whileInView={{ strokeDashoffset: c * (1 - (pct ?? 0) / 100) }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.6, ease: EASE, delay: 0.3 }}
                />
                <defs>
                  <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#8EA6EF" />
                    <stop offset="1" stopColor="#4A69CF" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-periwinkle-600">
                <span className="display text-[40px] tabular">{pct ?? "—"}%</span>
                <span className="text-[12px] text-ink-muted">{stats ? `${stats.slots_booked_today} of ${stats.slots_today}` : "offline"}</span>
              </div>
            </div>
          </div>
        </Float>

        {/* Waveform with value tag */}
        <Float phase={1.2} className="hidden lg:absolute lg:left-[46%] lg:top-[10%] lg:block">
          <div className="relative w-[260px] pt-8">
            <span className="absolute left-1/2 top-0 -translate-x-1/2 rounded-md bg-white px-2 py-0.5 text-[12px] font-medium text-ink">Asha · available</span>
            <Waveform level={0.45} width={260} height={70} />
          </div>
        </Float>

        {/* Pill stats */}
        <Float phase={2.1} className="lg:absolute lg:right-[12%] lg:top-[16%]">
          <div className="flex h-[88px] w-full items-center justify-between gap-6 rounded-full bg-card-on-blue px-7 text-ink shadow-[var(--shadow-float)] lg:w-[260px]">
            <div>
              <p className="text-[12px] text-ink-muted">Calls today</p>
              <p className="display text-[34px] tabular">{stats?.calls_today ?? "—"}</p>
            </div>
            <span className="flex items-end gap-1" aria-hidden>
              {[14, 22, 18, 30, 26].map((h, i) => (
                <span key={i} className="w-1.5 rounded-full bg-periwinkle/80" style={{ height: h }} />
              ))}
            </span>
          </div>
        </Float>
        <Float phase={2.8} className="lg:absolute lg:right-[8%] lg:top-[33%]">
          <div className="glass-on-blue flex h-[84px] w-full items-center gap-4 rounded-full px-4 pr-6 lg:w-[300px]">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/25">
              <SparkIcon size={20} />
            </span>
            <div className="flex-1">
              <p className="whitespace-nowrap text-[12px] text-white/75">Booked by AI today</p>
              <p className="display text-[30px] tabular">{stats?.booked_by_ai ?? "—"}</p>
            </div>
            {avg && <span className="whitespace-nowrap rounded-full bg-white/25 px-2 py-0.5 text-[12px] tabular">avg {avg}</span>}
          </div>
        </Float>

        {/* Doctor session pill */}
        <Float phase={3.4} className="lg:absolute lg:left-[4%] lg:top-[42%]">
          <div className="glass-on-blue flex w-full items-center gap-3 rounded-[24px] p-3 pr-6 lg:w-[290px]">
            <FlowerTile src="/images/tile-1.jpg" size={64} float={false} />
            <div>
              <p className="text-[18px] leading-[22px]">Appointments today</p>
              <p className="text-[13px] text-white/75">{stats ? `${stats.appointments_today} across ${stats.doctors.length} doctors` : "Clinic offline"}</p>
            </div>
          </div>
        </Float>

        {/* Doctors list — like "Taking pills" */}
        <Float phase={4.1} className="lg:absolute lg:bottom-[6%] lg:left-[16%]">
          <div className="w-full rounded-[28px] p-1 lg:w-[380px]">
            <div className="flex items-center justify-between px-2">
              <p className="text-[18px]">Doctors on today</p>
              <a href="/monitor" className="text-[13px] text-white/80 underline-offset-2 hover:underline">
                Live view
              </a>
            </div>
            <div className="mt-3 space-y-3">
              {(stats?.doctors ?? []).map((d, i) => (
                <div key={d.name} className="flex items-center gap-3">
                  <Initials text={initialsOf(d.name.replace("Dr. ", ""))} size={52} tone={i === 1 ? "glass" : i === 2 ? "sage" : "periwinkle"} />
                  <div className="flex-1">
                    <p className="text-[16px] leading-[20px]">{d.name}</p>
                    <div className="mt-1 flex gap-1.5">
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[12px]">{d.specialty}</span>
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[12px] tabular">₹{d.fee}</span>
                    </div>
                  </div>
                  <span className={`flex h-7 w-12 items-center rounded-full p-1 ${d.open_today ? "bg-success/90" : "bg-white/20"}`} aria-label={d.open_today ? `${d.open_today} open slots today` : "Fully booked today"}>
                    <span className={`h-5 w-5 rounded-full bg-white transition ${d.open_today ? "translate-x-5" : ""}`} />
                  </span>
                </div>
              ))}
              {!stats && <p className="px-2 text-[14px] text-white/75">Live numbers appear when the clinic database is reachable.</p>}
            </div>
          </div>
        </Float>

        {/* Scheduled visit */}
        <Float phase={4.8} className="lg:absolute lg:bottom-[5%] lg:right-[16%]">
          <div className="squircle w-full rounded-[28px] bg-white p-5 text-ink shadow-[var(--shadow-float)] lg:w-[340px]">
            <div className="flex items-center justify-between">
              <p className="text-[20px]">Next visit</p>
              <Chip tone="outline" className="h-8 text-[13px]">
                <CalendarIcon size={14} /> {next?.long_day ?? "—"}
              </Chip>
            </div>
            <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#BFD0F7] to-[#8EA6EF] p-4 text-white">
              <p className="text-[15px] font-medium">{next?.specialty ?? "No visits yet"}</p>
              <p className="text-[13px] text-white/80">{next?.doctor_name ?? ""}</p>
              <div className="mt-5 flex items-end justify-between">
                <span className="display text-[44px] tabular">{next?.time_label ?? "—"}</span>
                <span className="rounded-full bg-white/30 px-2.5 py-0.5 text-[12px]">30 min</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Chip tone="light" className="h-8 text-[13px]">
                <CheckIcon size={14} /> Intake
              </Chip>
              <Chip tone="outline" className="h-8 text-[13px]">Brief in Claude</Chip>
            </div>
          </div>
        </Float>
      </div>
    </section>
  );
}
