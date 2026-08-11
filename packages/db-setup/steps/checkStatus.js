// packages/db-setup/steps/checkStatus.js
import { execFileSync } from "node:child_process";
import { Client } from "pg";

import { loadAdminConfig } from "../configStore.js";

async function loadPlatformModule() {
  if (process.platform === "win32") {
    return import("../platform/windows.js");
  }
  if (process.platform === "darwin") {
    return import("../platform/mac.js");
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * Checks the live status of a host that has already been set up:
 *   - is the Postgres service registered/running
 *   - can we actually connect as app_user and run a query
 *
 * Does NOT modify anything — purely read-only, safe to call any time.
 *
 * Returns { configured: false } if this machine has never been set up
 * at all (no admin config found).
 */
export async function getHostStatus(paths) {
  const adminConfig = loadAdminConfig(paths);
  if (!adminConfig || !adminConfig.appUser) {
    return { configured: false };
  }

  const platform = await loadPlatformModule();
  const serviceRunning = isServiceRunning(platform);
  const connection = await testAppUserConnection(adminConfig);

  return {
    configured: true,
    serviceRunning,
    connectionOk: connection.ok,
    connectionError: connection.error,
    host: adminConfig.host,
    port: adminConfig.port,
    database: adminConfig.appDatabase,
    user: adminConfig.appUser,
  };
}

function isServiceRunning(platform) {
  const { exe, args } = platform.isServiceRegisteredCommand();
  try {
    const output = execFileSync(exe, args, { encoding: "utf-8" });
    if (process.platform === "win32") {
      // sc query prints STATE lines; "RUNNING" appears when actually up,
      // as opposed to merely registered but stopped.
      return output.includes("RUNNING");
    }
    if (process.platform === "darwin") {
      // launchctl list prints a PID column when running; "-" when loaded
      // but not currently running.
      return !output.trim().startsWith("-");
    }
    return output.length > 0;
  } catch {
    return false;
  }
}

async function testAppUserConnection(adminConfig) {
  const client = new Client({
    host: adminConfig.host,
    port: adminConfig.port,
    user: adminConfig.appUser,
    password: adminConfig.appUserPassword,
    database: adminConfig.appDatabase,
    connectionTimeoutMillis: 3000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await client.end().catch(() => {});
  }
}
