import { EventEmitter } from "node:events";
import { query } from "./db";

export type EventType =
  | "call.started"
  | "transcript.line"
  | "tool.search_policy"
  | "tool.check_availability"
  | "tool.book_appointment"
  | "tool.save_intake"
  | "tool.flag_for_staff"
  | "call.ended"
  | "handoff.ready"
  | "demo.reset"
  | "desk.updated";

export type CallEvent = {
  id: number;
  call_id: string;
  type: EventType;
  payload: Record<string, unknown>;
  at: string;
};

const g = globalThis as unknown as { __fdBus?: EventEmitter };

export function bus(): EventEmitter {
  if (!g.__fdBus) {
    g.__fdBus = new EventEmitter();
    g.__fdBus.setMaxListeners(200);
  }
  return g.__fdBus;
}

/** Persist an event to call_events and publish it to live monitors. Never throws. */
export async function emit(callId: string, type: EventType, payload: unknown): Promise<void> {
  const body = (payload ?? {}) as Record<string, unknown>;
  try {
    // Not tied to a call, so not persisted in call_events: monitors re-read state on receipt.
    if (type === "demo.reset" || type === "desk.updated") {
      publish({ id: -Date.now(), call_id: callId, type, payload: body, at: new Date().toISOString() });
      return;
    }
    const [row] = await query<{ id: string; at: Date }>(
      `INSERT INTO call_events (call_id, type, payload) VALUES ($1, $2, $3) RETURNING id, at`,
      [callId, type, JSON.stringify(body)],
    );
    publish({ id: Number(row.id), call_id: callId, type, payload: body, at: row.at.toISOString() });
  } catch (err) {
    console.error(`[events] emit ${type} failed:`, err instanceof Error ? err.message : err);
  }
}

function publish(event: CallEvent) {
  bus().emit("event", event);
}
