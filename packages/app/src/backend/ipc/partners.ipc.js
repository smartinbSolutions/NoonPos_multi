// packages/app/src/backend/partners.ipc.js
import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";
import createPartyHistory from "../utils/createPaymentHistory";
import { buildOpeningBalanceNote } from "../utils/helpers";

export default function registerPartnersIPC() {
  // CREATE
  ipcMain.handle("create-partner", async (event, data) => {
    if (!data.name) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO partners (name, phone, address)
         VALUES ($1,$2,$3)
         RETURNING id`,
        [data.name, data.phone, data.address],
      );
      const partnerId = result.rows[0].id;

      const openingBalance = Number(data.opening_balance || 0);
      if (openingBalance !== 0) {
        const openingBalanceDate = data.date
          ? `${data.date.slice(0, 10)} 00:00:00`
          : `${new Date().getFullYear()}-01-01 00:00:00`;

        const note = await buildOpeningBalanceNote(client.query.bind(client));
        await createPartyHistory(client.query.bind(client), {
          party_type: "partner",
          party_id: partnerId,
          invoice_id: null,
          invoice_type: "opening_balance",
          record_type: "opening_balance",
          movement_type: data.balance_type,
          amount: openingBalance,
          note,
          date: openingBalanceDate,
        });
      }

      await client.query("COMMIT");
      return { success: true, id: partnerId };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });

  ipcMain.handle("get-partners", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const { rows: partners } = await query(
      `SELECT
        p.*,
        p.created_at::text AS created_at,

        COALESCE(
          SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END),
          0
        )::float AS total_deposit,

        COALESCE(
          SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END),
          0
        )::float AS total_withdrawal,

        COALESCE(
          SUM(
            CASE
              WHEN ph.movement_type = 'increase' THEN ph.amount
              WHEN ph.movement_type = 'decrease' THEN -ph.amount
              ELSE 0
            END
          ),
          0
        )::float AS balance

      FROM partners p
      LEFT JOIN party_history ph
        ON ph.party_type = 'partner'
       AND ph.party_id = p.id

      GROUP BY p.id
      ORDER BY p.name

      LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const { rows: totalRows } = await query(
      "SELECT COUNT(*) AS total FROM partners",
    );
    const total = Number(totalRows[0].total);

    return {
      data: partners,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  ipcMain.handle("get-partner", async (event, id) => {
    const { rows } = await query(
      `SELECT
        p.*,
        p.created_at::text AS created_at,

        COALESCE(
          SUM(CASE WHEN ph.movement_type = 'increase' THEN ph.amount ELSE 0 END),
          0
        )::float AS total_deposit,

        COALESCE(
          SUM(CASE WHEN ph.movement_type = 'decrease' THEN ph.amount ELSE 0 END),
          0
        )::float AS total_withdrawal,

        COALESCE(
          SUM(
            CASE
              WHEN ph.movement_type = 'increase' THEN ph.amount
              WHEN ph.movement_type = 'decrease' THEN -ph.amount
              ELSE 0
            END
          ),
          0
        )::float AS balance

      FROM partners p
      LEFT JOIN party_history ph
        ON ph.party_type = 'partner'
       AND ph.party_id = p.id

      WHERE p.id = $1

      GROUP BY p.id`,
      [id],
    );

    return rows[0] || null;
  });

  ipcMain.handle("update-partner", async (event, data) => {
    if (!data.name) {
      return { success: false, error: "ERROR ENTER DATA" };
    }
    try {
      await query(
        `UPDATE partners
         SET name = $1, phone = $2, address = $3
         WHERE id = $4`,
        [data.name, data.phone, data.address, data.id],
      );

      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("delete-partner", async (event, id) => {
    try {
      const { rows } = await query(
        `SELECT COUNT(*) AS count FROM party_history
         WHERE party_type = 'partner' AND party_id = $1`,
        [id],
      );

      if (Number(rows[0].count) > 0) {
        return { success: false, error: "PARTNER_HAS_HISTORY" };
      }

      await query("DELETE FROM partners WHERE id = $1", [id]);

      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
