// Verifies the MCP server over Streamable HTTP like a client would: initialize, tools/list, then call every tool.
//   npx tsx scripts/mcp-check.ts [--base http://localhost:3100]
import "./load-env";

const i = process.argv.indexOf("--base");
const base = (i > -1 ? process.argv[i + 1] : "http://localhost:3100").replace(/\/$/, "");
const url = `${base}/api/mcp/${process.env.MCP_SECRET}`;
let id = 0;

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const raw = await res.text();
  const json = raw.trim().startsWith("{") ? raw : raw.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).pop() ?? "{}";
  const msg = JSON.parse(json);
  if (msg.error) throw new Error(`${method}: ${JSON.stringify(msg.error)}`);
  return msg.result;
}

async function main() {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-check", version: "1" } });
  console.log(`server: ${init.serverInfo.name} ${init.serverInfo.version}`);
  const { tools } = await rpc("tools/list");
  console.log(`tools: ${tools.map((t: { name: string }) => t.name).join(", ")}\n`);
  const calls: [string, Record<string, unknown>][] = [
    ["get_schedule", { range: "this_week" }],
    ["get_patient_brief", { patient_name: process.argv.includes("--patient") ? process.argv[process.argv.indexOf("--patient") + 1] : "Abhishek" }],
    ["list_recent_calls", { limit: 3 }],
    ["search_policy", { query: "Do you accept Star Health insurance cashless?" }],
  ];
  for (const [name, args] of calls) {
    const r = await rpc("tools/call", { name, arguments: args });
    const text = r.content?.[0]?.text ?? "";
    console.log(`=== ${name}(${JSON.stringify(args)})${r.isError ? " ERROR" : ""}\n${name === "get_schedule" ? text.split("\n").slice(0, 8).join("\n") + "\n…" : text.slice(0, 900)}\n`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
