import "./load-env";

// Calls the running app's reset endpoint so connected monitors return to idle.
// Usage: npm run reset [-- --base https://your-app.up.railway.app]
const argBase = process.argv.indexOf("--base");
const base = (argBase > -1 ? process.argv[argBase + 1] : process.env.APP_URL) ?? "http://localhost:3100";

async function main() {
  const token = process.env.ADMIN_TOKEN;
  if (!token) throw new Error("ADMIN_TOKEN is not set");
  const res = await fetch(`${base.replace(/\/$/, "")}/api/admin/reset`, { method: "POST", headers: { "x-admin-token": token } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`reset failed: ${res.status} ${JSON.stringify(body)}`);
  console.log(`[reset] ${base}:`, JSON.stringify(body));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
