const path = require("path");
const { app } = require("electron");
const Database = require("better-sqlite3");
import { pgDumpBackup } from "./pgBackup.service.js";

/* ============================================================
   CONFIG
   ============================================================ */

const BACKUP_META_FILENAME = "backup-meta.db";

const SCHEDULE_FREQUENCIES = ["daily", "weekly"];
const RESTORE_AUTH_METHODS = ["pin_and_recovery_key"];
const RESTORE_STATUSES = ["success", "failed"];

/* ============================================================
   CONNECTION (lazy singleton, same file for the app's lifetime)
   ============================================================ */

let dbInstance = null;

export function getBackupMetaPath() {
  return path.join(app.getPath("userData"), BACKUP_META_FILENAME);
}

function getDb() {
  if (dbInstance) return dbInstance;

  const dbPath = getBackupMetaPath();
  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");

  initSchema(dbInstance);

  return dbInstance;
}

/* ============================================================
   SCHEMA (idempotent — safe to run on every app start)
   ============================================================ */

function initSchema(db) {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS backup_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      default_folder TEXT,
      schedule_enabled INTEGER NOT NULL DEFAULT 0,
      schedule_frequency TEXT CHECK(schedule_frequency IN ('daily','weekly')),
      schedule_time TEXT,
      schedule_day_of_week INTEGER CHECK(schedule_day_of_week BETWEEN 0 AND 6),
      last_backup_at TEXT,
      last_backup_status TEXT CHECK(last_backup_status IN ('success','failed')),
      last_backup_error TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS restore_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      performed_at TEXT NOT NULL DEFAULT (datetime('now')),
      administrator_username TEXT NOT NULL,
      auth_method TEXT NOT NULL CHECK(auth_method IN ('pin_and_recovery_key')),
      backup_file_name TEXT NOT NULL,
      backup_file_mtime TEXT,
      device TEXT,
      status TEXT NOT NULL CHECK(status IN ('success','failed')),
      error_message TEXT
    );`,
  ).run();
}

/* ============================================================
   BACKUP SETTINGS
   ============================================================ */

export function getBackupSettings() {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM backup_settings WHERE id = 1`).get();

    return { success: true, data: row || null };
  } catch (err) {
    return { success: false, error: "BACKUP_SETTINGS_READ_FAILED" };
  }
}

/**
 * Upserts the singleton settings row. Pass only the fields you want to change;
 * existing values are preserved via COALESCE.
 */
export function updateBackupSettings(partial) {
  try {
    if (
      partial.scheduleFrequency &&
      !SCHEDULE_FREQUENCIES.includes(partial.scheduleFrequency)
    ) {
      return { success: false, error: "INVALID_SCHEDULE_FREQUENCY" };
    }
    if (
      partial.scheduleDayOfWeek !== undefined &&
      partial.scheduleDayOfWeek !== null &&
      (partial.scheduleDayOfWeek < 0 || partial.scheduleDayOfWeek > 6)
    ) {
      return { success: false, error: "INVALID_SCHEDULE_DAY" };
    }

    const db = getDb();

    db.prepare(
      `INSERT INTO backup_settings (id, default_folder, schedule_enabled, schedule_frequency, schedule_time, schedule_day_of_week, updated_at)
       VALUES (1, @defaultFolder, IFNULL(@scheduleEnabled, 0), @scheduleFrequency, @scheduleTime, @scheduleDayOfWeek, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         default_folder       = COALESCE(@defaultFolder, default_folder),
         schedule_enabled     = COALESCE(@scheduleEnabled, schedule_enabled),
         schedule_frequency   = COALESCE(@scheduleFrequency, schedule_frequency),
         schedule_time        = COALESCE(@scheduleTime, schedule_time),
         schedule_day_of_week = COALESCE(@scheduleDayOfWeek, schedule_day_of_week),
         updated_at           = datetime('now')`,
    ).run({
      defaultFolder: partial.defaultFolder ?? null,
      scheduleEnabled:
        partial.scheduleEnabled === undefined
          ? null
          : partial.scheduleEnabled
            ? 1
            : 0,
      scheduleFrequency: partial.scheduleFrequency ?? null,
      scheduleTime: partial.scheduleTime ?? null,
      scheduleDayOfWeek:
        partial.scheduleDayOfWeek === undefined
          ? null
          : partial.scheduleDayOfWeek,
    });

    return { success: true };
  } catch (err) {
    console.error("Failed to update backup settings:", err);
    return { success: false, error: "BACKUP_SETTINGS_UPDATE_FAILED" };
  }
}

