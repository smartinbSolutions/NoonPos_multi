// packages/app/src/backend/auth.ipc.js
import { ipcMain } from "electron";
import os from "os";
import { query, getClient } from "../dbConnect.js";
import {
  generateRecoveryKey,
  hashPin,
  hashSecret,
  isPinTaken,
  verifyPin,
} from "../utils/authCrypto";

const validPin = (pin) => /^\d{6}$/.test(pin || "");

async function activeAdmin(id) {
  const { rows } = await query(
    "SELECT * FROM users WHERE id = $1 AND role = 'admin' AND is_active = true",
    [id],
  );
  return rows[0];
}

async function auditPinReset(client, administratorId, targetUserId, resetType) {
  await client.query(
    `INSERT INTO pin_reset_audit
      (administrator_id, target_user_id, device, reset_type)
     VALUES ($1, $2, $3, $4)`,
    [administratorId, targetUserId, os.hostname(), resetType],
  );
}

export default function registerAuthHandlersIPC() {
  ipcMain.handle("auth:login", async (event, { pin }) => {
    try {
      const { rows: users } = await query(
        "SELECT * FROM users WHERE is_active = true",
      );
      const match = users.find((u) => verifyPin(pin, u.pin_hash));
      if (!match) return { success: false, error: "INVALID_PIN" };
      return {
        success: true,
        user: {
          id: match.id,
          username: match.username,
          role: match.role,
          full_name: match.full_name,
        },
      };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:get-users", async () => {
    try {
      const { rows: users } = await query(
        "SELECT id, username, role, full_name, is_active, created_at FROM users ORDER BY created_at ASC",
      );
      return { success: true, users };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:create-user", async (event, data) => {
    try {
      if (!/^\d{6}$/.test(data.pin || ""))
        return { success: false, error: "PIN_INVALID_LENGTH" };

      const { rows: existingUsername } = await query(
        "SELECT id FROM users WHERE username = $1",
        [data.username],
      );
      if (existingUsername[0])
        return { success: false, error: "USERNAME_TAKEN" };

      if (await isPinTaken(query, data.pin))
        return { success: false, error: "PIN_ALREADY_IN_USE" };

      const { rows } = await query(
        `INSERT INTO users (username, pin_hash, role, full_name, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [data.username, hashPin(data.pin), data.role, data.full_name || null],
      );
      return { success: true, id: rows[0].id };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:update-user", async (event, data) => {
    try {
      const { rows: currentRows } = await query(
        "SELECT * FROM users WHERE id = $1",
        [data.id],
      );
      const current = currentRows[0];
      if (!current) return { success: false, error: "USER_NOT_FOUND" };

      if (data.pin) return { success: false, error: "USE_RESET_PIN_FLOW" };
      if (data.username) {
        const { rows: existing } = await query(
          "SELECT id FROM users WHERE username = $1 AND id != $2",
          [data.username, data.id],
        );
        if (existing[0]) return { success: false, error: "USERNAME_TAKEN" };
      }

      // Guard: can't deactivate the last active admin
      const nextRole = data.role ?? current.role;
      const nextIsActive = data.is_active ?? current.is_active;
      const wasActiveAdmin = current.role === "admin" && current.is_active;
      const willBeActiveAdmin = nextRole === "admin" && nextIsActive;

      if (wasActiveAdmin && !willBeActiveAdmin) {
        const { rows: countRows } = await query(
          "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = true AND id != $1",
          [data.id],
        );
        if (Number(countRows[0].count) === 0) {
          return { success: false, error: "LAST_ADMIN_MUST_REMAIN" };
        }
      }

      await query(
        `UPDATE users SET
           username = COALESCE($1, username),
           full_name = COALESCE($2, full_name),
           role = COALESCE($3, role),
           is_active = COALESCE($4, is_active)
         WHERE id = $5`,
        [
          data.username ?? null,
          data.full_name ?? null,
          data.role ?? null,
          data.is_active ?? null,
          data.id,
        ],
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:reset-user-pin", async (event, data) => {
    try {
      const admin = await activeAdmin(data.administratorId);
      const { rows: targetRows } = await query(
        "SELECT * FROM users WHERE id = $1",
        [data.userId],
      );
      const target = targetRows[0];

      if (
        !admin ||
        !target ||
        !verifyPin(data.administratorPin, admin.pin_hash)
      )
        return { success: false, error: "ADMIN_AUTH_FAILED" };
      if (!validPin(data.newPin))
        return { success: false, error: "PIN_INVALID_LENGTH" };
      if (await isPinTaken(query, data.newPin, target.id))
        return { success: false, error: "PIN_ALREADY_IN_USE" };

      const client = await getClient();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE users SET pin_hash = $1 WHERE id = $2", [
          hashPin(data.newPin),
          target.id,
        ]);
        await auditPinReset(client, admin.id, target.id, "admin_reset");
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:recover-admin-pin", async (event, data) => {
    // Deliberately generic on every failure branch — a specific reason here
    // (wrong username vs wrong recovery key) would let an attacker enumerate
    // valid admin usernames. This is intentional, not an oversight.
    try {
      const { rows: adminRows } = await query(
        "SELECT * FROM users WHERE username = $1 AND role = 'admin' AND is_active = true",
        [data.username],
      );
      const admin = adminRows[0];

      const { rows: settingRows } = await query(
        "SELECT recovery_key_hash FROM security_settings WHERE id = 1",
      );
      const setting = settingRows[0];

      if (
        !admin ||
        !setting ||
        !verifyPin(data.recoveryKey, setting.recovery_key_hash)
      )
        return { success: false, error: "RECOVERY_FAILED" };
      if (
        !validPin(data.newPin) ||
        (await isPinTaken(query, data.newPin, admin.id))
      )
        return { success: false, error: "RECOVERY_FAILED" };

      const client = await getClient();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE users SET pin_hash = $1 WHERE id = $2", [
          hashPin(data.newPin),
          admin.id,
        ]);
        await auditPinReset(client, admin.id, admin.id, "recovery_key");
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      return { success: true };
    } catch (_err) {
      return { success: false, error: "RECOVERY_FAILED" };
    }
  });

  ipcMain.handle("auth:regenerate-recovery-key", async (event, data) => {
    try {
      const admin = await activeAdmin(data.administratorId);
      if (!admin || !verifyPin(data.administratorPin, admin.pin_hash))
        return { success: false, error: "ADMIN_AUTH_FAILED" };

      const recoveryKey = generateRecoveryKey();
      await query(
        `INSERT INTO security_settings (id, recovery_key_hash, updated_at)
         VALUES (1, $1, now())
         ON CONFLICT (id) DO UPDATE SET
           recovery_key_hash = EXCLUDED.recovery_key_hash,
           updated_at = now()`,
        [hashSecret(recoveryKey)],
      );
      return { success: true, recoveryKey };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:get-pin-reset-audit", async () => {
    try {
      const { rows: records } = await query(
        `SELECT a.id, a.performed_at, a.device, a.reset_type,
          administrator.username AS administrator,
          target.username AS target_user
         FROM pin_reset_audit a
         JOIN users administrator ON administrator.id = a.administrator_id
         JOIN users target ON target.id = a.target_user_id
         ORDER BY a.performed_at DESC`,
      );
      return { success: true, records };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:delete-user", async (event, id) => {
    try {
      const { rows: userRows } = await query(
        "SELECT * FROM users WHERE id = $1",
        [id],
      );
      const user = userRows[0];
      if (!user) return { success: false, error: "USER_NOT_FOUND" };

      if (user.is_active) {
        return { success: false, error: "DEACTIVATE_BEFORE_DELETE" };
      }

      if (user.role === "admin") {
        const { rows: countRows } = await query(
          "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND id != $1",
          [id],
        );
        if (Number(countRows[0].count) === 0) {
          return { success: false, error: "LAST_ADMIN_MUST_REMAIN" };
        }
      }

      await query("DELETE FROM users WHERE id = $1", [id]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });
}
