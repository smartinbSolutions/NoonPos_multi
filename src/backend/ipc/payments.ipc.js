const { ipcMain } = require("electron");
import db from "../db";
import reversePayment from "../services/payment/invoice/reversePayment.service";
import allocateCustomerPayment from "../services/payment/party/allocateCustomerPayment.service";
import allocateSupplierPayment from "../services/payment/party/allocateSupplierPayment.service";
import createFundHistory from "../utils/createFundHistory";
import createPayment from "../utils/createPayment";

export default function registerPaymentIPC() {
  ipcMain.handle("create-payment", (event, data) => {
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

      // Guard: if a specific invoice/expense was targeted, the payment amount
      // must not exceed what that one record actually still owes. Front-end
      // already caps this, but this check protects against a bypassed/stale
      // client, race conditions, or a direct IPC call.
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
          const targetInvoice = db
            .prepare(
              `
              SELECT
                id,
                net_total,
                net_total - COALESCE((
                  SELECT SUM(amount)
                  FROM payment_allocations
                  WHERE invoice_id = ${table}.id
                    AND invoice_type = ?
                ), 0) AS remaining
              FROM ${table}
              WHERE id = ?
              `
            )
            .get(invoiceType, data.invoiceId);

          if (!targetInvoice) {
            return { message: "INVOICE NOT FOUND", status: 400 };
          }

          if (amount > Number(targetInvoice.remaining) + 0.001) {
            return {
              message: "PAYMENT_EXCEEDS_INVOICE_REMAINING",
              status: 400,
            };
          }
        }
      }

      // Normalize once, here, so every downstream write (payments,
      // party_history, fund_history) shares the exact same
      // "YYYY-MM-DD HH:MM:SS" timestamp — same pattern as
      // transfer-fund-to-fund. `data.date` from the UI is typically just a
      // date (no time), so we stamp it with the current time; if it's
      // missing entirely, both date and time default to now.
      const dateOnly = (data.date || new Date().toISOString()).slice(0, 10);
      const time = new Date().toTimeString().slice(0, 8);
      const paymentDate = `${dateOnly} ${time}`;

      const transaction = db.transaction(() => {
        const result = createPayment(db, {
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

        const paymentId = result;

        // createPayment already wrote the allocation above when a specific
        // invoiceId was targeted (see its `if (data.invoice_id != null)` block).
        // Only fall through to the FIFO/account-level allocator when NO
        // invoice was targeted — otherwise this double-writes
        // payment_allocations for the same payment: createPayment's row is
        // uncapped (full data.amount) while the allocator's row is capped to
        // the invoice's remaining balance, so together they overstate how
        // much of the invoice was actually paid.
        const isTargeted = Boolean(data.invoiceId && data.mode);

        if (!isTargeted && data.party_type === "supplier") {
          allocateSupplierPayment(db, {
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
          allocateCustomerPayment(db, {
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

        createFundHistory(db, {
          fund_id: data.fund_id,
          record_type: "payment",
          payment_id: paymentId,
          movement_type: data.type === "income" ? "in" : "out",
          amount: data.collected_amount,
          note: data.note || "",
          date: paymentDate,
        });

        return paymentId;
      });

      const paymentId = transaction();

      return {
        success: true,
        id: paymentId,
        status: 200,
      };
    } catch (error) {
      console.error("Failed to create payment:", error);

      return {
        success: false,
        message: error.message || "FAILED TO CREATE PAYMENT",
        status: 500,
      };
    }
  });

  ipcMain.handle("get-payments", (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const conditions = [];
    const filterParams = [];

    if (params.type) {
      conditions.push(`p.type = ?`);
      filterParams.push(params.type);
    }

    if (params.party_type) {
      conditions.push(`p.party_type = ?`);
      filterParams.push(params.party_type);
    }

    if (params.invoice_type) {
      conditions.push(`p.invoice_type = ?`);
      filterParams.push(params.invoice_type);
    }

    if (params.fund_id) {
      conditions.push(`p.fund_id = ?`);
      filterParams.push(params.fund_id);
    }

    if (params.dateFrom) {
      conditions.push(`date(p.date) >= date(?)`);
      filterParams.push(params.dateFrom);
    }

    if (params.dateTo) {
      conditions.push(`date(p.date) <= date(?)`);
      filterParams.push(params.dateTo);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const payments = db
      .prepare(
        `
      SELECT 
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
          LEFT JOIN users creator
    ON creator.id = p.created_by
      LEFT JOIN currencies c ON c.id = f.currency_id
      LEFT JOIN customers cust ON cust.id = p.party_id AND p.party_type = 'customer'
      LEFT JOIN suppliers supp ON supp.id = p.party_id AND p.party_type = 'supplier'
      LEFT JOIN partners part ON part.id = p.party_id AND p.party_type = 'partner'
      ${whereClause}
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(...filterParams, limit, offset);

    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM payments p ${whereClause}`)
      .get(...filterParams);

    const summary = db
      .prepare(
        `
      SELECT
        COUNT(CASE WHEN p.type = 'income' THEN 1 END) AS income_count,
        COALESCE(SUM(CASE WHEN p.type = 'income' THEN p.amount END), 0) AS income_total,
        COUNT(CASE WHEN p.type = 'expense' THEN 1 END) AS expense_count,
        COALESCE(SUM(CASE WHEN p.type = 'expense' THEN p.amount END), 0) AS expense_total
      FROM payments p
      ${whereClause}
    `
      )
      .get(...filterParams);

    return {
      data: payments,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      summary,
    };
  });

  ipcMain.handle("get-deleted-payments", (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const conditions = [];
    const filterParams = [];

    if (params.type) {
      conditions.push(`json_extract(dp.payload, '$.payment.type') = ?`);
      filterParams.push(params.type);
    }

    if (params.party_type) {
      conditions.push(`json_extract(dp.payload, '$.payment.party_type') = ?`);
      filterParams.push(params.party_type);
    }

    if (params.invoice_type) {
      conditions.push(`json_extract(dp.payload, '$.payment.invoice_type') = ?`);
      filterParams.push(params.invoice_type);
    }

    if (params.fund_id) {
      conditions.push(
        `CAST(json_extract(dp.payload, '$.payment.fund_id') AS INTEGER) = ?`
      );
      filterParams.push(Number(params.fund_id));
    }

    if (params.dateFrom) {
      conditions.push(
        `date(json_extract(dp.payload, '$.payment.date')) >= date(?)`
      );
      filterParams.push(params.dateFrom);
    }

    if (params.dateTo) {
      conditions.push(
        `date(json_extract(dp.payload, '$.payment.date')) <= date(?)`
      );
      filterParams.push(params.dateTo);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const deletedPayments = db
      .prepare(
        `
      SELECT
        dp.id AS deleted_payment_id,
        dp.payment_id,
        dp.deleted_by,
        dp.deletedAt,
        deleter.full_name AS deleted_by_name,

        json_extract(dp.payload, '$.payment.type') AS type,
        json_extract(dp.payload, '$.payment.party_type') AS party_type,
        json_extract(dp.payload, '$.payment.party_id') AS party_id,
        json_extract(dp.payload, '$.payment.fund_id') AS fund_id,
        json_extract(dp.payload, '$.payment.amount') AS amount,
        json_extract(dp.payload, '$.payment.currency_code') AS currency_code,
        json_extract(dp.payload, '$.payment.exchange_rate') AS exchange_rate,
        json_extract(dp.payload, '$.payment.effective_rate') AS effective_rate,
        json_extract(dp.payload, '$.payment.amount_fund_currency') AS amount_fund_currency,
        json_extract(dp.payload, '$.payment.note') AS note,
        json_extract(dp.payload, '$.payment.date') AS date,
        json_extract(dp.payload, '$.payment.invoice_type') AS invoice_type,
        json_extract(dp.payload, '$.payment.createdAt') AS createdAt,

        f.name AS fund_name,
        c.code AS fund_currency_code,
        c.symbol AS fund_currency_symbol,

        COALESCE(cust.name, supp.name, part.name) AS party_name,

        dp.payload AS payload
      FROM deleted_payments dp
      LEFT JOIN users deleter ON deleter.id = dp.deleted_by
      LEFT JOIN funds f
        ON f.id = CAST(json_extract(dp.payload, '$.payment.fund_id') AS INTEGER)
      LEFT JOIN currencies c ON c.id = f.currency_id
      LEFT JOIN customers cust
        ON cust.id = CAST(json_extract(dp.payload, '$.payment.party_id') AS INTEGER)
        AND json_extract(dp.payload, '$.payment.party_type') = 'customer'
      LEFT JOIN suppliers supp
        ON supp.id = CAST(json_extract(dp.payload, '$.payment.party_id') AS INTEGER)
        AND json_extract(dp.payload, '$.payment.party_type') = 'supplier'
      LEFT JOIN partners part
        ON part.id = CAST(json_extract(dp.payload, '$.payment.party_id') AS INTEGER)
        AND json_extract(dp.payload, '$.payment.party_type') = 'partner'
      ${whereClause}
      ORDER BY dp.deletedAt DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(...filterParams, limit, offset);

    const { total } = db
      .prepare(
        `SELECT COUNT(*) AS total FROM deleted_payments dp ${whereClause}`
      )
      .get(...filterParams);

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

  ipcMain.handle("get-payment", (event, id) => {
    const payment = db
      .prepare(
        `
        SELECT
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
        WHERE p.id = ?
        `
      )
      .get(id);

    if (!payment) return null;

    const allocations = db
      .prepare(
        `
        SELECT
          pa.*,
  
          -- The invoice's full amount, pulled from whichever table its
          -- invoice_type actually points to — same COALESCE-across-conditional-
          -- joins pattern used above for party_name.
          COALESCE(pi.net_total, si.net_total, ex.net_total, ob.amount) AS invoice_total,
  
          -- How much has been allocated to this SAME (invoice_id, invoice_type)
          -- across ALL payments, not just this one — an invoice can be paid in
          -- several installments, so "fully paid" has to look at the whole
          -- history, not just this single allocation row.
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
        WHERE pa.payment_id = ?
        ORDER BY pa.id ASC
        `
      )
      .all(id)
      .map((a) => ({
        ...a,
        // Never trust client-sent computed values — recompute the status here
        // rather than passing raw numbers and letting the frontend decide.
        settlement_status:
          a.invoice_total != null &&
          a.total_allocated_to_invoice >= a.invoice_total
            ? "full"
            : "partial",
      }));

    return { ...payment, allocations };
  });

  ipcMain.handle("get-payment-allocations", (event, paymentId) => {
    const allocations = db
      .prepare(
        `
        SELECT
          pa.*,
  
          -- The invoice's full amount, pulled from whichever table its
          -- invoice_type actually points to (polymorphic, same pattern as
          -- get-payment's party_name COALESCE-across-conditional-joins).
          COALESCE(pi.net_total, si.net_total, ex.net_total, ob.amount) AS invoice_total,
  
          -- How much has been allocated to this SAME (invoice_id, invoice_type)
          -- across ALL payments, not just this one — an invoice can be paid
          -- in several installments, so "fully paid" has to look at the
          -- whole history, not just this single allocation row.
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
        WHERE pa.payment_id = ?
        ORDER BY pa.id ASC
      `
      )
      .all(paymentId);

    // Never trust client-sent computed values — recompute the status here
    // rather than passing raw numbers and letting the frontend decide.
    // Epsilon guard against float drift (see the discount-rounding fix
    // elsewhere) so 99.99999999999999 still reads as "full", not "partial".
    return allocations.map((a) => ({
      ...a,
      settlement_status:
        a.invoice_total != null &&
        a.total_allocated_to_invoice >= a.invoice_total - 0.005
          ? "full"
          : "partial",
    }));
  });

  ipcMain.handle("get-payment-fund", (event, id) => {
    return db
      .prepare(
        `
      SELECT 
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

      LEFT JOIN funds f 
        ON f.id = p.fund_id
      LEFT JOIN currencies c 
        ON c.id = f.currency_id
    LEFT JOIN users creator
    ON creator.id = p.created_by

      WHERE p.fund_id = ?

      ORDER BY p.id DESC
    `
      )
      .all(id);
  });

  ipcMain.handle(
    "get-party-ledger",
    (event, { partyId, partyType, limit = 1, offset = 0 }) => {
      return db
        .prepare(
          `
        SELECT *
        FROM (
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
          LEFT JOIN users creator
          ON creator.id = p.created_by
          WHERE p.party_id = ?
            AND p.party_type = ?
        )

        ORDER BY id DESC
        LIMIT ? OFFSET ?
        `
        )
        .all(partyId, partyType, limit, offset);
    }
  );

  ipcMain.handle(
    "get-party-opening-balance",
    (event, { partyId, partyType }) => {
      const row = db
        .prepare(
          `
        SELECT COALESCE(SUM(
          CASE 
            WHEN type = 'income' THEN amount
            ELSE -amount
          END
        ), 0) AS balance
        FROM payments
        WHERE party_id = ?
          AND party_type = ?
        `
        )
        .get(partyId, partyType);

      return row?.balance || 0;
    }
  );

  ipcMain.handle("update-payment", (event, data) => {
    db.prepare(
      `
      UPDATE payments
      SET 
        type = ?,
        party_type = ?,
        party_id = ?,
        fund_id = ?,
        amount = ?,
        note = ?
      WHERE id = ?
    `
    ).run(
      data.type,
      data.party_type,
      data.party_id,
      data.fund_id,
      data.amount,
      data.note,
      data.id
    );

    return { success: true };
  });

  ipcMain.handle("delete-payment", (event, id, { deletedBy } = {}) => {
    const transaction = db.transaction(() => {
      const payment = db
        .prepare(
          `
        SELECT *
        FROM payments
        WHERE id = ?
      `
        )
        .get(id);

      if (!payment) {
        throw new Error("PAYMENT_NOT_FOUND");
      }

      const history = db
        .prepare(
          `
        SELECT *
        FROM party_history
        WHERE payment_id = ?
          AND record_type = 'payment'
      `
        )
        .all(id);

      if (history.length === 0) {
        throw new Error("PAYMENT_HISTORY_NOT_FOUND");
      }

      const allocations = db
        .prepare(
          `
        SELECT *
        FROM payment_allocations
        WHERE payment_id = ?
      `
        )
        .all(id);

      reversePayment(db, payment);

      db.prepare(
        `
      INSERT INTO deleted_payments (payment_id, payload, deleted_by)
      VALUES (?, ?, ?)
    `
      ).run(id, JSON.stringify({ payment, allocations }), deletedBy ?? null);

      db.prepare(
        `
      DELETE FROM payment_allocations
      WHERE payment_id = ?
    `
      ).run(id);

      db.prepare(
        `
      DELETE FROM party_history
      WHERE payment_id = ?
    `
      ).run(id);

      db.prepare(
        `
      DELETE FROM fund_history
      WHERE payment_id = ?
    `
      ).run(id);

      db.prepare(
        `
      DELETE FROM payments
      WHERE id = ?
    `
      ).run(id);
    });

    try {
      transaction();

      return {
        success: true,
      };
    } catch (err) {
      console.error(err);

      return {
        success: false,
        error: err.message,
      };
    }
  });
}
