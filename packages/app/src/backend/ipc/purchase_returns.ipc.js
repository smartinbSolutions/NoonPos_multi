// packages/app/src/backend/purchaseReturn.ipc.js
import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";
import createFundHistory from "../utils/createFundHistory";
import createPayment from "../utils/createPayment";
import createPartyHistory from "../utils/createPaymentHistory";
import createProductMovement from "../utils/createPorductMovment";
import {
  buildDefaultPaymentNote,
  buildDefaultReturnNote,
} from "../utils/helpers";

export default function registerPurchaseReturnIPC() {
  ipcMain.handle("create-purchase-return", async (event, data) => {
    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      if (
        !data.supplier_id ||
        !data.purchase_invoice_id ||
        !data.date ||
        !Array.isArray(data.items) ||
        data.items.length === 0
      ) {
        throw new Error("ERROR ENTER DATA");
      }

      const dateOnly = data.date.slice(0, 10);
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      const fullDateTime = `${dateOnly} ${time}`;

      const { rows: originalInvoiceRows } = await q(
        `SELECT discount_rate FROM purchase_invoices WHERE id = $1`,
        [data.purchase_invoice_id],
      );
      const originalInvoice = originalInvoiceRows[0];

      if (!originalInvoice) {
        throw new Error("PURCHASE_INVOICE_NOT_FOUND");
      }

      const { rows: originalInvoiceTaxes } = await q(
        `SELECT tax_id, tax_name, tax_rate FROM purchase_invoice_taxes WHERE invoice_id = $1`,
        [data.purchase_invoice_id],
      );

      const invoiceDiscountRate = Number(originalInvoice.discount_rate || 0);

      const preparedItems = [];
      let subtotal = 0;
      let itemDiscountTotal = 0;
      let itemTaxTotal = 0;

      for (const item of data.items) {
        const quantityToReturnNow = Number(item.quantity || 0);

        if (!item.purchase_invoice_item_id || quantityToReturnNow <= 0) {
          throw new Error("INVALID ITEM DATA");
        }

        const { rows: originalItemRows } = await q(
          `SELECT
            quantity, price, total, discount, discount_rate,
            tax_id, tax_rate, tax_value,
            product_name, product_code, unit_name, unit_conversion_factor, description
          FROM purchase_invoice_items
          WHERE id = $1`,
          [item.purchase_invoice_item_id],
        );
        const originalItem = originalItemRows[0];

        if (!originalItem) {
          throw new Error(
            `PRODUCT_NOT_FOUND_IN_ORIGINAL_INVOICE: ${item.product_id}`,
          );
        }

        const { rows: returnedRows } = await q(
          `SELECT COALESCE(SUM(quantity), 0) AS total_returned
           FROM purchase_return_items
           WHERE purchase_invoice_item_id = $1`,
          [item.purchase_invoice_item_id],
        );
        const alreadyReturnedQty = Number(returnedRows[0]?.total_returned || 0);
        const maxAllowedToReturn =
          Number(originalItem.quantity) - alreadyReturnedQty;

        if (quantityToReturnNow > maxAllowedToReturn) {
          throw new Error(`EXCEEDED_RETURN_LIMIT: ${item.product_id}`);
        }

        const price = Number(originalItem.price || 0);
        const returnedTotal = Number((quantityToReturnNow * price).toFixed(2));

        const discountRate = Number(originalItem.discount_rate || 0);
        const returnedDiscount = Number(
          (returnedTotal * (discountRate / 100)).toFixed(2),
        );
        const returnedAfterDiscount = returnedTotal - returnedDiscount;

        const taxId = originalItem.tax_id || null;
        const taxRate = Number(originalItem.tax_rate || 0);
        const returnedTaxValue = Number(
          (returnedAfterDiscount * (taxRate / 100)).toFixed(2),
        );

        subtotal += returnedTotal;
        itemDiscountTotal += returnedDiscount;
        itemTaxTotal += returnedTaxValue;

        preparedItems.push({
          purchase_invoice_item_id: item.purchase_invoice_item_id,
          product_id: item.product_id,
          quantity: quantityToReturnNow,
          price,
          total: returnedTotal,
          product_name: originalItem.product_name || null,
          product_code: originalItem.product_code || null,
          unit_name: originalItem.unit_name || null,
          unit_conversion_factor: Number(
            originalItem.unit_conversion_factor || 1,
          ),
          tax_id: taxId,
          tax_rate: taxRate,
          taxValue: returnedTaxValue,
          discount: returnedDiscount,
          discount_rate: discountRate,
          description: originalItem.description || null,
        });
      }

      subtotal = Number(subtotal.toFixed(2));
      itemDiscountTotal = Number(itemDiscountTotal.toFixed(2));
      itemTaxTotal = Number(itemTaxTotal.toFixed(2));

      if (subtotal <= 0) throw new Error("INVALID TOTALS");

      const afterItemDiscounts = subtotal - itemDiscountTotal;
      const invoiceDiscount = Number(
        ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2),
      );
      const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

      let invoiceTaxValueTotal = 0;
      const preparedReturnTaxes = originalInvoiceTaxes.map((tax) => {
        const value = Number(
          ((afterInvoiceDiscount * tax.tax_rate) / 100).toFixed(2),
        );
        invoiceTaxValueTotal += value;
        return {
          tax_id: tax.tax_id,
          tax_name: tax.tax_name,
          tax_rate: tax.tax_rate,
          tax_value: value,
        };
      });
      invoiceTaxValueTotal = Number(invoiceTaxValueTotal.toFixed(2));

      const invoiceTaxRateSum = Number(
        originalInvoiceTaxes
          .reduce((sum, t) => sum + Number(t.tax_rate || 0), 0)
          .toFixed(2),
      );

      const netTotal = Number(
        Math.max(
          0,
          afterInvoiceDiscount + itemTaxTotal + invoiceTaxValueTotal,
        ).toFixed(2),
      );

      const payment = data.payment || null;
      const isRefunded = !!payment;

      if (isRefunded) {
        if (!payment.fund_id) throw new Error("FUND_REQUIRED");
        if (!payment.amount || Number(payment.amount) <= 0)
          throw new Error("INVALID_PAYMENT_AMOUNT");
      }

      const returnResult = await q(
        `INSERT INTO purchase_returns
         (purchase_invoice_id, supplier_id, invoice_name, description, date,
          subtotal, discount, discount_rate, tax_rate, tax_value,
          net_total, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          data.purchase_invoice_id,
          data.supplier_id,
          data.invoice_name || null,
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
      const returnId = returnResult.rows[0].id;

      for (const tax of preparedReturnTaxes) {
        await q(
          `INSERT INTO purchase_return_taxes (return_id, tax_id, tax_name, tax_rate, tax_value)
           VALUES ($1,$2,$3,$4,$5)`,
          [returnId, tax.tax_id, tax.tax_name, tax.tax_rate, tax.tax_value],
        );
      }

      for (const item of preparedItems) {
        await q(
          `INSERT INTO purchase_return_items
           (return_id, purchase_invoice_item_id, product_id, quantity, price, total,
            product_name, product_code, unit_name, unit_conversion_factor,
            tax_id, tax_rate, tax_value, discount, discount_rate, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            returnId,
            item.purchase_invoice_item_id,
            item.product_id,
            item.quantity,
            item.price,
            item.total,
            item.product_name,
            item.product_code,
            item.unit_name,
            item.unit_conversion_factor,
            item.tax_id,
            item.tax_rate,
            item.taxValue,
            item.discount,
            item.discount_rate,
            item.description,
          ],
        );

        const { rows: productRows } = await q(
          `SELECT p.type AS type, pu.unit_name AS base_unit_name
           FROM products p
           LEFT JOIN product_units pu
             ON pu.product_id = p.id AND pu.is_base = true
           WHERE p.id = $1`,
          [item.product_id],
        );
        const productRow = productRows[0];
        const isService = productRow?.type === "service";

        if (!isService) {
          await q(
            `UPDATE products SET quantity = quantity - $1 WHERE id = $2`,
            [item.quantity, item.product_id],
          );
        }

        await createProductMovement(q, {
          product_id: item.product_id,
          reference_id: returnId,
          reference_type: "purchase_return",
          type: "out",
          action: "return",
          quantity: item.quantity,
          enterPrice: item.price,
          date: fullDateTime,
          base_unit_name: productRow?.base_unit_name || null,
          unit_name: item.unit_name,
          conversion_factor: item.unit_conversion_factor,
        });
      }

      const returnNote = await buildDefaultReturnNote(
        q,
        "purchase_return",
        returnId,
        data.purchase_invoice_id,
      );

      await createPartyHistory(q, {
        party_type: "supplier",
        party_id: data.supplier_id,
        invoice_id: returnId,
        invoice_type: "purchase_return",
        record_type: "return",
        movement_type: "decrease",
        amount: netTotal,
        date: fullDateTime,
        note: returnNote,
      });

      let insertPaymentId = null;

      if (isRefunded) {
        const refundNote =
          payment.note ||
          (await buildDefaultPaymentNote(q, "refund", returnId));

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
          invoice_id: returnId,
          invoice_type: "purchase_return",
          note: refundNote,
          date: fullDateTime,
        });

        await createFundHistory(q, {
          fund_id: payment.fund_id,
          record_type: "payment",
          payment_id: insertPaymentId,
          movement_type: "in",
          amount: payment.collected_amount,
          date: fullDateTime,
          note: refundNote,
        });
      }

      await client.query("COMMIT");
      return { success: true, returnId, paymentId: insertPaymentId };
    } catch (err) {
      await client.query("ROLLBACK");
      return {
        success: false,
        error: err.message || String(err),
        code: err.code,
      };
    } finally {
      client.release();
    }
  });

  ipcMain.handle("get-purchase-returns", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const { dateFrom, dateTo, supplierId, status, minTotal, maxTotal } = params;

    const whereConditions = [];
    const whereValues = [];
    let paramIndex = 1;

    if (dateFrom) {
      whereConditions.push(`pr.date::date >= $${paramIndex}::date`);
      whereValues.push(dateFrom);
      paramIndex++;
    }
    if (dateTo) {
      whereConditions.push(`pr.date::date <= $${paramIndex}::date`);
      whereValues.push(dateTo);
      paramIndex++;
    }
    if (supplierId) {
      whereConditions.push(`pr.supplier_id = $${paramIndex}`);
      whereValues.push(supplierId);
      paramIndex++;
    }
    if (minTotal !== undefined && minTotal !== "" && minTotal !== null) {
      whereConditions.push(`pr.net_total >= $${paramIndex}`);
      whereValues.push(Number(minTotal));
      paramIndex++;
    }
    if (maxTotal !== undefined && maxTotal !== "" && maxTotal !== null) {
      whereConditions.push(`pr.net_total <= $${paramIndex}`);
      whereValues.push(Number(maxTotal));
      paramIndex++;
    }

    if (Array.isArray(params.taxIds) && params.taxIds.length) {
      const taxPlaceholders = params.taxIds
        .map(() => `$${paramIndex++}`)
        .join(",");
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM purchase_return_taxes prt
          WHERE prt.return_id = pr.id AND prt.tax_id IN (${taxPlaceholders})
        )
      `);
      whereValues.push(...params.taxIds);
    }

    // Postgres can't reference the "status" SELECT alias inside HAVING —
    // repeat the CASE expression instead, same fix used in expense.ipc.js
    // and customers.ipc.js.
    const statusExpr = `
      CASE
        WHEN COALESCE(SUM(pa.amount),0) >= pr.net_total THEN 'paid'
        WHEN COALESCE(SUM(pa.amount),0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END
    `;
    const havingClause = status ? `HAVING ${statusExpr} = $${paramIndex}` : "";
    const havingValues = status ? [status] : [];
    if (status) paramIndex++;

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    const { rows: returns } = await query(
      `SELECT
        pr.*,

        p.invoice_name AS purchase_invoice_name,
        p.date AS purchase_date,

        s.name AS supplier_name,
        s.phone AS supplier_phone,
        creator.full_name AS created_by_name,

        returnTaxAgg.taxes_json,

        COALESCE(itemAgg.item_tax_total, 0) AS item_tax_total,
        COALESCE(itemAgg.item_discount_total, 0) AS item_discount_total,
        (pr.tax_value + COALESCE(itemAgg.item_tax_total, 0)) AS total_tax_value,
        (pr.discount + COALESCE(itemAgg.item_discount_total, 0)) AS total_discount_value,

        COALESCE(SUM(pa.amount), 0) AS refunded_amount,
        pr.net_total - COALESCE(SUM(pa.amount), 0) AS remaining_amount,

        ${statusExpr} AS status

      FROM purchase_returns pr

      LEFT JOIN purchase_invoices p ON p.id = pr.purchase_invoice_id
      LEFT JOIN users creator ON creator.id = pr.created_by
      LEFT JOIN suppliers s ON s.id = pr.supplier_id

      LEFT JOIN (
        SELECT
          return_id,
          SUM(tax_value) AS item_tax_total,
          SUM(discount) AS item_discount_total
        FROM purchase_return_items
        GROUP BY return_id
      ) itemAgg ON itemAgg.return_id = pr.id

      LEFT JOIN (
        SELECT
          return_id,
          json_agg(
            json_build_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
          ) AS taxes_json
        FROM purchase_return_taxes
        GROUP BY return_id
      ) returnTaxAgg ON returnTaxAgg.return_id = pr.id

      LEFT JOIN payment_allocations pa
        ON pa.invoice_id = pr.id
       AND pa.invoice_type = 'purchase_return'

      ${whereClause}

      GROUP BY pr.id, p.invoice_name, p.date, s.name, s.phone, creator.full_name,
               returnTaxAgg.taxes_json, itemAgg.item_tax_total, itemAgg.item_discount_total

      ${havingClause}

      ORDER BY pr.id DESC

      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...whereValues, ...havingValues, limit, offset],
    );

    const { rows: totalRows } = await query(
      `SELECT COUNT(*) AS total FROM (
        SELECT
          pr.id,
          ${statusExpr} AS status
        FROM purchase_returns pr
        LEFT JOIN payment_allocations pa
          ON pa.invoice_id = pr.id
         AND pa.invoice_type = 'purchase_return'
        ${whereClause}
        GROUP BY pr.id
        ${havingClause}
      ) t`,
      [...whereValues, ...havingValues],
    );
    const total = Number(totalRows[0].total);

    const returnsWithParsedTaxes = returns.map((ret) => ({
      ...ret,
      taxes: ret.taxes_json || [],
    }));

    return {
      data: returnsWithParsedTaxes,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  ipcMain.handle("get-purchase-return", async (event, id) => {
    const { rows: returnRows } = await query(
      `SELECT
        pr.*,
        s.name AS supplier_name,
        s.phone AS supplier_phone,
        creator.full_name AS created_by_name,

        COALESCE(pa_sum.paid_amount, 0) AS paid_amount,
        pr.net_total - COALESCE(pa_sum.paid_amount, 0) AS remaining_amount,

        CASE
          WHEN COALESCE(pa_sum.paid_amount, 0) >= pr.net_total THEN 'paid'
          WHEN COALESCE(pa_sum.paid_amount, 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END AS status

      FROM purchase_returns pr
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      LEFT JOIN users creator ON creator.id = pr.created_by
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) AS paid_amount
        FROM payment_allocations
        WHERE invoice_type = 'purchase_return'
        GROUP BY invoice_id
      ) pa_sum ON pa_sum.invoice_id = pr.id

      WHERE pr.id = $1`,
      [id],
    );
    const returnInvoice = returnRows[0];

    if (!returnInvoice) return null;

    const { rows: items } = await query(
      `SELECT
        pri.*,
        p.name AS name,
        t.name AS tax_name
      FROM purchase_return_items pri
      LEFT JOIN products p ON p.id = pri.product_id
      LEFT JOIN taxes t ON t.id = pri.tax_id
      WHERE pri.return_id = $1`,
      [id],
    );

    const { rows: taxes } = await query(
      `SELECT id, tax_id, tax_name, tax_rate, tax_value
       FROM purchase_return_taxes
       WHERE return_id = $1
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
        p.note,
        p.currency_code,
        p.exchange_rate,
        p.effective_rate,
        p.amount_fund_currency,
        f.name AS fund_name,
        c.code AS fund_currency_code,
        c.symbol AS fund_currency_symbol
      FROM payment_allocations pa
      LEFT JOIN payments p ON p.id = pa.payment_id
      LEFT JOIN funds f ON f.id = p.fund_id
      LEFT JOIN currencies c ON c.id = f.currency_id
      WHERE pa.invoice_id = $1
        AND pa.invoice_type = 'purchase_return'
      ORDER BY pa.id ASC`,
      [id],
    );

    return { ...returnInvoice, items, taxes, allocations };
  });
}
