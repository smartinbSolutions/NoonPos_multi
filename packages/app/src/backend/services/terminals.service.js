// packages/app/src/backend/services/terminals.service.js
import os from "node:os";
import getDeviceHash from "../../main/license/getDeviceHash";

/**
 * Upserts this machine's presence into the terminals table — called once
 * on every app startup, on every terminal (host and guests alike), so
 * terminal_name and last_seen_at stay current even if a machine gets
 * renamed. This is the source of truth for "which terminals exist,"
 * independent of whether any given terminal has configured a printer —
 * printer_settings.ipc.js's admin overview joins against this table
 * precisely so a terminal with zero printers still shows up.
 */
export async function registerThisTerminal(query) {
  const deviceId = await getDeviceHash();
  const terminalName = os.hostname();

  await query(
    `INSERT INTO terminals (device_id, terminal_name, last_seen_at)
     VALUES ($1, $2, now())
     ON CONFLICT (device_id) DO UPDATE SET
       terminal_name = EXCLUDED.terminal_name,
       last_seen_at = now()`,
    [deviceId, terminalName],
  );
}
