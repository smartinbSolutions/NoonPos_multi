import { ipcMain, dialog, app } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import { query } from "../dbConnect.js";
import { verifyPin } from "../utils/authCrypto";
import { loadDbConfig } from "../../main/db/dbConnectionConfig.js";
import {
  getBackupSettings,
  updateBackupSettings,
  writeRestoreAudit,
  runBackupNow,
} from "../../main/backup/backupMeta.service.js";
import {
  pgRestoreBackup,
  terminateOtherConnections,
} from "../../main/backup/pgBackup.service";
import {
  downloadCloudBackup,
  listCloudBackups,
  uploadCloudBackup,
} from "../../main/backup/cloudBackup.service";

/* ============================================================
   INTERNAL HELPERS
   ============================================================ */

async function activeAdmin(id) {
  const { rows } = await query(
    "SELECT * FROM users WHERE id = $1 AND role = 'admin' AND is_active = true",
    [id],
  );
  return rows[0];
}

// No manual "is this a real NoonPos backup" check needed here like the
// SQLite version had — pg_restore validates the dump's own internal
// format on load. A corrupt or wrong file fails loudly with a clear
// pg_restore error rather than silently succeeding against garbage.

/* ============================================================
   IPC HANDLERS
   ============================================================ */

export default function registerBackupIPC() {
  // GET BACKUP SETTINGS (default folder, schedule, last run status)
  ipcMain.handle("backup-get-settings", () => {
    return getBackupSettings();
  });

  // UPDATE BACKUP SETTINGS (default folder / schedule config)
  ipcMain.handle("backup-update-settings", (event, data) => {
    return updateBackupSettings(data);
  });

  // LET USER PICK THE DEFAULT BACKUP FOLDER
  ipcMain.handle("backup-choose-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: "FOLDER_SELECTION_CANCELLED" };
    }
    return { success: true, folder: result.filePaths[0] };
  });

  // BROWSE FOR A SPECIFIC BACKUP FILE TO RESTORE, OUTSIDE THE DEFAULT
  // FOLDER — the escape hatch for a moved drive, USB backup, or a fresh
  // install with no folder configured yet. backup-list above stays the
  // primary path; this is secondary/advanced.
  ipcMain.handle("backup-choose-restore-file", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "NoonPos Backup", extensions: ["dump"] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: "FILE_SELECTION_CANCELLED" };
    }
    return { success: true, filePath: result.filePaths[0] };
  });

  // LIST AVAILABLE BACKUPS IN THE CONFIGURED DEFAULT FOLDER
  // Restore picks from this list rather than a separate file-browse dialog,
  // since the folder is already the single source of truth set in settings.
  ipcMain.handle("backup-list", () => {
    try {
      const settingsResult = getBackupSettings();
      const folder = settingsResult.data?.default_folder || null;
      if (!folder) {
        return { success: false, error: "NO_BACKUP_FOLDER_CONFIGURED" };
      }
      if (!fs.existsSync(folder)) {
        return { success: false, error: "BACKUP_FOLDER_NOT_FOUND" };
      }
      const files = fs
        .readdirSync(folder)
        .filter((name) => name.endsWith(".dump"))
        .map((name) => {
          const fullPath = path.join(folder, name);
          const stats = fs.statSync(fullPath);
          return {
            fileName: name,
            filePath: fullPath,
            size: stats.size,
            mtime: stats.mtime.toISOString(),
          };
        })
        .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
      return { success: true, data: files };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // CREATE A BACKUP NOW — thin wrapper; the actual pg_dump logic lives in
  // runBackupNow() so the scheduler can call the exact same path without
  // going through an IPC round-trip to itself. Available from any
  // terminal — pg_dump connects to the host over the network.
  ipcMain.handle("backup-create", async (event, { targetFolder } = {}) => {
    return runBackupNow({ targetFolder });
  });

  // RESTORE FROM A BACKUP FILE — strict gate: active admin's own PIN AND
  // the recovery key, both required (mirrors auth:recover-admin-pin's
  // verification calls, but neither alone is sufficient here since restore
  // is more destructive than a PIN reset). Available from any terminal —
  // pg_restore connects to the host over the network the same way any
  // other query does; the admin PIN + recovery key check below is the
  // real authorization boundary here, not which physical machine this
  // runs from.
  ipcMain.handle("backup-restore", async (event, data) => {
    const device = os.hostname();
    const backupFileName = path.basename(data.backupFilePath || "");

    const fail = async (error) => {
      writeRestoreAudit({
        administratorUsername: data.administratorUsername || "unknown",
        authMethod: "pin_and_recovery_key",
        backupFileName: backupFileName || "unknown",
        device,
        status: "failed",
        errorMessage: error,
      });
      return { success: false, error };
    };

    try {
      if (!data.backupFilePath) return await fail("BACKUP_FILE_REQUIRED");

      const admin = await activeAdmin(data.administratorId);
      const { rows: settingRows } = await query(
        "SELECT recovery_key_hash FROM security_settings WHERE id = 1",
      );
      const setting = settingRows[0];

      if (
        !admin ||
        !verifyPin(data.administratorPin, admin.pin_hash) ||
        !setting ||
        !verifyPin(data.recoveryKey, setting.recovery_key_hash)
      ) {
        return await fail("RESTORE_AUTH_FAILED");
      }

      if (!fs.existsSync(data.backupFilePath)) {
        return await fail("BACKUP_FILE_NOT_FOUND");
      }

      const stats = fs.statSync(data.backupFilePath);
      const config = loadDbConfig();

      // Kick every other terminal off the database before pg_restore
      // --clean starts dropping/recreating objects — restore cannot
      // safely run against a database with other sessions holding locks.
      await terminateOtherConnections(query, config.database);

      const restoreResult = await pgRestoreBackup({
        backupFilePath: data.backupFilePath,
      });

      if (!restoreResult.success) {
        return await fail(restoreResult.error);
      }

      writeRestoreAudit({
        administratorUsername: admin.username,
        authMethod: "pin_and_recovery_key",
        backupFileName,
        backupFileMtime: stats.mtime.toISOString(),
        device,
        status: "success",
      });

      // This terminal's own app process still holds pooled connections
      // whose underlying sessions were just terminated/invalidated by the
      // restore — relaunch so every module reconnects fresh. Every other
      // terminal on the network also needs to reconnect, but that's a
      // separate notification concern outside this handler's scope.
      app.relaunch();
      app.exit(0);

      return { success: true };
    } catch (err) {
      return await fail(err.message || String(err));
    }
  });

  // UPLOAD A FRESH SNAPSHOT TO CLOUD BACKUP — entitlement, device
  // activation, and the one-per-day cap are all enforced inside
  // uploadCloudBackup() itself; this handler just calls the service and
  // passes the result through.
  ipcMain.handle("backup-cloud-upload", () => {
    return uploadCloudBackup();
  });

  // LIST CLOUD BACKUPS FOR THIS DEVICE
  ipcMain.handle("backup-cloud-list", () => {
    return listCloudBackups();
  });

  ipcMain.handle("backup-cloud-download", (event, backupId) => {
    return downloadCloudBackup(backupId);
  });
}
