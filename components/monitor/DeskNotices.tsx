"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { DeskNote } from "@/lib/core/desk";
import { AlertIcon, CalendarIcon, CheckIcon, ChevronDownIcon } from "../ui/icons";

const AUTO_CLOSE_MS = 12_000;

function headline(n: DeskNote): string {
  const from = n.doctor_name ?? "Doctor";
  if (n.kind === "day_blocked") {
    const count = n.details.patients?.length ?? 0;
    return `${from} · ${n.details.day_label} blocked · ${count} to reschedule`;
  }
  if (n.kind === "day_reopened") return `${from} · ${n.details.day_label} open again`;
  return `Note from ${from}`;
}

/**
 * Doctor → front desk messages sent from Claude (block_day, notify_front_desk).
 * Sits in the top bar's centre slot; opens by itself when something new arrives, then folds back to a pill.
 */
export function DeskNotices({ notes, adminToken }: { notes: DeskNote[]; adminToken: string | null }) {
  const [open, setOpen] = useState(false);
  const latestId = notes[0]?.id;
  const seen = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (latestId === undefined) {
      setOpen(false);
      return;
    }
    // Skip the auto-open for notes that were already there when the page loaded.
    if (seen.current !== undefined && latestId !== seen.current) {
      setOpen(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    }
    seen.current = latestId;
  }, [latestId]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const done = async (id: number) => {
    if (!adminToken) return;
    await fetch(`/api/desk/notes/${id}/done`, { method: "POST", headers: { "x-admin-token": adminToken } }).catch(() => {});
  };

  if (!notes.length) return <div className="text-[18px] text-white/80">Fernleaf Clinic · Live front desk</div>;
  const top = notes[0];
  const urgent = top.urgency === "urgent";

  return (
    <div className="relative">
      <motion.button
        key={top.id}
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 18 }}
        onClick={() => {
          clearTimeout(timer.current);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className="inline-flex h-12 max-w-[760px] items-center gap-3 rounded-full bg-white pl-2 pr-5 text-[17px] font-medium text-ink shadow-[var(--shadow-float)]"
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${urgent ? "bg-danger" : "bg-periwinkle"}`}>
          {top.kind === "note" ? <AlertIcon size={16} /> : <CalendarIcon size={16} />}
        </span>
        <span className="truncate">{headline(top)}</span>
        {notes.length > 1 && <span className="rounded-full bg-[#EEF1F8] px-2 py-0.5 text-[13px] text-ink-muted">+{notes.length - 1}</span>}
        <ChevronDownIcon size={18} className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 200, damping: 22 }}
            className="soft-scroll absolute left-1/2 top-[60px] z-40 max-h-[720px] w-[820px] -translate-x-1/2 overflow-y-auto rounded-[28px] bg-white p-6 text-ink shadow-[0_30px_80px_-20px_rgba(20,30,80,0.55)]"
          >
            {notes.map((n, i) => (
              <div key={n.id} className={i ? "mt-5 border-t border-[#EEF0F5] pt-5" : ""}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className={`text-[13px] font-medium uppercase tracking-[0.08em] ${n.urgency === "urgent" ? "text-danger" : "text-[#9AA0AE]"}`}>
                      From {n.doctor_name ?? "the doctor"} · via Claude
                    </div>
                    <p className="mt-1.5 text-[21px] leading-[30px]">{n.message}</p>
                  </div>
                  {adminToken && (
                    <button
                      onClick={() => done(n.id)}
                      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#EEF1F8] px-4 text-[15px] font-medium text-ink hover:bg-[#E2E6EF]"
                    >
                      <CheckIcon size={15} /> Done
                    </button>
                  )}
                </div>
                {!!n.details.patients?.length && (
                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
                    {n.details.patients.map((p) => (
                      <div key={p.appointment_id} className="flex items-baseline gap-3 rounded-[14px] bg-[#F5F7FC] px-4 py-2.5">
                        <span className="tabular w-[52px] shrink-0 text-[17px] font-medium text-periwinkle-600">{p.time_label}</span>
                        <span className="min-w-0">
                          <span className="block text-[17px] font-medium">{p.patient_name}</span>
                          <span className="block text-[14px] text-ink-muted">{p.reason}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