/**
 * Records the outcome of a backup run (called after every manual or scheduled backup).
 */
export function recordBackupResult({ status, errorMessage }) {
  try {
    if (!RESTORE_STATUSES.includes(status)) {
      return { success: false, error: "INVALID_BACKUP_STATUS" };
    }

    const db = getDb();

    db.prepare(
      `INSERT INTO backup_settings (id, last_backup_at, last_backup_status, last_backup_error, updated_at)
       VALUES (1, datetime('now'), @status, @errorMessage, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         last_backup_at     = datetime('now'),
         last_backup_status = @status,
         last_backup_error  = @errorMessage,
         updated_at         = datetime('now')`,
    ).run({ status, errorMessage: errorMessage ?? null });

    return { success: true };
  } catch (err) {
    return { success: false, error: "BACKUP_RESULT_RECORD_FAILED" };
  }
}

/* ============================================================
   BACKUP EXECUTION (shared by the manual IPC handler and the scheduler —
   one place that actually kicks off a Postgres backup)
   ============================================================ */

/**
 * Runs pg_dump against the local Postgres instance, writing a fresh
 * snapshot into the configured (or explicitly passed) folder, and records
 * the outcome. No `mainDb` argument — Postgres backup connects
 * independently via its own saved config (dbConnectionConfig.js), unlike
 * SQLite's VACUUM INTO which needed the live connection object passed in
 * directly.
 */
export async function runBackupNow({ targetFolder } = {}) {
  try {
    const settingsResult = getBackupSettings();
    const folder = targetFolder || settingsResult.data?.default_folder || null;

    if (!folder) {
      recordBackupResult({
        status: "failed",
        errorMessage: "NO_BACKUP_FOLDER_CONFIGURED",
      });
      return { success: false, error: "NO_BACKUP_FOLDER_CONFIGURED" };
    }

    const fs = require("fs");

    if (!fs.existsSync(folder)) {
      recordBackupResult({
        status: "failed",
        errorMessage: "BACKUP_FOLDER_NOT_FOUND",
      });
      return { success: false, error: "BACKUP_FOLDER_NOT_FOUND" };
    }

    const result = await pgDumpBackup({ targetFolder: folder });

    if (!result.success) {
      recordBackupResult({ status: "failed", errorMessage: result.error });
      return { success: false, error: result.error };
    }

    recordBackupResult({ status: "success" });
    return {
      success: true,
      filePath: result.filePath,
      fileName: result.fileName,
    };
  } catch (err) {
    recordBackupResult({
      status: "failed",
      errorMessage: err.message || String(err),
    });
    return { success: false, error: err.message || String(err) };
  }
}

/* ============================================================
   RESTORE AUDIT
   ============================================================ */

/**
 * Appends one row to restore_audit. Called for both successful and failed
 * restore attempts once auth has been checked (or has failed).
 */
export function writeRestoreAudit({
  administratorUsername,
  authMethod,
  backupFileName,
  backupFileMtime,
  device,
  status,
  errorMessage,
}) {
  try {
    if (!RESTORE_AUTH_METHODS.includes(authMethod)) {
      return { success: false, error: "INVALID_AUTH_METHOD" };
    }
    if (!RESTORE_STATUSES.includes(status)) {
      return { success: false, error: "INVALID_RESTORE_STATUS" };
    }

    const db = getDb();

    db.prepare(
      `INSERT INTO restore_audit
        (administrator_username, auth_method, backup_file_name, backup_file_mtime, device, status, error_message)
       VALUES (@administratorUsername, @authMethod, @backupFileName, @backupFileMtime, @device, @status, @errorMessage)`,
    ).run({
      administratorUsername,
      authMethod,
      backupFileName,
      backupFileMtime: backupFileMtime ?? null,
      device: device ?? null,
      status,
      errorMessage: errorMessage ?? null,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: "RESTORE_AUDIT_WRITE_FAILED" };
  }
}

export function listRestoreAudit({ limit = 50 } = {}) {
  try {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM restore_audit ORDER BY performed_at DESC LIMIT ?`)
      .all(limit);

    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: "RESTORE_AUDIT_READ_FAILED" };
  }
}
