import { z } from "zod";

// LLMs sometimes send null or "" for optional fields; normalise both to undefined.
const optText = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));
const reqText = z.string().trim().min(1);

const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);

// ---------- Voice agent tools (POST /api/tools/[tool]) ----------

export const searchPolicyInput = z.object({
  query: reqText.describe("The patient's question rephrased as a search query"),
});

export const timePreference = z.preprocess(
  lower,
  z.enum(["morning", "afternoon", "evening", "any"]).catch("any"),
);

export const checkAvailabilityInput = z.object({
  specialty: optText,
  doctor_name: optText,
  day_preference: optText,
  time_preference: timePreference.optional(),
});

export const bookAppointmentInput = z.object({
  slot_id: z.coerce.number().int().positive(),
  patient_name: reqText,
  patient_phone: optText,
  reason: reqText,
});

export const saveIntakeInput = z.object({
  chief_complaint: reqText,
  duration: optText,
  severity: optText,
  current_medications: optText,
  notes: optText,
});

export const flagForStaffInput = z.object({
  reason: reqText,
  urgency: z.preprocess(lower, z.enum(["routine", "urgent", "emergency"]).catch("urgent")),
});

export const toolInputs = {
  search_policy: searchPolicyInput,
  check_availability: checkAvailabilityInput,
  book_appointment: bookAppointmentInput,
  save_intake: saveIntakeInput,
  flag_for_staff: flagForStaffInput,
} as const;

export type ToolName = keyof typeof toolInputs;
export const TOOL_NAMES = Object.keys(toolInputs) as ToolName[];

export const callIdSchema = z.string().uuid();

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilityInput>;
export type BookAppointmentInput = z.infer<typeof bookAppointmentInput>;
export type SaveIntakeInput = z.infer<typeof saveIntakeInput>;
export type FlagForStaffInput = z.infer<typeof flagForStaffInput>;

// ---------- Calls ----------

export const transcriptInput = z.object({
  role: z.preprocess(
    (v) => (v === "user" ? "patient" : v === "ai" ? "agent" : v),
    z.enum(["patient", "agent"]),
  ),
  text: z.string(),
});

export const endCallInput = z.object({
  eleven_conversation_id: optText,
});

// ---------- MCP tools (Claude, the doctor's view) ----------

export const scheduleRange = z.enum(["today", "tomorrow", "this_week", "next_7_days"]);

export const getScheduleInput = z.object({
  doctor: z.string().optional().describe("Doctor name or slug. Defaults to Dr. Meera Iyer."),
  range: scheduleRange.optional().describe("today, tomorrow, this_week or next_7_days (default)"),
});

export const getPatientBriefInput = z.object({
  patient_name: z.string().min(1).describe("The patient's name; fuzzy matched"),
});

export const listRecentCallsInput = z.object({
  limit: z.number().int().min(1).max(20).optional().describe("How many calls to list (default 5)"),
});

export const mcpSearchPolicyInput = z.object({
  query: z.string().min(1).describe("What to look up in clinic policy"),
});

export const blockDayInput = z.object({
  day: z.string().min(1).describe('The single day to block, in the doctor\'s words: "Saturday", "tomorrow", "the 10th", "Saturday 10 October"'),
  doctor: z.string().optional().describe("Doctor name. Defaults to Dr. Meera Iyer."),
  reason: z.string().optional().describe('Short reason shown to the front desk, e.g. "conference", "personal leave"'),
});

export const reopenDayInput = blockDayInput.pick({ day: true, doctor: true });

export const notifyFrontDeskInput = z.object({
  message: z.string().min(1).describe("The note for the front desk, in plain words"),
  urgency: z.enum(["routine", "urgent"]).optional().describe("urgent shows the note in red on the front-desk monitor (default routine)"),
  doctor: z.string().optional().describe("Doctor sending the note. Defaults to Dr. Meera Iyer."),
});

export type ScheduleRange = z.infer<typeof scheduleRange>;
