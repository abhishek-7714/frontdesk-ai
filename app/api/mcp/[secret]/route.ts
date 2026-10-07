import { createMcpHandler } from "mcp-handler";
import { env } from "@/lib/env";
import { getPatientBriefInput, getScheduleInput, listRecentCallsInput, mcpSearchPolicyInput } from "@/lib/schemas";
import { patientBriefMarkdown, policyMarkdown, recentCallsMarkdown, scheduleMarkdown } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const safe = async (fn: () => Promise<string>) => {
  try {
    return text(await fn());
  } catch (err) {
    console.error("[mcp] tool failed:", err instanceof Error ? err.message : err);
    return { ...text("The clinic system could not answer that right now. Please try again in a moment."), isError: true };
  }
};

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_schedule",
      {
        title: "Get schedule",
        description:
          "Get a doctor's appointments at Fernleaf Clinic, with each patient's reason for visit and pre-visit intake summary. Defaults to the signed-in doctor, Dr. Meera Iyer, and to the next 7 days. Use this for any question about the doctor's schedule, upcoming patients, or who is coming in.",
        inputSchema: getScheduleInput,
        annotations: { readOnlyHint: true },
      },
      async ({ doctor, range }) => safe(() => scheduleMarkdown({ doctor, range })),
    );

    server.registerTool(
      "get_patient_brief",
      {
        title: "Get patient brief",
        description:
          "Get the full pre-visit brief for one patient: upcoming appointment, intake answers, call summary and how they booked. Fuzzy-matches the name.",
        inputSchema: getPatientBriefInput,
        annotations: { readOnlyHint: true },
      },
      async ({ patient_name }) => safe(() => patientBriefMarkdown(patient_name)),
    );

    server.registerTool(
      "list_recent_calls",
      {
        title: "List recent calls",
        description: "List the most recent calls handled by the AI receptionist, with outcome (booked, information only, escalated) and summary.",
        inputSchema: listRecentCallsInput,
        annotations: { readOnlyHint: true },
      },
      async ({ limit }) => safe(() => recentCallsMarkdown(limit ?? 5)),
    );

    server.registerTool(
      "search_policy",
      {
        title: "Search clinic policy",
        description:
          "Search Fernleaf Clinic's internal policies (fees, insurance, timings, test preparation, department rules) and return the matching passages with their source document.",
        inputSchema: mcpSearchPolicyInput,
        annotations: { readOnlyHint: true },
      },
      async ({ query }) => safe(() => policyMarkdown(query)),
    );
  },
  { serverInfo: { name: "fernleaf-frontdesk", version: "1.0.0" } },
);

// The secret in the path is the only credential (token-in-URL auth); anything else is a 404.
async function guarded(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  const expected = env().MCP_SECRET;
  if (!expected || secret !== expected) return new Response("Not found", { status: 404 });
  return handler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
