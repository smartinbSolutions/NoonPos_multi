// packages/app/src/main/services/backup/pgBackup.service.js
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import { getPgDumpPath, getPgRestorePath } from "../db/pgBinPaths.js";
import { loadDbConfig } from "../db/dbConnectionConfig.js";
import { loadAdminConfig } from "@noonpos/db-setup/configStore.js";
import { getPaths as getWindowsPaths } from "@noonpos/db-setup/platform/windows.js";
import { getPaths as getMacPaths } from "@noonpos/db-setup/platform/mac.js";

const execFileAsync = promisify(execFile);

function buildBackupFileName() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `noonpos-backup-${stamp}.dump`;
}

function getPlatformPaths() {
  if (process.platform === "win32") return getWindowsPaths();
  if (process.platform === "darwin") return getMacPaths();
  return null;
}

/**
 * Runs pg_dump against Postgres using the app_user's own saved
 * connection (config.host may be loopback on the host, or the host's
 * LAN IP on a guest terminal — either way, pg_dump just needs network
 * access, not local execution). Safe to run at any time, from any
 * terminal: pg_dump takes a consistent MVCC snapshot without blocking
 * or being blocked by other terminals actively using the database, and
 * only needs read access, which app_user already has.
 *
 * Uses custom format (-F c): compressed, supports selective restore, and
 * is Postgres's own recommended format over plain SQL.
 */
export async function pgDumpBackup({ targetFolder }) {
  const config = loadDbConfig();
  if (!config) {
    return { success: false, error: "NO_DB_CONFIG" };
  }

  const fileName = buildBackupFileName();
  const fullPath = path.join(targetFolder, fileName);

  const args = [
    "-h",
    config.host,
    "-p",
    String(config.port),
    "-U",
    config.user,
    "-d",
    config.database,
    "-F",
    "c",
    "-f",
    fullPath,
  ];

  try {
    await execFileAsync(getPgDumpPath(), args, {
      env: { ...process.env, PGPASSWORD: config.password },
    });
    return { success: true, filePath: fullPath, fileName };
  } catch (err) {
    return {
      success: false,
      error: err.stderr?.toString().trim() || err.message || String(err),
    };
  }
}

/**
 * Restores a dump file into the LOCAL Postgres instance. Destructive:
 * --clean drops existing objects before recreating them and reloading
 * data. Caller MUST call terminateOtherConnections() first — pg_restore
 * cannot safely drop/recreate objects while other sessions hold locks on
 * them.
 *
 * HOST-ONLY, structurally: a --clean restore does DDL (CREATE TABLE,
 * ALTER TABLE ... ADD IDENTITY) that requires ownership of the public
 * schema — rights app_user was deliberately never granted (see
 * createDatabase.js). Only the Postgres SUPERUSER can do this, and its
 * credentials live only in pg-admin.json on the host machine — never
 * distributed to guest terminals. Callers must still check
 * isDbHostMachine() before calling this; if that check ever gets
 * skipped, this function fails cleanly with RESTORE_REQUIRES_HOST_SUPERUSER
 * rather than silently trying (and crashing) with the wrong credentials.
 *
 * --no-owner: the dump may have been created under a different OS-level
 * role than the one restoring it; without this flag, pg_restore can fail
 * trying to ALTER OWNER to a role that doesn't exist on this instance.
 */
export async function pgRestoreBackup({ backupFilePath }) {
  const platformPaths = getPlatformPaths();
  const adminConfig = platformPaths ? loadAdminConfig(platformPaths) : null;

  if (!adminConfig?.superuser || !adminConfig?.superuserPassword) {
    return { success: false, error: "RESTORE_REQUIRES_HOST_SUPERUSER" };
  }

  const appConfig = loadDbConfig();
  if (!appConfig) {
    return { success: false, error: "NO_DB_CONFIG" };
  }

  const args = [
    "-h",
    adminConfig.host,
    "-p",
    String(adminConfig.port),
    "-U",
    adminConfig.superuser,
    "-d",
    appConfig.database,
    "--clean",
    "--if-exists",
    "--no-owner",
    backupFilePath,
  ];

  try {
    await execFileAsync(getPgRestorePath(), args, {
      env: { ...process.env, PGPASSWORD: adminConfig.superuserPassword },
    });
    return { success: true };
  } catch (err) {
    // pg_restore can exit non-zero on non-fatal warnings (e.g. skipping
    // a role/privilege that doesn't exist on this instance) as well as
    // genuine failures. Surface stderr either way and let the caller
    // decide, rather than assuming every non-zero exit is a hard failure.
    return {
      success: false,
      error: err.stderr?.toString().trim() || err.message || String(err),
    };
  }
}

/**
 * Terminates every other active connection to the target database before
 * a restore, so pg_restore --clean isn't fighting other sessions' locks.
 * Excludes this call's own backend via pg_backend_pid() — it's issued
 * through the app's normal pool, which itself counts as "a connection."
 */
export async function terminateOtherConnections(queryFn, databaseName) {
  await queryFn(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [databaseName],
  );
}
