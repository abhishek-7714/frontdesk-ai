// Client-side projection of call events into monitor state. The monitor is a pure function of events.

export type MonitorEvent = { id: number; call_id: string; type: string; payload: Record<string, unknown>; at: string };

export type TranscriptLine = { id: number; role: "patient" | "agent"; text: string; at: number };

export type SlotChip = { slot_id: number; day_label: string; time_label: string; spoken: string };

export type FeedItem =
  | { key: string; kind: "policy"; at: number; query: string; top: { doc_title: string; section: string; snippet: string } | null }
  | { key: string; kind: "slots"; at: number; doctor: { name: string; specialty: string; fee_inr: number; initials: string }; slots: SlotChip[] }
  | {
      key: string;
      kind: "booked";
      at: number;
      doctor: { name: string; specialty: string; initials: string };
      patient_name: string;
      reason: string;
      day_label: string;
      long_day: string;
      time_label: string;
      fee_inr: number;
      duration_min: number;
    }
  | {
      key: string;
      kind: "intake";
      at: number;
      fields: { chief_complaint: string | null; duration: string | null; severity: string | null; current_medications: string | null; notes: string | null };
    }
  | { key: string; kind: "escalation"; at: number; reason: string; urgency: string };

export type Ended = {
  summary: string;
  duration_s: number;
  outcome: "booked" | "escalated" | "information";
  patient_name: string | null;
  appointment: { doctor_name: string; specialty: string; long_day: string; time_label: string; reason: string } | null;
};

export type MonitorState = {
  phase: "idle" | "live" | "ended";
  callId: string | null;
  startedAt: number | null;
  endedAt: number | null;
  lines: TranscriptLine[];
  feed: FeedItem[];
  patientName: string | null;
  bookedSlot: { day_label: string; time_label: string } | null;
  ended: Ended | null;
  handoff: string | null;
  seen: Set<number>;
};

export const initialState: MonitorState = {
  phase: "idle",
  callId: null,
  startedAt: null,
  endedAt: null,
  lines: [],
  feed: [],
  patientName: null,
  bookedSlot: null,
  ended: null,
  handoff: null,
  seen: new Set(),
};

export type Action = { type: "event"; event: MonitorEvent } | { type: "snapshot"; events: MonitorEvent[]; callId: string | null } | { type: "reset" };

function freshCall(callId: string, at: number): MonitorState {
  return { ...initialState, seen: new Set(), phase: "live", callId, startedAt: at };
}

function apply(state: MonitorState, e: MonitorEvent): MonitorState {
  if (e.type === "demo.reset") return { ...initialState, seen: new Set() };
  if (state.seen.has(e.id)) return state;
  const at = Date.parse(e.at);
  const p = e.payload as Record<string, never>;

  // A new call replaces the previous one.
  if (e.type === "call.started") {
    const s = freshCall(e.call_id, p.started_at ? Date.parse(p.started_at) : at);
    s.seen.add(e.id);
    return s;
  }
  if (e.call_id !== state.callId) state = freshCall(e.call_id, at);

  const seen = new Set(state.seen);
  seen.add(e.id);
  const next: MonitorState = { ...state, seen };

  switch (e.type) {
    case "transcript.line":
      next.lines = [...state.lines, { id: e.id, role: p.role, text: p.text, at }];
      break;
    case "tool.search_policy":
      next.feed = [{ key: `p-${e.id}`, kind: "policy", at, query: p.query, top: p.top }, ...state.feed];
      break;
    case "tool.check_availability":
      next.feed = [{ key: `s-${e.id}`, kind: "slots", at, doctor: p.doctor, slots: p.slots ?? [] }, ...state.feed];
      break;
    case "tool.book_appointment":
      next.patientName = p.patient_name;
      next.bookedSlot = { day_label: p.day_label, time_label: p.time_label };
      next.feed = [
        {
          key: `b-${e.id}`,
          kind: "booked",
          at,
          doctor: p.doctor,
          patient_name: p.patient_name,
          reason: p.reason,
          day_label: p.day_label,
          long_day: p.long_day,
          time_label: p.time_label,
          fee_inr: p.fee_inr,
          duration_min: p.duration_min ?? 30,
        },
        ...state.feed,
      ];
      break;
    case "tool.save_intake": {
      // One intake card per call, updated in place as fields arrive.
      const existing = state.feed.find((f) => f.kind === "intake");
      const item: FeedItem = { key: existing?.key ?? `i-${e.id}`, kind: "intake", at: existing?.at ?? at, fields: p.fields };
      next.feed = existing ? state.feed.map((f) => (f.kind === "intake" ? item : f)) : [item, ...state.feed];
      break;
    }
    case "tool.flag_for_staff":
      next.feed = [{ key: `e-${e.id}`, kind: "escalation", at, reason: p.reason, urgency: p.urgency }, ...state.feed];
      break;
    case "call.ended":
      next.phase = "ended";
      next.endedAt = at;
      next.ended = p as unknown as Ended;
      if (p.patient_name) next.patientName = p.patient_name;
      break;
    case "handoff.ready":
      next.handoff = p.doctor_name;
      break;
  }
  return next;
}

export function reducer(state: MonitorState, action: Action): MonitorState {
  switch (action.type) {
    case "reset":
      return { ...initialState, seen: new Set() };
    case "event":
      return apply(state, action.event);
    case "snapshot": {
      if (!action.callId) return state.phase === "idle" ? state : { ...initialState, seen: new Set() };
      // Rebuild from the snapshot when it is a different call; otherwise just apply unseen events.
      let s = state.callId === action.callId ? state : { ...initialState, seen: new Set<number>() };
      for (const e of action.events) s = apply(s, e);
      return s;
    }
  }
}

export function speakingState(lines: TranscriptLine[], now: number, phase: MonitorState["phase"]): { level: number; tag: string } {
  if (phase !== "live") return { level: 0.08, tag: phase === "ended" ? "Call ended" : "Line open" };
  const last = lines[lines.length - 1];
  if (!last) return { level: 0.5, tag: "Ringing" };
  const speakMs = 900 + last.text.length * 55;
  if (now - last.at < speakMs) return last.role === "agent" ? { level: 0.95, tag: "Asha speaking" } : { level: 0.62, tag: "Patient speaking" };
  return last.role === "agent" ? { level: 0.22, tag: "Listening" } : { level: 0.3, tag: "Asha thinking" };
}
