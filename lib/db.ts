import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

const g = globalThis as unknown as { __fdPool?: Pool };

export function pool(): Pool {
  if (!g.__fdPool) {
    const url = env().DATABASE_URL;
    const local = /localhost|127\.0\.0\.1|\.railway\.internal/.test(url);
    g.__fdPool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
    });
    g.__fdPool.on("error", (err) => console.error("[db] idle client error", err.message));
  }
  return g.__fdPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
