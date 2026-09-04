// packages/app/src/backend/printer_settings.ipc.js
import { ipcMain, BrowserWindow } from "electron";
import os from "node:os";
import { query } from "../dbConnect.js";
import getDeviceHash from "../../main/license/getDeviceHash";

async function assertIsAdmin(administratorId) {
  const { rows } = await query(
    "SELECT id FROM users WHERE id = $1 AND role = 'admin' AND is_active = true",
    [administratorId],
  );
  return Boolean(rows[0]);
}

export default function registerPrinterSettingsIPC() {
  // LIST WINDOWS PRINTER QUEUES
  // Uses a throwaway hidden window's webContents.getPrintersAsync(), same
  // mechanism already used in receiptPrinter.js's printReceiptHtml(), since
  // that's the only surface Electron exposes this through.
  ipcMain.handle("list-printers", async () => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });

    try {
      await win.loadURL("data:text/html,<html></html>");
      const printers = await win.webContents.getPrintersAsync();
      return {
        success: true,
        data: printers.map((p) => ({
          name: p.name,
          displayName: p.displayName,
          isDefault: !!p.isDefault,
        })),
      };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      win.close();
    }
  });

  // GET ALL SAVED PRINTER SETTINGS — scoped to THIS terminal only.
  ipcMain.handle("get-printer-settings", async () => {
    try {
      const deviceId = await getDeviceHash();
      const { rows: data } = await query(
        `SELECT * FROM printer_settings
         WHERE device_id = $1
         ORDER BY is_default DESC, label, device_name`,
        [deviceId],
      );
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // SAVE (UPSERT) ONE PRINTER'S SETTINGS
  // Keyed on (device_id, device_name) — re-saving the same printer on the
  // same terminal updates its row instead of creating a duplicate. The
  // same printer name on a different terminal is a separate row entirely.
  ipcMain.handle("save-printer-settings", async (event, data) => {
    const deviceName = (data.device_name || "").trim();
    const paperSize = data.paper_size || "80mm";
    const backend = data.backend || "electron";
    const hasCutter = Boolean(data.has_cutter);
    const isDefault = Boolean(data.is_default);
    const label = (data.label || "").trim() || null;

    if (!deviceName) {
      return { success: false, error: "DEVICE_NAME_REQUIRED" };
    }
    if (!["58mm", "80mm", "a4"].includes(paperSize)) {
      return { success: false, error: "INVALID_PAPER_SIZE" };
    }
    if (!["electron", "raw_escpos"].includes(backend)) {
      return { success: false, error: "INVALID_BACKEND" };
    }

    const deviceId = await getDeviceHash();
    const terminalName = os.hostname();

    try {
      // Only one printer can be the default per terminal — clear any
      // existing default for THIS device_id before setting this one.
      // Scoped to device_id so saving a default on one terminal never
      // touches another terminal's default.
      if (isDefault) {
        await query(
          `UPDATE printer_settings SET is_default = false WHERE device_id = $1 AND is_default = true`,
          [deviceId],
        );
      }

      await query(
        `INSERT INTO printer_settings
          (device_id, terminal_name, device_name, label, paper_size, backend, has_cutter, is_default, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (device_id, device_name) DO UPDATE SET
           terminal_name = EXCLUDED.terminal_name,
           label = EXCLUDED.label,
           paper_size = EXCLUDED.paper_size,
           backend = EXCLUDED.backend,
           has_cutter = EXCLUDED.has_cutter,
           is_default = EXCLUDED.is_default,
           updated_at = now()`,
        [
          deviceId,
          terminalName,
          deviceName,
          label,
          paperSize,
          backend,
          hasCutter,
          isDefault,
        ],
      );

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // DELETE ONE PRINTER'S SETTINGS — scoped to THIS terminal, so a
  // terminal can never delete another terminal's printer row even if it
  // somehow got hold of its numeric id.
  ipcMain.handle("delete-printer-settings", async (event, id) => {
    try {
      const deviceId = await getDeviceHash();
      await query(
        `DELETE FROM printer_settings WHERE id = $1 AND device_id = $2`,
        [id, deviceId],
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // GET ALL PRINTER SETTINGS ACROSS EVERY TERMINAL — admin overview only.
  // Unscoped by device_id on purpose: shows every known terminal, including
  // ones with zero printers configured yet.
  ipcMain.handle(
    "get-all-printer-settings",
    async (event, { administratorId } = {}) => {
      const isAdmin = await assertIsAdmin(administratorId);
      if (!isAdmin) {
        return { success: false, error: "ADMIN_REQUIRED" };
      }

      try {
        const { rows: terminalRows } = await query(
          `SELECT device_id, terminal_name, last_seen_at::text AS last_seen_at
         FROM terminals
         ORDER BY terminal_name`,
        );

        const { rows: printerRows } = await query(
          `SELECT * FROM printer_settings
         ORDER BY is_default DESC, label, device_name`,
        );

        const printersByDevice = new Map();
        for (const printer of printerRows) {
          if (!printersByDevice.has(printer.device_id)) {
            printersByDevice.set(printer.device_id, []);
          }
          printersByDevice.get(printer.device_id).push(printer);
        }

        const data = terminalRows.map((terminal) => ({
          device_id: terminal.device_id,
          terminal_name: terminal.terminal_name,
          last_seen_at: terminal.last_seen_at,
          printers: printersByDevice.get(terminal.device_id) || [],
        }));

        return { success: true, data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  );
}
