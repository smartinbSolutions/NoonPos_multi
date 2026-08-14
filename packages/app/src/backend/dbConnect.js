// packages/app/src/backend/dbConnect.js
import pg from "pg";
import { loadDbConfig } from "../main/db/dbConnectionConfig.js";

const { Pool } = pg;

let pool = null;

function getPool() {
  if (pool) return pool;

  const config = loadDbConfig();
  if (!config) {
    throw new Error(
      "No database connection config found — this should be unreachable, " +
        "since IPC handlers only register after DbSetupPage has saved a config."
    );
  }

  pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
  });

  return pool;
}

/**
 * Run a single query against the pool. Use this for anything that's just
 * one statement — Postgres handles connection reuse automatically.
 */
export function query(text, params) {
  return getPool().query(text, params);
}

/**
 * Get a dedicated client for a multi-statement transaction (BEGIN/COMMIT/
 * ROLLBACK). Caller MUST call client.release() when done, in a finally
 * block, or the connection leaks from the pool.
 *
 * Usage:
 *   const client = await getClient();
 *   try {
 *     await client.query("BEGIN");
 *     ...
 *     await client.query("COMMIT");
 *   } catch (err) {
 *     await client.query("ROLLBACK");
 *     throw err;
 *   } finally {
 *     client.release();
 *   }
 */
export function getClient() {
  return getPool().connect();
}