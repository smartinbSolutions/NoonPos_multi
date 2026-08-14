// packages/app/src/backend/expense.ipc.js
import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";
import createFundHistory from "../utils/createFundHistory";
import createPayment from "../utils/createPayment";
import createPartyHistory from "../utils/createPaymentHistory";
import { buildDefaultInvoiceName } from "../utils/helpers";
import { applyPartyCredit } from "../utils/partyCredit";

export default function registerExpenseIPC() {
  ipcMain.handle("create-expense", async (event, data) => {
    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      if (!data.date || !Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("MISSING_REQUIRED_FIELDS");
      }

      const dateOnly = data.date.slice(0, 10);
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      const fullDateTime = `${dateOnly} ${time}`;

      const requestedTaxIds = Array.isArray(data.taxes)
        ? [...new Set(data.taxes.filter(Boolean))]
        : [];

      const invoiceTaxes = [];
      for (const taxId of requestedTaxIds) {
        const { rows } = await q(
          `SELECT id, name, rate FROM taxes WHERE id = $1 AND category IN ('invoice', 'both')`,
          [taxId],
        );
        const taxRow = rows[0];
        if (!taxRow) {
          throw new Error("INVALID_TAX_ID");
        }
        invoiceTaxes.push({
          tax_id: taxRow.id,
          tax_name: taxRow.name,
          tax_rate: Number(taxRow.rate || 0),
        });
      }

      const invoiceDiscountRate = Math.min(
        100,
        Math.max(0, Number(data.discount_rate || 0)),
      );

      const preparedItems = [];
      let subtotal = 0;
      let itemDiscountTotal = 0;
      let itemTaxTotal = 0;

      for (const item of data.items) {
        const price = Number(item.price || 0);

        if (!item.category_id || price < 0) {
          throw new Error("INVALID_ITEM_DATA");
        }

        const total = price;

        const discountRate = Math.min(
          100,
          Math.max(0, Number(item.discount_rate || 0)),
        );
        const discount = Number(((total * discountRate) / 100).toFixed(2));
        const afterDiscount = total - discount;

        let taxId = null;
        let taxRate = 0;

        if (item.tax_id) {
          const { rows } = await q(
            `SELECT rate FROM taxes WHERE id = $1 AND category IN ('product', 'both')`,
            [item.tax_id],
          );
          const taxRow = rows[0];
          if (!taxRow) {
            throw new Error("INVALID_ITEM_TAX_ID");
          }
          taxId = item.tax_id;
          taxRate = Number(taxRow.rate || 0);
        }

        const taxValue = Number(((afterDiscount * taxRate) / 100).toFixed(2));

        subtotal += total;
        itemDiscountTotal += discount;
        itemTaxTotal += taxValue;

        preparedItems.push({
          category_id: item.category_id,
          price,
          total,
          discount_rate: discountRate,
          discount,
          tax_id: taxId,
          tax_rate: taxRate,
          tax_value: taxValue,
          description: item.description || null,
        });
      }

      subtotal = Number(subtotal.toFixed(2));
      itemDiscountTotal = Number(itemDiscountTotal.toFixed(2));
      itemTaxTotal = Number(itemTaxTotal.toFixed(2));

      if (subtotal <= 0) {
        throw new Error("INVALID_TOTALS");
      }

      const afterItemDiscounts = subtotal - itemDiscountTotal;

      const invoiceDiscount = Number(
        ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2),
      );
      const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

      let invoiceTaxValueTotal = 0;
      const preparedInvoiceTaxes = invoiceTaxes.map((tax) => {
        const value = Number(
          ((afterInvoiceDiscount * tax.tax_rate) / 100).toFixed(2),
        );
        invoiceTaxValueTotal += value;
        return { ...tax, tax_value: value };
      });
      invoiceTaxValueTotal = Number(invoiceTaxValueTotal.toFixed(2));

      const invoiceTaxRateSum = Number(
        invoiceTaxes.reduce((sum, t) => sum + t.tax_rate, 0).toFixed(2),
      );

      const netTotal = Number(
        Math.max(
          0,
          afterInvoiceDiscount + itemTaxTotal + invoiceTaxValueTotal,
        ).toFixed(2),
      );

      const payment = data.payment || null;
      const isPaid = !!payment;
      const isCredit = payment?.source === "credit";

      if (isPaid && !isCredit) {
        if (!payment.fund_id) {
          throw new Error("FUND_REQUIRED");
        }
        if (!payment.amount || Number(payment.amount) <= 0) {
          throw new Error("INVALID_PAYMENT_AMOUNT");
        }
      }

      if (
        isPaid &&
        isCredit &&
        (!payment.amount || Number(payment.amount) <= 0)
      ) {
        throw new Error("INVALID_CREDIT_AMOUNT");
      }

      const invoiceResult = await q(
        `INSERT INTO expense
         (supplier_id, invoice_name, description, date,
          subtotal, discount, discount_rate, tax_rate, tax_value,
          net_total, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          data.supplier_id || null,
          data.invoice_name?.trim() || null,
          data.description || null,
          fullDateTime,
          subtotal,
          invoiceDiscount,
          invoiceDiscountRate,
          invoiceTaxRateSum,
          invoiceTaxValueTotal,
          netTotal,
          data.created_by,
        ],
      );
      const invoiceId = invoiceResult.rows[0].id;

      let invoiceName = data.invoice_name?.trim();
      if (!invoiceName) {
        invoiceName = await buildDefaultInvoiceName(q, "expense", invoiceId);
        await q(`UPDATE expense SET invoice_name = $1 WHERE id = $2`, [
          invoiceName,
          invoiceId,
        ]);
      }

      for (const tax of preparedInvoiceTaxes) {
        await q(
          `INSERT INTO expense_taxes (expense_id, tax_id, tax_name, tax_rate, tax_value)
           VALUES ($1,$2,$3,$4,$5)`,
          [invoiceId, tax.tax_id, tax.tax_name, tax.tax_rate, tax.tax_value],
        );
      }

      for (const item of preparedItems) {
        await q(
          `INSERT INTO expense_items
           (expense_id, category_id, price, total,
            discount, discount_rate, tax_id, tax_rate, tax_value, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            invoiceId,
            item.category_id,
            item.price,
            item.total,
            item.discount,
            item.discount_rate,
            item.tax_id,
            item.tax_rate,
            item.tax_value,
            item.description,
          ],
        );
      }

      if (data.supplier_id) {
        await createPartyHistory(q, {
          party_type: "supplier",
          party_id: data.supplier_id,
          invoice_id: invoiceId,
          invoice_type: "expense",
          record_type: "invoice",
          movement_type: "increase",
          amount: netTotal,
          date: fullDateTime,
          note: invoiceName,
        });
      }

      let insertPaymentId = null;
      let creditApplied = null;

      if (isPaid && isCredit) {
        creditApplied = await applyPartyCredit(q, {
          partyId: payment.party_id,
          partyType: payment.party_type,
          invoiceId,
          invoiceType: "expense",
          amount: payment.amount,
        });
      } else if (isPaid) {
        insertPaymentId = await createPayment(q, {
          type: payment.type,
          party_type: payment.party_type,
          party_id: payment.party_id,
          fund_id: payment.fund_id,
          amount: payment.amount,
          amount_fund_currency: payment.collected_amount,
          currency_code: payment.currency_code,
          exchange_rate: payment.exchange_rate,
          effective_rate: payment.effective_rate,
          invoice_id: invoiceId,
          invoice_type: payment.mode,
          note: `${invoiceName}`,
          date: fullDateTime,
          created_by: data.created_by,
        });

        await createFundHistory(q, {
          fund_id: payment.fund_id,
          record_type: "payment",
          payment_id: insertPaymentId,
          movement_type: "out",
          amount: payment.collected_amount,
          date: fullDateTime,
          note: invoiceName,
        });
      }

      await client.query("COMMIT");
      return {
        success: true,
        invoiceId,
        invoiceName,
        paymentId: insertPaymentId,
        creditApplied,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });

  ipcMain.handle("get-expenses", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const {
      startDate,
      endDate,
      supplier_id,
      status,
      minTotal,
      maxTotal,
      category_id,
    } = params;

    const whereConditions = [];
    const whereValues = [];
    let paramIndex = 1;

    if (startDate) {
      whereConditions.push(`e.date::date >= $${paramIndex}::date`);
      whereValues.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      whereConditions.push(`e.date::date <= $${paramIndex}::date`);
      whereValues.push(endDate);
      paramIndex++;
    }
    if (supplier_id === "none") {
      whereConditions.push("e.supplier_id IS NULL");
    } else if (supplier_id) {
      whereConditions.push(`e.supplier_id = $${paramIndex}`);
      whereValues.push(supplier_id);
      paramIndex++;
    }
    if (Array.isArray(params.taxIds) && params.taxIds.length) {
      const taxPlaceholders = params.taxIds
        .map(() => `$${paramIndex++}`)
        .join(",");
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM expense_taxes et
          WHERE et.expense_id = e.id AND et.tax_id IN (${taxPlaceholders})
        )
      `);
      whereValues.push(...params.taxIds);
    }
    if (minTotal !== undefined && minTotal !== "" && minTotal !== null) {
      whereConditions.push(`e.net_total >= $${paramIndex}`);
      whereValues.push(Number(minTotal));
      paramIndex++;
    }
    if (maxTotal !== undefined && maxTotal !== "" && maxTotal !== null) {
      whereConditions.push(`e.net_total <= $${paramIndex}`);
      whereValues.push(Number(maxTotal));
      paramIndex++;
    }
    if (category_id) {
      whereConditions.push(
        `EXISTS (SELECT 1 FROM expense_items ei WHERE ei.expense_id = e.id AND ei.category_id = $${paramIndex})`,
      );
      whereValues.push(category_id);
      paramIndex++;
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    const statusExpr = `
      CASE
        WHEN COALESCE(SUM(pa.amount), 0) >= e.net_total THEN 'paid'
        WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END
    `;
    const havingClause = status ? `HAVING ${statusExpr} = $${paramIndex}` : "";
    const havingValues = status ? [status] : [];
    if (status) paramIndex++;

    try {
      const { rows } = await query(
        `SELECT
          e.*,
          s.name AS supplier_name,
          s.phone AS supplier_phone,
          creator.full_name AS created_by_name,
          updater.full_name AS updated_by_name,

          COALESCE(SUM(pa.amount), 0) AS paid_amount,
          e.net_total - COALESCE(SUM(pa.amount), 0) AS remaining_amount,

          ${statusExpr} AS status,

          COALESCE(itemAgg.item_tax_total, 0) AS item_tax_total,
          COALESCE(itemAgg.item_discount_total, 0) AS item_discount_total,
          (e.tax_value + COALESCE(itemAgg.item_tax_total, 0)) AS total_tax_value,
          (e.discount + COALESCE(itemAgg.item_discount_total, 0)) AS total_discount_value,

          expenseTaxAgg.taxes_json,

          (
            SELECT STRING_AGG(DISTINCT ec.name, ', ')
            FROM expense_items ei2
            JOIN expense_category ec ON ec.id = ei2.category_id
            WHERE ei2.expense_id = e.id
          ) AS category_names

        FROM expense e

        LEFT JOIN suppliers s ON s.id = e.supplier_id
        LEFT JOIN users creator ON creator.id = e.created_by
        LEFT JOIN users updater ON updater.id = e.updated_by

        LEFT JOIN payment_allocations pa
          ON pa.invoice_id = e.id
         AND pa.invoice_type = 'expense'

        LEFT JOIN (
          SELECT
            expense_id,
            SUM(tax_value) AS item_tax_total,
            SUM(discount) AS item_discount_total
          FROM expense_items
          GROUP BY expense_id
        ) itemAgg ON itemAgg.expense_id = e.id

        LEFT JOIN (
          SELECT
            expense_id,
            json_agg(
              json_build_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
            ) AS taxes_json
          FROM expense_taxes
          GROUP BY expense_id
        ) expenseTaxAgg ON expenseTaxAgg.expense_id = e.id

        ${whereClause}

        GROUP BY e.id, s.name, s.phone, creator.full_name, updater.full_name,
                 itemAgg.item_tax_total, itemAgg.item_discount_total, expenseTaxAgg.taxes_json

        ${havingClause}

        ORDER BY e.id DESC

        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...whereValues, ...havingValues, limit, offset],
      );

      const { rows: totalRows } = await query(
        `SELECT COUNT(*) AS total
         FROM (
           SELECT e.id
           FROM expense e
           LEFT JOIN payment_allocations pa
             ON pa.invoice_id = e.id
            AND pa.invoice_type = 'expense'
           ${whereClause}
           GROUP BY e.id
           ${status ? `HAVING ${statusExpr} = $${whereValues.length + 1}` : ""}
         ) sub`,
        [...whereValues, ...(status ? [status] : [])],
      );
      const total = Number(totalRows[0].total);

      const rowsWithParsedTaxes = rows.map((row) => ({
        ...row,
        taxes: row.taxes_json || [],
      }));

      return {
        data: rowsWithParsedTaxes,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      };
    } catch (err) {
      console.error("Failed to load expenses:", err);
      return { data: [], page, limit, total: 0, totalPages: 1 };
    }
  });

  ipcMain.handle("get-expense", async (event, id) => {
    try {
      const { rows: invoiceRows } = await query(
        `SELECT
          e.*,
          s.name AS supplier_name,
          s.phone AS supplier_phone,
          creator.full_name AS created_by_name,
          updater.full_name AS updated_by_name,
          COALESCE(pa_sum.paid_amount, 0) AS paid_amount,
          e.net_total - COALESCE(pa_sum.paid_amount, 0) AS remaining_amount,

          CASE
            WHEN COALESCE(pa_sum.paid_amount, 0) >= e.net_total THEN 'paid'
            WHEN COALESCE(pa_sum.paid_amount, 0) > 0 THEN 'partial'
            ELSE 'unpaid'
          END AS status

        FROM expense e
        LEFT JOIN users creator ON creator.id = e.created_by
        LEFT JOIN users updater ON updater.id = e.updated_by
        LEFT JOIN suppliers s ON s.id = e.supplier_id
        LEFT JOIN (
          SELECT invoice_id, SUM(amount) AS paid_amount
          FROM payment_allocations
          WHERE invoice_type = 'expense'
          GROUP BY invoice_id
        ) pa_sum ON pa_sum.invoice_id = e.id
        WHERE e.id = $1`,
        [id],
      );
      const invoice = invoiceRows[0];

      if (!invoice) return null;

      const { rows: items } = await query(
        `SELECT
          ei.*,
          c.name AS category_name,
          t.name AS tax_name
        FROM expense_items ei
        LEFT JOIN expense_category c ON c.id = ei.category_id
        LEFT JOIN taxes t ON t.id = ei.tax_id
        WHERE ei.expense_id = $1`,
        [id],
      );

      const { rows: taxes } = await query(
        `SELECT id, tax_id, tax_name, tax_rate, tax_value
         FROM expense_taxes
         WHERE expense_id = $1
         ORDER BY id ASC`,
        [id],
      );

      const { rows: allocations } = await query(
        `SELECT
          pa.id,
          pa.payment_id,
          pa.amount,
          p.date,
          p.fund_id,
          f.name AS fund_name,
          c.code AS fund_currency_code,
          c.symbol AS fund_currency_symbol
        FROM payment_allocations pa
        LEFT JOIN payments p ON p.id = pa.payment_id
        LEFT JOIN funds f ON f.id = p.fund_id
        LEFT JOIN currencies c ON c.id = f.currency_id
        WHERE pa.invoice_id = $1
          AND pa.invoice_type = 'expense'
        ORDER BY pa.id ASC`,
        [id],
      );

      return {
        ...invoice,
        items,
        taxes,
        allocations,
      };
    } catch (err) {
      console.error("Failed to load expense:", err);
      return null;
    }
  });

  ipcMain.handle("update-expense", async (event, data) => {
    if (
      !data.id ||
      !data.date ||
      !Array.isArray(data.items) ||
      data.items.length === 0
    ) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      const { rows: oldInvoiceRows } = await q(
        `SELECT * FROM expense WHERE id = $1`,
        [data.id],
      );
      const oldInvoice = oldInvoiceRows[0];

      if (!oldInvoice) {
        throw new Error("EXPENSE_NOT_FOUND");
      }

      const { rows: existingPaymentRows } = await q(
        `SELECT pa.id
         FROM payment_allocations pa
         WHERE pa.invoice_id = $1 AND pa.invoice_type = 'expense'
         LIMIT 1`,
        [data.id],
      );

      if (existingPaymentRows[0]) {
        throw new Error("CANNOT_EDIT_PAID_EXPENSE");
      }

      const oldSupplierId = oldInvoice.supplier_id || null;
      const newSupplierId = data.supplier_id || null;

      const dateOnly = data.date.slice(0, 10);
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      const fullDateTime = `${dateOnly} ${time}`;

      const requestedTaxIds = Array.isArray(data.taxes)
        ? [...new Set(data.taxes.filter(Boolean))]
        : [];

      const invoiceTaxes = [];
      for (const taxId of requestedTaxIds) {
        const { rows } = await q(
          `SELECT id, name, rate FROM taxes WHERE id = $1 AND category IN ('invoice', 'both')`,
          [taxId],
        );
        const taxRow = rows[0];
        if (!taxRow) {
          throw new Error("INVALID_TAX_ID");
        }
        invoiceTaxes.push({
          tax_id: taxRow.id,
          tax_name: taxRow.name,
          tax_rate: Number(taxRow.rate || 0),
        });
      }

      const invoiceDiscountRate = Math.min(
        100,
        Math.max(0, Number(data.discount_rate || 0)),
      );

      const preparedItems = [];
      let subtotal = 0;
      let itemDiscountTotal = 0;
      let itemTaxTotal = 0;

      for (const item of data.items) {
        const price = Number(item.price || 0);

        if (!item.category_id || price < 0) {
          throw new Error("INVALID_ITEM_DATA");
        }

        const total = price;

        const discountRate = Math.min(
          100,
          Math.max(0, Number(item.discount_rate || 0)),
        );
        const discount = Number(((total * discountRate) / 100).toFixed(2));
        const afterDiscount = total - discount;

        let taxId = null;
        let taxRate = 0;

        if (item.tax_id) {
          const { rows } = await q(
            `SELECT rate FROM taxes WHERE id = $1 AND category IN ('product', 'both')`,
            [item.tax_id],
          );
          const taxRow = rows[0];
          if (!taxRow) {
            throw new Error("INVALID_ITEM_TAX_ID");
          }
          taxId = item.tax_id;
          taxRate = Number(taxRow.rate || 0);
        }

        const taxValue = Number(((afterDiscount * taxRate) / 100).toFixed(2));

        subtotal += total;
        itemDiscountTotal += discount;
        itemTaxTotal += taxValue;

        preparedItems.push({
          category_id: item.category_id,
          price,
          total,
          discount_rate: discountRate,
          discount,
          tax_id: taxId,
          tax_rate: taxRate,
          tax_value: taxValue,
          description: item.description || null,
        });
      }

      subtotal = Number(subtotal.toFixed(2));
      itemDiscountTotal = Number(itemDiscountTotal.toFixed(2));
      itemTaxTotal = Number(itemTaxTotal.toFixed(2));

      if (subtotal <= 0) {
        throw new Error("INVALID_TOTALS");
      }

      const afterItemDiscounts = subtotal - itemDiscountTotal;

      const invoiceDiscount = Number(
        ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2),
      );
      const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

      let invoiceTaxValueTotal = 0;
      const preparedInvoiceTaxes = invoiceTaxes.map((tax) => {
        const value = Number(
          ((afterInvoiceDiscount * tax.tax_rate) / 100).toFixed(2),
        );
        invoiceTaxValueTotal += value;
        return { ...tax, tax_value: value };
      });
      invoiceTaxValueTotal = Number(invoiceTaxValueTotal.toFixed(2));

      const invoiceTaxRateSum = Number(
        invoiceTaxes.reduce((sum, t) => sum + t.tax_rate, 0).toFixed(2),
      );

      const netTotal = Number(
        Math.max(
          0,
          afterInvoiceDiscount + itemTaxTotal + invoiceTaxValueTotal,
        ).toFixed(2),
      );

      const invoiceName =
        data.invoice_name?.trim() ||
        oldInvoice.invoice_name ||
        (await buildDefaultInvoiceName(q, "expense", data.id));

      await q(
        `UPDATE expense
         SET supplier_id = $1,
             invoice_name = $2,
             description = $3,
             date = $4,
             subtotal = $5,
             discount = $6,
             discount_rate = $7,
             tax_rate = $8,
             tax_value = $9,
             net_total = $10,
             updated_by = $11
         WHERE id = $12`,
        [
          newSupplierId,
          invoiceName,
          data.description || null,
          fullDateTime,
          subtotal,
          invoiceDiscount,
          invoiceDiscountRate,
          invoiceTaxRateSum,
          invoiceTaxValueTotal,
          netTotal,
          data.updated_by,
          data.id,
        ],
      );

      await q(`DELETE FROM expense_items WHERE expense_id = $1`, [data.id]);

      for (const item of preparedItems) {
        await q(
          `INSERT INTO expense_items
           (expense_id, category_id, price, total,
            discount, discount_rate, tax_id, tax_rate, tax_value, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            data.id,
            item.category_id,
            item.price,
            item.total,
            item.discount,
            item.discount_rate,
            item.tax_id,
            item.tax_rate,
            item.tax_value,
            item.description,
          ],
        );
      }

      await q(`DELETE FROM expense_taxes WHERE expense_id = $1`, [data.id]);

      for (const tax of preparedInvoiceTaxes) {
        await q(
          `INSERT INTO expense_taxes (expense_id, tax_id, tax_name, tax_rate, tax_value)
           VALUES ($1,$2,$3,$4,$5)`,
          [data.id, tax.tax_id, tax.tax_name, tax.tax_rate, tax.tax_value],
        );
      }

      if (oldSupplierId && oldSupplierId === newSupplierId) {
        await q(
          `UPDATE party_history
           SET amount = $1, date = $2, note = $3
           WHERE invoice_id = $4 AND invoice_type = 'expense' AND record_type = 'invoice'`,
          [netTotal, fullDateTime, invoiceName, data.id],
        );
      } else {
        if (oldSupplierId) {
          await q(
            `DELETE FROM party_history
             WHERE invoice_id = $1 AND invoice_type = 'expense' AND record_type = 'invoice'`,
            [data.id],
          );
        }

        if (newSupplierId) {
          await createPartyHistory(q, {
            party_type: "supplier",
            party_id: newSupplierId,
            invoice_id: data.id,
            invoice_type: "expense",
            record_type: "invoice",
            movement_type: "increase",
            amount: netTotal,
            date: fullDateTime,
            note: invoiceName,
          });
        }
      }

      const payment = data.payment || null;
      let insertPaymentId = null;

      if (payment && Number(payment.amount || 0) > 0) {
        insertPaymentId = await createPayment(q, {
          type: payment.type,
          party_type: payment.party_type,
          party_id: payment.party_id,
          fund_id: payment.fund_id,
          amount: payment.amount,
          amount_fund_currency: payment.collected_amount,
          currency_code: payment.currency_code,
          exchange_rate: payment.exchange_rate,
          effective_rate: payment.effective_rate,
          invoice_id: data.id,
          invoice_type: payment.mode,
          note: payment.note || invoiceName,
          date: fullDateTime,
          created_by: data.created_by,
        });

        await createFundHistory(q, {
          fund_id: payment.fund_id,
          record_type: "payment",
          payment_id: insertPaymentId,
          movement_type: "out",
          amount: payment.collected_amount,
          date: fullDateTime,
          note: payment.note || invoiceName,
        });
      }

      await client.query("COMMIT");
      return { success: true, invoiceId: data.id, paymentId: insertPaymentId };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });

  ipcMain.handle("delete-expense", async (event, id) => {
    try {
      const { rows: existingPaymentRows } = await query(
        `SELECT pa.id
         FROM payment_allocations pa
         WHERE pa.invoice_id = $1 AND pa.invoice_type = 'expense'
         LIMIT 1`,
        [id],
      );

      if (existingPaymentRows[0]) {
        return { success: false, error: "CANNOT_DELETE_PAID_EXPENSE" };
      }

      const client = await getClient();
      try {
        await client.query("BEGIN");

        await client.query(`DELETE FROM expense_items WHERE expense_id = $1`, [
          id,
        ]);
        await client.query(`DELETE FROM expense_taxes WHERE expense_id = $1`, [
          id,
        ]);
        await client.query(
          `DELETE FROM party_history
           WHERE invoice_id = $1
             AND invoice_type = 'expense'
             AND record_type = 'invoice'`,
          [id],
        );
        await client.query(`DELETE FROM expense WHERE id = $1`, [id]);

        await client.query("COMMIT");
        return { success: true };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
