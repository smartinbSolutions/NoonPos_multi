const { ipcMain } = require("electron");
import db from "../db";
import createPartyHistory from "../utils/createPaymentHistory";
import { buildOpeningBalanceNote } from "../utils/helpers"; // TODO: confirm actual path

export default function registerSuppliersIPC() {
  // CREATE
  ipcMain.handle("create-supplier", (event, data) => {
    const name = (data.name || "").trim();
    const phone = (data.phone || "").trim();
    const address = (data.address || "").trim();

    if (!name) {
      return { success: false, error: "ERROR ENTER DATA" }; // TODO: no generic error-string builder exists yet — see note below
    }

    const createTx = db.transaction(() => {
      const result = db
        .prepare(
          `
        INSERT INTO suppliers (name, phone, address)
        VALUES (?,?,?)
      `
        )
        .run(name, phone, address);

      const openingBalance = Number(data.opening_balance || 0);
      if (openingBalance !== 0) {
        const openingBalanceDate = data.date
          ? `${data.date.slice(0, 10)} 00:00:00`
          : `${new Date().getFullYear()}-01-01 00:00:00`;

        createPartyHistory(db, {
          party_type: "supplier",
          party_id: result.lastInsertRowid,
          invoice_id: null,
          invoice_type: "opening_balance",
          record_type: "opening_balance",
          movement_type: "increase",
          amount: openingBalance,
          note: buildOpeningBalanceNote(db),
          date: openingBalanceDate,
        });
      }

      return result.lastInsertRowid;
    });

    try {
      const id = createTx();
      return { success: true, id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-suppliers", (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    // Fixed enum only — never interpolate raw user input into HAVING.
    const balanceFilter = ["owing", "settled"].includes(params.balance_filter)
      ? params.balance_filter
      : "all";
    const havingClause =
      balanceFilter === "owing"
        ? "HAVING balance > 0"
        : balanceFilter === "settled"
          ? "HAVING balance <= 0"
          : "";

    // Balance must be computed here (not just selected) so HAVING can filter on it.
    const perSupplierCTE = `
      SELECT
        s.id,
        s.name,
        s.phone,
        s.address,
        s.createdAt,
        COALESCE(SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END), 0) AS total,
        COALESCE(SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END), 0) AS balance
      FROM suppliers s
      LEFT JOIN party_history ph
        ON ph.party_type = 'supplier'
       AND ph.party_id = s.id
      GROUP BY s.id
      ${havingClause}
    `;

    try {
      const suppliers = db
        .prepare(
          `
        SELECT * FROM (${perSupplierCTE})
        ORDER BY createdAt DESC, id DESC
        LIMIT ? OFFSET ?
        `
        )
        .all(limit, offset);

      const { total } = db
        .prepare(`SELECT COUNT(*) AS total FROM (${perSupplierCTE})`)
        .get();

      // Cross-page aggregates for the currently applied filter — not just this page.
      const stats = db
        .prepare(
          `
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(total), 0) AS totalPayable,
          COALESCE(SUM(total_paid), 0) AS totalPaid,
          COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS netOutstanding
        FROM (${perSupplierCTE})
        `
        )
        .get();

      // Counts per filter bucket, independent of which filter is currently applied,
      // so the chip labels ("Owing (12)") are always accurate regardless of selection.
      const unfilteredCTE = perSupplierCTE.replace(havingClause, "");
      const counts = db
        .prepare(
          `
        SELECT
          COUNT(*) AS all_count,
          SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END) AS owing_count,
          SUM(CASE WHEN balance <= 0 THEN 1 ELSE 0 END) AS settled_count
        FROM (${unfilteredCTE})
        `
        )
        .get();

      return {
        success: true,
        data: suppliers,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        stats,
        counts: {
          all: counts.all_count || 0,
          owing: counts.owing_count || 0,
          settled: counts.settled_count || 0,
        },
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-supplier", (event, id) => {
    try {
      const supplier = db
        .prepare(
          `
      SELECT
        s.*,

        COALESCE(
          SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END),
          0
        ) AS total,

        COALESCE(
          SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END),
          0
        ) AS total_paid,

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

      FROM suppliers s

      LEFT JOIN party_history ph
        ON ph.party_type = 'supplier'
       AND ph.party_id = s.id

      WHERE s.id = ?

      GROUP BY s.id;
      `
        )
        .get(id);

      return { success: true, data: supplier };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("update-supplier", (event, data) => {
    const name = (data.name || "").trim();
    const phone = (data.phone || "").trim();
    const address = (data.address || "").trim();

    if (!name) {
      return { success: false, error: "ERROR ENTER DATA" }; // TODO: no generic error-string builder exists yet — see note below
    }

    try {
      db.prepare(
        `
        UPDATE suppliers
        SET name = ?, phone = ?, address = ?
        WHERE id = ?
      `
      ).run(name, phone, address, data.id);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("delete-supplier", (event, id) => {
    try {
      const partyHistory = db
        .prepare(
          `
        SELECT id
        FROM party_history
        WHERE party_type = 'supplier'
          AND party_id = ?
        LIMIT 1
      `
        )
        .get(id);

      if (partyHistory) {
        return {
          success: false,
          error: "Cannot delete supplier because it has transactions.", // TODO: no generic error-string builder exists yet — see note below
        };
      }

      db.prepare(
        `
        DELETE FROM suppliers WHERE id = ?
      `
      ).run(id);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
