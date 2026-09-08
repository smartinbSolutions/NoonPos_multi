import { ipcMain, dialog, app } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import { query } from "../dbConnect.js";
import { verifyPin } from "../utils/authCrypto";
import {
  loadDbConfig,
  isDbHostMachine,
} from "../../main/db/dbConnectionConfig.js";
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

  // CREATE A BACKUP NOW — available from any terminal (pg_dump only
  // needs read access, which app_user already has). Admin-gated: PIN +
  // recovery key both required, same as restore, since a backup file is
  // a full copy of every customer, sale, and price in the business.
  ipcMain.handle("backup-create", async (event, data = {}) => {
    const { targetFolder, administratorId, administratorPin, recoveryKey } =
      data;

    const admin = await activeAdmin(administratorId);
    const { rows: settingRows } = await query(
      "SELECT recovery_key_hash FROM security_settings WHERE id = 1",
    );
    const setting = settingRows[0];

    if (
      !admin ||
      !verifyPin(administratorPin, admin.pin_hash) ||
      !setting ||
      !verifyPin(recoveryKey, setting.recovery_key_hash)
    ) {
      return { success: false, error: "BACKUP_AUTH_FAILED" };
    }

    return runBackupNow({ targetFolder });
  });

  // RESTORE FROM A BACKUP FILE — HOST-ONLY, structurally: pg_restore's
  // --clean rebuild needs the Postgres superuser's credentials (schema
  // ownership rights app_user was deliberately never granted), and those
  // credentials only ever exist in pg-admin.json on the host machine —
  // never distributed to guest terminals. Also gated by admin PIN +
  // recovery key, same as before.
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

    if (!isDbHostMachine()) {
      return fail("RESTORE_ONLY_AVAILABLE_ON_HOST");
    }

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

  // UPLOAD A FRESH SNAPSHOT TO CLOUD BACKUP — available from any
  // terminal, same reasoning as backup-create: pg_dump only needs read
  // access. Admin-gated the same way.
  ipcMain.handle("backup-cloud-upload", async (event, data = {}) => {
    const { administratorId, administratorPin, recoveryKey } = data;

    const admin = await activeAdmin(administratorId);
    const { rows: settingRows } = await query(
      "SELECT recovery_key_hash FROM security_settings WHERE id = 1",
    );
    const setting = settingRows[0];

    if (
      !admin ||
      !verifyPin(administratorPin, admin.pin_hash) ||
      !setting ||
      !verifyPin(recoveryKey, setting.recovery_key_hash)
    ) {
      return { success: false, error: "BACKUP_AUTH_FAILED" };
    }

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
