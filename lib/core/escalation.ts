import { one } from "../db";
import { emit } from "../events";
import type { FlagForStaffInput } from "../schemas";
import { ensureCall } from "./calls";

export async function flagForStaff(callId: string, input: FlagForStaffInput) {
  await ensureCall(callId);
  const row = await one<{ id: number }>(`INSERT INTO escalations (call_id, reason, urgency) VALUES ($1, $2, $3) RETURNING id`, [callId, input.reason, input.urgency]);
  await emit(callId, "tool.flag_for_staff", { escalation_id: row?.id, reason: input.reason, urgency: input.urgency });
  const message =
    input.urgency === "emergency"
      ? "Staff alerted. Tell the caller clearly to call 112 or go to the nearest emergency department now. Do not continue booking."
      : "Staff have been notified and the front desk will call the patient back today.";
  return { flagged: true, escalation_id: row?.id, message };
}
