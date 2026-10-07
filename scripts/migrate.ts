import "./load-env";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../lib/db";

async function main() {
  const db = pool();
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await db.query<{ name: string }>(`SELECT name FROM schema_migrations`)).rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) {
      console.log(`[migrate] skip ${f}`);
      continue;
    }
    const sql = readFileSync(join(dir, f), "utf8");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [f]);
      await client.query("COMMIT");
      console.log(`[migrate] applied ${f}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  await db.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
