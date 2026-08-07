import { ipcMain } from "electron";
import os from "os";
import db from "../db";
import {
  generateRecoveryKey,
  hashPin,
  hashSecret,
  isPinTaken,
  verifyPin,
} from "../utils/authCrypto";

const validPin = (pin) => /^\d{6}$/.test(pin || "");

function activeAdmin(id) {
  return db
    .prepare(
      "SELECT * FROM users WHERE id = ? AND role = 'admin' AND is_active = 1"
    )
    .get(id);
}

function auditPinReset(administratorId, targetUserId, resetType) {
  db.prepare(
    `INSERT INTO pin_reset_audit
      (administrator_id, target_user_id, device, reset_type)
     VALUES (?, ?, ?, ?)`
  ).run(administratorId, targetUserId, os.hostname(), resetType);
}

export default function registerAuthHandlersIPC() {
  ipcMain.handle("auth:login", (event, { pin }) => {
    try {
      const users = db.prepare("SELECT * FROM users WHERE is_active = 1").all();
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

  ipcMain.handle("auth:get-users", () => {
    try {
      const users = db
        .prepare(
          "SELECT id, username, role, full_name, is_active, created_at FROM users ORDER BY created_at ASC"
        )
        .all();
      return { success: true, users };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:create-user", (event, data) => {
    try {
      if (!/^\d{6}$/.test(data.pin || ""))
        return { success: false, error: "PIN_INVALID_LENGTH" };
      if (
        db.prepare("SELECT id FROM users WHERE username = ?").get(data.username)
      )
        return { success: false, error: "USERNAME_TAKEN" };
      if (isPinTaken(db, data.pin))
        return { success: false, error: "PIN_ALREADY_IN_USE" };

      const result = db
        .prepare(
          `INSERT INTO users (username, pin_hash, role, full_name, is_active) VALUES (?, ?, ?, ?, 1)`
        )
        .run(
          data.username,
          hashPin(data.pin),
          data.role,
          data.full_name || null
        );
      return { success: true, id: result.lastInsertRowid };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:update-user", (event, data) => {
    try {
      const current = db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(data.id);
      if (!current) return { success: false, error: "USER_NOT_FOUND" };

      if (data.pin) return { success: false, error: "USE_RESET_PIN_FLOW" };
      if (data.username) {
        const existing = db
          .prepare("SELECT id FROM users WHERE username = ? AND id != ?")
          .get(data.username, data.id);
        if (existing) return { success: false, error: "USERNAME_TAKEN" };
      }

      // Guard: can't deactivate the last active admin
      const nextRole = data.role ?? current.role;
      const nextIsActive = data.is_active ?? current.is_active;
      const wasActiveAdmin = current.role === "admin" && current.is_active;
      const willBeActiveAdmin = nextRole === "admin" && nextIsActive;

      if (wasActiveAdmin && !willBeActiveAdmin) {
        const otherActiveAdmins = db
          .prepare(
            "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?"
          )
          .get(data.id).count;
        if (otherActiveAdmins === 0) {
          return {
            success: false,
            error: "LAST_ADMIN_MUST_REMAIN",
          };
        }
      }

      db.prepare(
        `
        UPDATE users SET
          username = COALESCE(?, username),
          full_name = COALESCE(?, full_name),
          role = COALESCE(?, role),
          is_active = COALESCE(?, is_active),
          pin_hash = COALESCE(?, pin_hash)
        WHERE id = ?
      `
      ).run(
        data.username ?? null,
        data.full_name ?? null,
        data.role ?? null,
        data.is_active ?? null,
        null,
        data.id
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:reset-user-pin", (event, data) => {
    try {
      const admin = activeAdmin(data.administratorId);
      const target = db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(data.userId);
      if (
        !admin ||
        !target ||
        !verifyPin(data.administratorPin, admin.pin_hash)
      )
        return { success: false, error: "ADMIN_AUTH_FAILED" };
      if (!validPin(data.newPin))
        return { success: false, error: "PIN_INVALID_LENGTH" };
      if (isPinTaken(db, data.newPin, target.id))
        return { success: false, error: "PIN_ALREADY_IN_USE" };

      db.transaction(() => {
        db.prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(
          hashPin(data.newPin),
          target.id
        );
        auditPinReset(admin.id, target.id, "admin_reset");
      })();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:recover-admin-pin", (event, data) => {
    // Deliberately generic on every failure branch — a specific reason here
    // (wrong username vs wrong recovery key) would let an attacker enumerate
    // valid admin usernames. This is intentional, not an oversight.
    try {
      const admin = db
        .prepare(
          "SELECT * FROM users WHERE username = ? AND role = 'admin' AND is_active = 1"
        )
        .get(data.username);
      const setting = db
        .prepare("SELECT recovery_key_hash FROM security_settings WHERE id = 1")
        .get();
      if (
        !admin ||
        !setting ||
        !verifyPin(data.recoveryKey, setting.recovery_key_hash)
      )
        return { success: false, error: "RECOVERY_FAILED" };
      if (!validPin(data.newPin) || isPinTaken(db, data.newPin, admin.id))
        return { success: false, error: "RECOVERY_FAILED" };

      db.transaction(() => {
        db.prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(
          hashPin(data.newPin),
          admin.id
        );
        auditPinReset(admin.id, admin.id, "recovery_key");
      })();
      return { success: true };
    } catch (_err) {
      return { success: false, error: "RECOVERY_FAILED" };
    }
  });

  ipcMain.handle("auth:regenerate-recovery-key", (event, data) => {
    try {
      const admin = activeAdmin(data.administratorId);
      if (!admin || !verifyPin(data.administratorPin, admin.pin_hash))
        return { success: false, error: "ADMIN_AUTH_FAILED" };
      const recoveryKey = generateRecoveryKey();
      db.prepare(
        `INSERT INTO security_settings (id, recovery_key_hash, updated_at)
         VALUES (1, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET recovery_key_hash = excluded.recovery_key_hash,
           updated_at = datetime('now')`
      ).run(hashSecret(recoveryKey));
      return { success: true, recoveryKey };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:get-pin-reset-audit", () => {
    try {
      const records = db
        .prepare(
          `SELECT a.id, a.performed_at, a.device, a.reset_type,
          administrator.username AS administrator,
          target.username AS target_user
         FROM pin_reset_audit a
         JOIN users administrator ON administrator.id = a.administrator_id
         JOIN users target ON target.id = a.target_user_id
         ORDER BY a.performed_at DESC`
        )
        .all();
      return { success: true, records };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("auth:delete-user", (event, id) => {
    try {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      if (!user) return { success: false, error: "USER_NOT_FOUND" };

      if (user.is_active) {
        return {
          success: false,
          error: "DEACTIVATE_BEFORE_DELETE",
        };
      }

      if (user.role === "admin") {
        const otherAdmins = db
          .prepare(
            "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND id != ?"
          )
          .get(id).count;
        if (otherAdmins === 0) {
          return {
            success: false,
            error: "LAST_ADMIN_MUST_REMAIN",
          };
        }
      }

      db.prepare("DELETE FROM users WHERE id = ?").run(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });
}
