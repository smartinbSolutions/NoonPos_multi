// packages/app/src/backend/payment.ipc.js
import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";
import reversePayment from "../services/payment/invoice/reversePayment.service";
import allocateCustomerPayment from "../services/payment/party/allocateCustomerPayment.service";
import allocateSupplierPayment from "../services/payment/party/allocateSupplierPayment.service";
import createFundHistory from "../utils/createFundHistory";
import createPayment from "../utils/createPayment";

export default function registerPaymentIPC() {
  ipcMain.handle("create-payment", async (event, data) => {
    const client = await getClient();
    try {
      const amount = Number(data.amount);

      if (!data.type || !data.party_type || !data.fund_id || !amount) {
        return { message: "ERROR ENTER DATA", status: 400 };
      }

      if (
        data.party_type !== "other" &&
        data.party_type !== "partner" &&
        data.party_type !== "customer" &&
        data.party_type !== "supplier" &&
        !data.party_id
      ) {
        return { message: "ERROR ENTER INVOICE", status: 400 };
      }

      const validPartyTypes = ["supplier", "customer", "partner", "other"];
      const validTypes = ["income", "expense"];

      if (!validPartyTypes.includes(data.party_type)) {
        return { message: "INVALID PARTY TYPE", status: 400 };
      }

      if (!validTypes.includes(data.type)) {
        return { message: "INVALID PAYMENT TYPE", status: 400 };
      }

      await client.query("BEGIN");
      const q = client.query.bind(client);

      // Guard: if a specific invoice/expense was targeted, the payment
      // amount must not exceed what that record actually still owes.
      if (data.invoiceId && data.mode) {
        const invoiceType = data.mode;
        let table;

        if (invoiceType === "expense") {
          table = "expense";
        } else if (invoiceType === "purchase") {
          table = "purchase_invoices";
        } else if (invoiceType === "sales") {
          table = "sales_invoices";
        }

        if (table) {
          const { rows } = await q(
            `SELECT
              id,
              net_total,
              net_total - COALESCE((
                SELECT SUM(amount)
                FROM payment_allocations
                WHERE invoice_id = ${table}.id
                  AND invoice_type = $1
              ), 0) AS remaining
            FROM ${table}
            WHERE id = $2`,
            [invoiceType, data.invoiceId],
          );
          const targetInvoice = rows[0];

          if (!targetInvoice) {
            await client.query("ROLLBACK");
            return { message: "INVOICE NOT FOUND", status: 400 };
          }

          if (amount > Number(targetInvoice.remaining) + 0.001) {
            await client.query("ROLLBACK");
            return {
              message: "PAYMENT_EXCEEDS_INVOICE_REMAINING",
              status: 400,
            };
          }
        }
      }

      const dateOnly = (data.date || new Date().toISOString()).slice(0, 10);
      const time = new Date().toTimeString().slice(0, 8);
      const paymentDate = `${dateOnly} ${time}`;

      const paymentId = await createPayment(q, {
        type: data.type,
        party_type: data.party_type,
        party_id: data.party_id,
        fund_id: data.fund_id,
        date: paymentDate,
        amount: amount,
        note: data.note || null,
        currency_code: data.currency_code,
        exchange_rate: data.exchange_rate,
        effective_rate: data.effective_rate,
        amount_fund_currency: data.collected_amount,
        invoice_id: data.invoiceId || null,
        invoice_type: data.mode || null,
        created_by: data.created_by,
      });

      // createPayment already wrote the allocation above when a specific
      // invoiceId was targeted. Only fall through to the FIFO/account-level
      // allocator when NO invoice was targeted — otherwise this
      // double-writes payment_allocations for the same payment.
      const isTargeted = Boolean(data.invoiceId && data.mode);

      if (!isTargeted && data.party_type === "supplier") {
        await allocateSupplierPayment(q, {
          supplierId: data.party_id,
          paymentId,
          amount,
          mode: data.mode,
          fund_id: data.fund_id,
          note: data.note,
          currency_code: data.currency_code,
          exchange_rate: data.exchange_rate,
          effective_rate: data.effective_rate,
          amount_fund_currency: data.collected_amount,
          invoiceId: data.invoiceId || null,
          invoiceType: data.mode || null,
        });
      }

      if (!isTargeted && data.party_type === "customer") {
        await allocateCustomerPayment(q, {
          customerId: data.party_id,
          paymentId,
          amount,
          fund_id: data.fund_id,
          note: data.note,
          currency_code: data.currency_code,
          exchange_rate: data.exchange_rate,
          effective_rate: data.effective_rate,
          amount_fund_currency: data.collected_amount,
          invoiceId: data.invoiceId || null,
          invoiceType: data.mode || null,
        });
      }

      await createFundHistory(q, {
        fund_id: data.fund_id,
        record_type: "payment",
        payment_id: paymentId,
        movement_type: data.type === "income" ? "in" : "out",
        amount: data.collected_amount,
        note: data.note || "",
        date: paymentDate,
      });

      await client.query("COMMIT");

      return { success: true, id: paymentId, status: 200 };
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Failed to create payment:", error);
      return {
        success: false,
        message: error.message || "FAILED TO CREATE PAYMENT",
        status: 500,
      };
    } finally {
      client.release();
    }
  });

  ipcMain.handle("get-payments", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const conditions = [];
    const filterParams = [];
    let paramIndex = 1;

    if (params.type) {
      conditions.push(`p.type = $${paramIndex}`);
      filterParams.push(params.type);
      paramIndex++;
    }

    if (params.party_type) {
      conditions.push(`p.party_type = $${paramIndex}`);
      filterParams.push(params.party_type);
      paramIndex++;
    }

    if (params.invoice_type) {
      conditions.push(`p.invoice_type = $${paramIndex}`);
      filterParams.push(params.invoice_type);
      paramIndex++;
    }

    if (params.fund_id) {
      conditions.push(`p.fund_id = $${paramIndex}`);
      filterParams.push(params.fund_id);
      paramIndex++;
    }

    if (params.dateFrom) {
      conditions.push(`p.date::date >= $${paramIndex}::date`);
      filterParams.push(params.dateFrom);
      paramIndex++;
    }

    if (params.dateTo) {
      conditions.push(`p.date::date <= $${paramIndex}::date`);
      filterParams.push(params.dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const { rows: payments } = await query(
      `SELECT
        p.*,
        f.name AS fund_name,
        c.code AS fund_currency_code,
        c.symbol AS fund_currency_symbol,
        creator.full_name AS created_by_name,

        COALESCE(cust.name, supp.name, part.name) AS party_name,
        (
          SELECT COUNT(*)
          FROM payment_allocations pa
          WHERE pa.payment_id = p.id
        ) AS allocation_count,
        (
          SELECT COALESCE(SUM(pa.amount), 0)
          FROM payment_allocations pa
          WHERE pa.payment_id = p.id
        ) AS allocated_amount
      FROM payments p
      LEFT JOIN funds f ON f.id = p.fund_id
      LEFT JOIN users creator ON creator.id = p.created_by
      LEFT JOIN currencies c ON c.id = f.currency_id
      LEFT JOIN customers cust ON cust.id = p.party_id AND p.party_type = 'customer'
      LEFT JOIN suppliers supp ON supp.id = p.party_id AND p.party_type = 'supplier'
      LEFT JOIN partners part ON part.id = p.party_id AND p.party_type = 'partner'
      ${whereClause}
      ORDER BY p.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...filterParams, limit, offset],
    );

    const { rows: totalRows } = await query(
      `SELECT COUNT(*) AS total FROM payments p ${whereClause}`,
      filterParams,
    );
    const total = Number(totalRows[0].total);

    const { rows: summaryRows } = await query(
      `SELECT
        COUNT(CASE WHEN p.type = 'income' THEN 1 END) AS income_count,
        COALESCE(SUM(CASE WHEN p.type = 'income' THEN p.amount END), 0) AS income_total,
        COUNT(CASE WHEN p.type = 'expense' THEN 1 END) AS expense_count,
        COALESCE(SUM(CASE WHEN p.type = 'expense' THEN p.amount END), 0) AS expense_total
      FROM payments p
      ${whereClause}`,
      filterParams,
    );

    return {
      data: payments,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      summary: summaryRows[0],
    };
  });

  ipcMain.handle("get-deleted-payments", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const conditions = [];
    const filterParams = [];
    let paramIndex = 1;

    // payload is stored as TEXT (JSON string) — cast to json then navigate
    // with -> / ->> operators. This replaces SQLite's json_extract(...)
    // with Postgres's native JSON path syntax.
    if (params.type) {
      conditions.push(
        `(dp.payload::json->'payment'->>'type') = $${paramIndex}`,
      );
      filterParams.push(params.type);
      paramIndex++;
    }

    if (params.party_type) {
      conditions.push(
        `(dp.payload::json->'payment'->>'party_type') = $${paramIndex}`,
      );
      filterParams.push(params.party_type);
      paramIndex++;
    }

    if (params.invoice_type) {
      conditions.push(
        `(dp.payload::json->'payment'->>'invoice_type') = $${paramIndex}`,
      );
      filterParams.push(params.invoice_type);
      paramIndex++;
    }

    if (params.fund_id) {
      conditions.push(
        `(dp.payload::json->'payment'->>'fund_id')::integer = $${paramIndex}`,
      );
      filterParams.push(Number(params.fund_id));
      paramIndex++;
    }

    if (params.dateFrom) {
      conditions.push(
        `(dp.payload::json->'payment'->>'date')::date >= $${paramIndex}::date`,
      );
      filterParams.push(params.dateFrom);
      paramIndex++;
    }

    if (params.dateTo) {
      conditions.push(
        `(dp.payload::json->'payment'->>'date')::date <= $${paramIndex}::date`,
      );
      filterParams.push(params.dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const { rows: deletedPayments } = await query(
      `SELECT
        dp.id AS deleted_payment_id,
        dp.payment_id,
        dp.deleted_by,
        dp.deleted_at,
        deleter.full_name AS deleted_by_name,

        dp.payload::json->'payment'->>'type' AS type,
        dp.payload::json->'payment'->>'party_type' AS party_type,
        (dp.payload::json->'payment'->>'party_id')::integer AS party_id,
        (dp.payload::json->'payment'->>'fund_id')::integer AS fund_id,
        (dp.payload::json->'payment'->>'amount')::numeric AS amount,
        dp.payload::json->'payment'->>'currency_code' AS currency_code,
        (dp.payload::json->'payment'->>'exchange_rate')::numeric AS exchange_rate,
        (dp.payload::json->'payment'->>'effective_rate')::numeric AS effective_rate,
        (dp.payload::json->'payment'->>'amount_fund_currency')::numeric AS amount_fund_currency,
        dp.payload::json->'payment'->>'note' AS note,
        dp.payload::json->'payment'->>'date' AS date,
        dp.payload::json->'payment'->>'invoice_type' AS invoice_type,
        dp.payload::json->'payment'->>'created_at' AS created_at,

        f.name AS fund_name,
        c.code AS fund_currency_code,
        c.symbol AS fund_currency_symbol,

        COALESCE(cust.name, supp.name, part.name) AS party_name,

        dp.payload AS payload
      FROM deleted_payments dp
      LEFT JOIN users deleter ON deleter.id = dp.deleted_by
      LEFT JOIN funds f
        ON f.id = (dp.payload::json->'payment'->>'fund_id')::integer
      LEFT JOIN currencies c ON c.id = f.currency_id
      LEFT JOIN customers cust
        ON cust.id = (dp.payload::json->'payment'->>'party_id')::integer
        AND dp.payload::json->'payment'->>'party_type' = 'customer'
      LEFT JOIN suppliers supp
        ON supp.id = (dp.payload::json->'payment'->>'party_id')::integer
        AND dp.payload::json->'payment'->>'party_type' = 'supplier'
      LEFT JOIN partners part
        ON part.id = (dp.payload::json->'payment'->>'party_id')::integer
        AND dp.payload::json->'payment'->>'party_type' = 'partner'
      ${whereClause}
      ORDER BY dp.deleted_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...filterParams, limit, offset],
    );

    const { rows: totalRows } = await query(
      `SELECT COUNT(*) AS total FROM deleted_payments dp ${whereClause}`,
      filterParams,
    );
    const total = Number(totalRows[0].total);

    return {
      data: deletedPayments.map((row) => ({
        ...row,
        allocations: JSON.parse(row.payload).allocations,
        payload: undefined,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  ipcMain.handle("get-payment", async (event, id) => {
    const { rows: paymentRows } = await query(
      `SELECT
        p.*,
        f.name AS fund_name,
        c.code AS fund_currency_code,
        c.symbol AS fund_currency_symbol,
        creator.full_name AS created_by_name,

        COALESCE(cust.name, supp.name, part.name) AS party_name
      FROM payments p
      LEFT JOIN funds f ON f.id = p.fund_id
      LEFT JOIN currencies c ON c.id = f.currency_id
      LEFT JOIN users creator ON creator.id = p.created_by
      LEFT JOIN customers cust ON cust.id = p.party_id AND p.party_type = 'customer'
      LEFT JOIN suppliers supp ON supp.id = p.party_id AND p.party_type = 'supplier'
      LEFT JOIN partners part ON part.id = p.party_id AND p.party_type = 'partner'
      WHERE p.id = $1`,
      [id],
    );
    const payment = paymentRows[0];

    if (!payment) return null;

    const { rows: allocationRows } = await query(
      `SELECT
        pa.*,

        COALESCE(pi.net_total, si.net_total, ex.net_total, ob.amount) AS invoice_total,

        (
          SELECT COALESCE(SUM(pa2.amount), 0)
          FROM payment_allocations pa2
          WHERE pa2.invoice_id = pa.invoice_id
            AND pa2.invoice_type = pa.invoice_type
        ) AS total_allocated_to_invoice

      FROM payment_allocations pa
      LEFT JOIN purchase_invoices pi ON pi.id = pa.invoice_id AND pa.invoice_type = 'purchase'
      LEFT JOIN sales_invoices si ON si.id = pa.invoice_id AND pa.invoice_type = 'sales'
      LEFT JOIN expense ex ON ex.id = pa.invoice_id AND pa.invoice_type = 'expense'
      LEFT JOIN party_history ob ON ob.id = pa.invoice_id AND pa.invoice_type = 'opening_balance'
      WHERE pa.payment_id = $1
      ORDER BY pa.id ASC`,
      [id],
    );

    const allocations = allocationRows.map((a) => ({
      ...a,
      settlement_status:
        a.invoice_total != null &&
        Number(a.total_allocated_to_invoice) >= Number(a.invoice_total)
          ? "full"
          : "partial",
    }));

    return { ...payment, allocations };
  });

  ipcMain.handle("get-payment-allocations", async (event, paymentId) => {
    const { rows: allocations } = await query(
      `SELECT
        pa.*,

        COALESCE(pi.net_total, si.net_total, ex.net_total, ob.amount) AS invoice_total,

        (
          SELECT COALESCE(SUM(pa2.amount), 0)
          FROM payment_allocations pa2
          WHERE pa2.invoice_id = pa.invoice_id
            AND pa2.invoice_type = pa.invoice_type
        ) AS total_allocated_to_invoice

      FROM payment_allocations pa
      LEFT JOIN purchase_invoices pi ON pi.id = pa.invoice_id AND pa.invoice_type = 'purchase'
      LEFT JOIN sales_invoices si ON si.id = pa.invoice_id AND pa.invoice_type = 'sales'
      LEFT JOIN expense ex ON ex.id = pa.invoice_id AND pa.invoice_type = 'expense'
      LEFT JOIN party_history ob ON ob.id = pa.invoice_id AND pa.invoice_type = 'opening_balance'
      WHERE pa.payment_id = $1
      ORDER BY pa.id ASC`,
      [paymentId],
    );

    return allocations.map((a) => ({
      ...a,
      settlement_status:
        a.invoice_total != null &&
        Number(a.total_allocated_to_invoice) >= Number(a.invoice_total) - 0.005
          ? "full"
          : "partial",
    }));
  });

  ipcMain.handle("get-payment-fund", async (event, id) => {
    const { rows } = await query(
      `SELECT
        p.*,
        f.name AS fund_name,
        c.code AS fund_currency_code,
        c.symbol AS fund_currency_symbol,
        creator.full_name AS created_by_name,

        SUM(
          CASE
            WHEN p.type = 'income' THEN p.amount_fund_currency
            ELSE -p.amount_fund_currency
          END
        ) OVER (
          ORDER BY p.id ASC
        ) AS running_balance

      FROM payments p
      LEFT JOIN funds f ON f.id = p.fund_id
      LEFT JOIN currencies c ON c.id = f.currency_id
      LEFT JOIN users creator ON creator.id = p.created_by

      WHERE p.fund_id = $1

      ORDER BY p.id DESC`,
      [id],
    );

    return rows;
  });

  ipcMain.handle(
    "get-party-ledger",
    async (event, { partyId, partyType, limit = 1, offset = 0 }) => {
      const { rows } = await query(
        `SELECT * FROM (
          SELECT
            p.*,
            f.name AS fund_name,
            c.code AS fund_currency_code,
            c.symbol AS fund_currency_symbol,
            creator.full_name AS created_by_name,

            SUM(
              CASE
                WHEN p.type = 'income' THEN p.amount
                WHEN p.type = 'expense' THEN -p.amount
                ELSE 0
              END
            ) OVER (
              PARTITION BY p.party_id
              ORDER BY p.id ASC
            ) AS running_balance

          FROM payments p
          LEFT JOIN funds f ON f.id = p.fund_id
          LEFT JOIN currencies c ON c.id = f.currency_id
          LEFT JOIN users creator ON creator.id = p.created_by
          WHERE p.party_id = $1
            AND p.party_type = $2
        ) sub

        ORDER BY id DESC
        LIMIT $3 OFFSET $4`,
        [partyId, partyType, limit, offset],
      );

      return rows;
    },
  );

  ipcMain.handle(
    "get-party-opening-balance",
    async (event, { partyId, partyType }) => {
      const { rows } = await query(
        `SELECT COALESCE(SUM(
          CASE
            WHEN type = 'income' THEN amount
            ELSE -amount
          END
        ), 0) AS balance
        FROM payments
        WHERE party_id = $1
          AND party_type = $2`,
        [partyId, partyType],
      );

      return rows[0]?.balance || 0;
    },
  );

  ipcMain.handle("update-payment", async (event, data) => {
    await query(
      `UPDATE payments
       SET type = $1, party_type = $2, party_id = $3, fund_id = $4, amount = $5, note = $6
       WHERE id = $7`,
      [
        data.type,
        data.party_type,
        data.party_id,
        data.fund_id,
        data.amount,
        data.note,
        data.id,
      ],
    );

    return { success: true };
  });

  ipcMain.handle("delete-payment", async (event, id, { deletedBy } = {}) => {
    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      const { rows: paymentRows } = await q(
        "SELECT * FROM payments WHERE id = $1",
        [id],
      );
      const payment = paymentRows[0];

      if (!payment) {
        throw new Error("PAYMENT_NOT_FOUND");
      }

      const { rows: history } = await q(
        `SELECT * FROM party_history WHERE payment_id = $1 AND record_type = 'payment'`,
        [id],
      );

      if (history.length === 0) {
        throw new Error("PAYMENT_HISTORY_NOT_FOUND");
      }

      const { rows: allocations } = await q(
        "SELECT * FROM payment_allocations WHERE payment_id = $1",
        [id],
      );

      await reversePayment(q, payment);

      await q(
        `INSERT INTO deleted_payments (payment_id, payload, deleted_by)
         VALUES ($1, $2, $3)`,
        [id, JSON.stringify({ payment, allocations }), deletedBy ?? null],
      );

      await q("DELETE FROM payment_allocations WHERE payment_id = $1", [id]);
      await q("DELETE FROM party_history WHERE payment_id = $1", [id]);
      await q("DELETE FROM fund_history WHERE payment_id = $1", [id]);
      await q("DELETE FROM payments WHERE id = $1", [id]);

      await client.query("COMMIT");

      return { success: true };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      return { success: false, error: err.message };
    } finally {
      client.release();
    }
  });
}
