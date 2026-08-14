// packages/app/src/backend/suppliers.ipc.js
import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";
import createPartyHistory from "../utils/createPaymentHistory";
import { buildOpeningBalanceNote } from "../utils/helpers.js";

export default function registerSuppliersIPC() {
  // CREATE
  ipcMain.handle("create-supplier", async (event, data) => {
    const name = (data.name || "").trim();
    const phone = (data.phone || "").trim();
    const address = (data.address || "").trim();

    if (!name) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO suppliers (name, phone, address)
         VALUES ($1,$2,$3)
         RETURNING id`,
        [name, phone, address],
      );
      const supplierId = result.rows[0].id;

      const openingBalance = Number(data.opening_balance || 0);
      if (openingBalance !== 0) {
        const openingBalanceDate = data.date
          ? `${data.date.slice(0, 10)} 00:00:00`
          : `${new Date().getFullYear()}-01-01 00:00:00`;

        const note = await buildOpeningBalanceNote(client.query.bind(client));
        await createPartyHistory(client.query.bind(client), {
          party_type: "supplier",
          party_id: supplierId,
          invoice_id: null,
          invoice_type: "opening_balance",
          record_type: "opening_balance",
          movement_type: "increase",
          amount: openingBalance,
          note,
          date: openingBalanceDate,
        });
      }

      await client.query("COMMIT");
      return { success: true, id: supplierId };
    } catch (err) {
      await client.query("ROLLBACK");
      return { success: false, error: err.message };
    } finally {
      client.release();
    }
  });

  ipcMain.handle("get-suppliers", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const balanceFilter = ["owing", "settled"].includes(params.balance_filter)
      ? params.balance_filter
      : "all";
    const havingClause =
      balanceFilter === "owing"
        ? "HAVING COALESCE(SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END), 0) > 0"
        : balanceFilter === "settled"
          ? "HAVING COALESCE(SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END), 0) <= 0"
          : "";

    const perSupplierCTE = `
      SELECT
        s.id,
        s.name,
        s.phone,
        s.address,
        s.created_at,
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
      const { rows: suppliers } = await query(
        `SELECT * FROM (${perSupplierCTE}) sub
         ORDER BY created_at DESC, id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );

      const { rows: totalRows } = await query(
        `SELECT COUNT(*) AS total FROM (${perSupplierCTE}) sub`,
      );
      const total = Number(totalRows[0].total);

      const { rows: statsRows } = await query(
        `SELECT
          COUNT(*) AS count,
          COALESCE(SUM(total), 0) AS "totalPayable",
          COALESCE(SUM(total_paid), 0) AS "totalPaid",
          COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS "netOutstanding"
        FROM (${perSupplierCTE}) sub`,
      );
      const stats = statsRows[0];

      const unfilteredCTE = perSupplierCTE.replace(havingClause, "");
      const { rows: countsRows } = await query(
        `SELECT
          COUNT(*) AS all_count,
          SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END) AS owing_count,
          SUM(CASE WHEN balance <= 0 THEN 1 ELSE 0 END) AS settled_count
        FROM (${unfilteredCTE}) sub`,
      );
      const counts = countsRows[0];

      return {
        success: true,
        data: suppliers,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        stats,
        counts: {
          all: Number(counts.all_count) || 0,
          owing: Number(counts.owing_count) || 0,
          settled: Number(counts.settled_count) || 0,
        },
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-supplier", async (event, id) => {
    try {
      const { rows } = await query(
        `SELECT
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

        WHERE s.id = $1

        GROUP BY s.id`,
        [id],
      );

      return { success: true, data: rows[0] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("update-supplier", async (event, data) => {
    const name = (data.name || "").trim();
    const phone = (data.phone || "").trim();
    const address = (data.address || "").trim();

    if (!name) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    try {
      await query(
        `UPDATE suppliers
         SET name = $1, phone = $2, address = $3
         WHERE id = $4`,
        [name, phone, address, data.id],
      );

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("delete-supplier", async (event, id) => {
    try {
      const { rows } = await query(
        `SELECT id
         FROM party_history
         WHERE party_type = 'supplier'
           AND party_id = $1
         LIMIT 1`,
        [id],
      );

      if (rows[0]) {
        return {
          success: false,
          error: "Cannot delete supplier because it has transactions.",
        };
      }

      await query("DELETE FROM suppliers WHERE id = $1", [id]);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
