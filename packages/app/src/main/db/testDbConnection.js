// packages/app/src/main/db/testDbConnection.js
import { Client } from "pg";

/**
 * Attempts a real connection with the given config and runs a trivial
 * query to confirm it actually works — not just that the host is
 * reachable, but that these exact credentials can connect and query.
 *
 * Returns { success: true } or { success: false, error } — never
 * throws, so callers (IPC handlers) can return this directly per the
 * existing { success, error } envelope convention.
 */
export async function testDbConnection(config) {
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return { success: true };
  } catch (err) {
    console.error("[testDbConnection] Raw error:", err.code, err.message, err);
    return { success: false, error: mapConnectionError(err) };
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Maps raw pg/network errors to error codes the renderer can translate,
 * consistent with the existing mapErrorCode pattern used for other IPC
 * handlers — SCREAMING_SNAKE_CASE codes, not raw error messages, since
 * raw messages aren't localized and can be confusing to end users.
 */
function mapConnectionError(err) {
  if (err.code === "ECONNREFUSED") {
    return "DB_CONNECTION_REFUSED";
  }
  if (err.code === "ENOTFOUND" || err.code === "EHOSTUNREACH") {
    return "DB_HOST_UNREACHABLE";
  }
  if (err.code === "ETIMEDOUT" || err.message?.includes("timeout")) {
    return "DB_CONNECTION_TIMEOUT";
  }
  if (err.code === "28P01") {
    return "DB_AUTH_FAILED";
  }
  if (err.code === "3D000") {
    return "DB_DATABASE_NOT_FOUND";
  }
  return "DB_CONNECTION_FAILED";
}
