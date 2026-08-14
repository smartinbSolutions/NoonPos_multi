// packages/app/src/backend/customers.ipc.js
import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";
import createPartyHistory from "../utils/createPaymentHistory";
import { buildOpeningBalanceNote } from "../utils/helpers.js";

export default function registerCustomersIPC() {
  // CREATE
  ipcMain.handle("create-customer", async (event, data) => {
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
        `INSERT INTO customers (name, phone, address)
         VALUES ($1,$2,$3)
         RETURNING id`,
        [name, phone, address],
      );
      const customerId = result.rows[0].id;

      const openingBalance = Number(data.opening_balance || 0);
      if (openingBalance !== 0) {
        const openingBalanceDate = data.date
          ? `${data.date.slice(0, 10)} 00:00:00`
          : `${new Date().getFullYear()}-01-01 00:00:00`;

        const note = await buildOpeningBalanceNote(client.query.bind(client));
        await createPartyHistory(client.query.bind(client), {
          party_type: "customer",
          party_id: customerId,
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
      return { success: true, id: customerId };
    } catch (err) {
      await client.query("ROLLBACK");
      return { success: false, error: err.message };
    } finally {
      client.release();
    }
  });

  ipcMain.handle("get-customers", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    // Fixed enum only — never interpolate raw user input into HAVING.
    const balanceFilter = ["owing", "settled"].includes(params.balance_filter)
      ? params.balance_filter
      : "all";
    const havingClause =
      balanceFilter === "owing"
        ? "HAVING COALESCE(SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END), 0) > 0"
        : balanceFilter === "settled"
          ? "HAVING COALESCE(SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END), 0) <= 0"
          : "";

    // Balance must be computed here (not just selected) so HAVING can filter on it.
    // NOTE: Postgres doesn't allow referencing a SELECT alias (like "balance")
    // inside HAVING in the same query — the expression must be repeated, hence
    // the full CASE expression above rather than "HAVING balance > 0".
    const perCustomerCTE = `
      SELECT
        c.id,
        c.name,
        c.phone,
        c.address,
        c.created_at,
        COALESCE(SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END), 0) AS total,
        COALESCE(SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END), 0) AS balance
      FROM customers c
      LEFT JOIN party_history ph
        ON ph.party_type = 'customer'
       AND ph.party_id = c.id
      GROUP BY c.id
      ${havingClause}
    `;

    try {
      const { rows: customers } = await query(
        `SELECT * FROM (${perCustomerCTE}) sub
         ORDER BY created_at DESC, id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );

      const { rows: totalRows } = await query(
        `SELECT COUNT(*) AS total FROM (${perCustomerCTE}) sub`,
      );
      const total = Number(totalRows[0].total);

      // Cross-page aggregates for the currently applied filter — not just this page.
      const { rows: statsRows } = await query(
        `SELECT
          COUNT(*) AS count,
          COALESCE(SUM(total), 0) AS "totalPayable",
          COALESCE(SUM(total_paid), 0) AS "totalPaid",
          COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS "netOutstanding"
        FROM (${perCustomerCTE}) sub`,
      );
      const stats = statsRows[0];

      // Counts per filter bucket, independent of which filter is currently applied.
      const unfilteredCTE = perCustomerCTE.replace(havingClause, "");
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
        data: customers,
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

  ipcMain.handle("get-customer", async (event, id) => {
    try {
      const { rows } = await query(
        `SELECT
          c.*,

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

        FROM customers c

        LEFT JOIN party_history ph
          ON ph.party_type = 'customer'
         AND ph.party_id = c.id

        WHERE c.id = $1

        GROUP BY c.id`,
        [id],
      );

      return { success: true, data: rows[0] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("update-customer", async (event, data) => {
    const name = (data.name || "").trim();
    const phone = (data.phone || "").trim();
    const address = (data.address || "").trim();

    if (!name) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    try {
      await query(
        `UPDATE customers
         SET name = $1, phone = $2, address = $3
         WHERE id = $4`,
        [name, phone, address, data.id],
      );

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("delete-customer", async (event, id) => {
    try {
      const { rows } = await query(
        `SELECT id
         FROM party_history
         WHERE party_type = 'customer'
           AND party_id = $1
         LIMIT 1`,
        [id],
      );

      if (rows[0]) {
        return {
          success: false,
          error: "Cannot delete customer because it has transactions.",
        };
      }

      await query("DELETE FROM customers WHERE id = $1", [id]);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
