const { ipcMain } = require("electron");
import db from "../db";
import createPartyHistory from "../utils/createPaymentHistory";
import { buildOpeningBalanceNote } from "../utils/helpers";
export default function registerPartnersIPC() {
  // CREATE
  ipcMain.handle("create-partner", (event, data) => {
    if (!data.name) {
      return { success: false, error: "ERROR ENTER DATA" };
    }
    try {
      const result = db
        .prepare(
          `
        INSERT INTO partners (name, phone, address)
        VALUES (?,?,?)
      `
        )
        .run(data.name, data.phone, data.address);

      const openingBalance = Number(data.opening_balance || 0);
      if (openingBalance !== 0) {
        const openingBalanceDate = data.date
          ? `${data.date.slice(0, 10)} 00:00:00`
          : `${new Date().getFullYear()}-01-01 00:00:00`;

        createPartyHistory(db, {
          party_type: "partner",
          party_id: result.lastInsertRowid,
          invoice_id: null,
          invoice_type: "opening_balance",
          record_type: "opening_balance",
          movement_type: data.balance_type,
          amount: openingBalance,
          note: buildOpeningBalanceNote(db),
          date: openingBalanceDate,
        });
      }
      return {
        success: true,
        id: result.lastInsertRowid,
      };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-partners", (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const partners = db
      .prepare(
        `
      SELECT
        p.*,
  
        COALESCE(
          SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END),
          0
        ) AS total_deposit,
  
        COALESCE(
          SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END),
          0
        ) AS total_withdrawal,
  
        COALESCE(
          SUM(
            CASE
              WHEN ph.movement_type = 'increase' THEN ph.amount
              WHEN ph.movement_type = 'decrease' THEN -ph.amount
              ELSE 0
            END
          ),
          0
        ) AS balance
  
      FROM partners p
      LEFT JOIN party_history ph
        ON ph.party_type = 'partner'
       AND ph.party_id = p.id
  
      GROUP BY p.id
      ORDER BY p.name
  
      LIMIT ? OFFSET ?
      `
      )
      .all(limit, offset);

    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM partners`)
      .get();

    return {
      data: partners,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  // FIXED: movement_type values corrected from 'deposit'/'withdrawal'
  // (never actually stored — schema only allows 'increase'/'decrease')
  // to match get-partners and the real CHECK constraint.
  ipcMain.handle("get-partner", (event, id) => {
    const partner = db
      .prepare(
        `
      SELECT
        p.*,

        COALESCE(
          SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END),
          0
        ) AS total_deposit,

        COALESCE(
          SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END),
          0
        ) AS total_withdrawal,

        COALESCE(
          SUM(
            CASE
              WHEN ph.movement_type = 'increase' THEN ph.amount
              WHEN ph.movement_type = 'decrease' THEN -ph.amount
              ELSE 0
            END
          ),
          0
        ) AS balance

      FROM partners p
      LEFT JOIN party_history ph
        ON ph.party_type = 'partner'
       AND ph.party_id = p.id

      WHERE p.id = ?

      GROUP BY p.id
      `
      )
      .get(id);

    return partner || null;
  });

  ipcMain.handle("update-partner", (event, data) => {
    if (!data.name) {
      return { success: false, error: "ERROR ENTER DATA" };
    }
    try {
      db.prepare(
        `
        UPDATE partners
        SET name = ?, phone = ?, address = ?
        WHERE id = ?
      `
      ).run(data.name, data.phone, data.address, data.id);

      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("delete-partner", (event, id) => {
    try {
      const { count } = db
        .prepare(
          `
        SELECT COUNT(*) AS count FROM party_history
        WHERE party_type = 'partner' AND party_id = ?
      `
        )
        .get(id);

      if (count > 0) {
        return { success: false, error: "PARTNER_HAS_HISTORY" };
      }

      db.prepare(
        `
        DELETE FROM partners WHERE id = ?
      `
      ).run(id);

      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
