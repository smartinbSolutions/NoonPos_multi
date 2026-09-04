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

export default function registerSalesReturnsIpc() {
  ipcMain.handle("create-sales-return", async (event, data) => {
    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      if (
        !data.sales_invoice_id ||
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
        `SELECT discount_rate, channel FROM sales_invoices WHERE id = $1`,
        [data.sales_invoice_id],
      );
      const originalInvoice = originalInvoiceRows[0];

      if (!originalInvoice) {
        throw new Error("SALES_INVOICE_NOT_FOUND");
      }

      const { rows: originalInvoiceTaxes } = await q(
        `SELECT tax_id, tax_name, tax_rate FROM sales_invoice_taxes WHERE invoice_id = $1`,
        [data.sales_invoice_id],
      );

      const invoiceDiscountRate = Number(originalInvoice.discount_rate || 0);
      const channel = originalInvoice.channel || "manual";

      const preparedItems = [];
      let subtotal = 0;
      let itemDiscountTotal = 0;
      let itemTaxTotal = 0;

      for (const item of data.items) {
        const quantityToReturnNow = Number(item.quantity || 0);

        if (!item.sales_invoice_item_id || quantityToReturnNow <= 0) {
          throw new Error("INVALID ITEM DATA");
        }

        const { rows: originalItemRows } = await q(
          `SELECT
            quantity, price, total, discount, discount_rate,
            tax_id, tax_rate, tax_value,
            product_name, product_code, unit_name, unit_conversion_factor, description
           FROM sales_invoice_items
           WHERE id = $1`,
          [item.sales_invoice_item_id],
        );
        const originalItem = originalItemRows[0];

        if (!originalItem) {
          throw new Error(
            `PRODUCT_NOT_FOUND_IN_ORIGINAL_INVOICE: ${item.product_id}`,
          );
        }

        const { rows: returnedRows } = await q(
          `SELECT COALESCE(SUM(quantity), 0) AS total_returned
           FROM sales_return_items
           WHERE sales_invoice_item_id = $1`,
          [item.sales_invoice_item_id],
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
          sales_invoice_item_id: item.sales_invoice_item_id,
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

      const payments = Array.isArray(data.payments) ? data.payments : [];
      const isRefunded = payments.length > 0;

      if (isRefunded) {
        for (const p of payments) {
          if (!p.fund_id) throw new Error("FUND_REQUIRED");
          if (!p.amount || Number(p.amount) <= 0) {
            throw new Error("INVALID_PAYMENT_AMOUNT");
          }
        }
      }

      const returnResult = await q(
        `INSERT INTO sales_returns
         (sales_invoice_id, customer_id, channel, invoice_name, description, date,
          subtotal, discount, discount_rate, tax_rate, tax_value, net_total, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          data.sales_invoice_id,
          data.customer_id || null,
          channel,
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
          `INSERT INTO sales_return_taxes (return_id, tax_id, tax_name, tax_rate, tax_value)
           VALUES ($1,$2,$3,$4,$5)`,
          [returnId, tax.tax_id, tax.tax_name, tax.tax_rate, tax.tax_value],
        );
      }

      for (const item of preparedItems) {
        await q(
          `INSERT INTO sales_return_items
           (return_id, sales_invoice_item_id, product_id, quantity, price, total,
            product_name, product_code, unit_name, unit_conversion_factor,
            tax_id, tax_rate, tax_value, discount, discount_rate, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            returnId,
            item.sales_invoice_item_id,
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
            `UPDATE products SET quantity = quantity + $1 WHERE id = $2`,
            [item.quantity, item.product_id],
          );
        }

        await createProductMovement(q, {
          product_id: item.product_id,
          reference_id: returnId,
          reference_type: "sale_return",
          type: "in",
          action: "return",
          quantity: item.quantity,
          enterPrice: item.price,
          date: fullDateTime,
          base_unit_name: productRow?.base_unit_name || null,
          unit_name: item.unit_name,
          conversion_factor: item.unit_conversion_factor,
        });
      }

      await createPartyHistory(q, {
        party_type: "customer",
        party_id: data.customer_id || null,
        invoice_id: returnId,
        invoice_type: "sales_return",
        record_type: "return",
        movement_type: "decrease",
        amount: netTotal,
        date: fullDateTime,
        note: await buildDefaultReturnNote(
          q,
          "sales_return",
          returnId,
          data.sales_invoice_id,
        ),
      });

      const insertPaymentIds = [];

      for (const p of payments) {
        const paymentNote =
          p.note || (await buildDefaultPaymentNote(q, "refund", returnId));

        const paymentId = await createPayment(q, {
          type: p.type || "refund",
          party_type: "customer",
          party_id: data.customer_id || null,
          fund_id: p.fund_id,
          amount: p.amount,
          amount_fund_currency: p.amount_fund_currency,
          currency_code: p.currency_code,
          exchange_rate: p.exchange_rate,
          effective_rate: p.effective_rate,
          invoice_id: returnId,
          invoice_type: "sales_return",
          note: paymentNote,
          fundOperation: "subtract",
          date: fullDateTime,
        });

        await createFundHistory(q, {
          fund_id: p.fund_id,
          record_type: "payment",
          payment_id: paymentId,
          movement_type: "out",
          amount: p.amount_fund_currency,
          date: fullDateTime,
          note: paymentNote,
        });

        insertPaymentIds.push(paymentId);
      }

      await client.query("COMMIT");
      return { success: true, returnId, paymentIds: insertPaymentIds };
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

  // GET ALL
  ipcMain.handle("get-sales-returns", async (event, params = {}) => {
    try {
      const page = Math.max(1, Number(params.page) || 1);
      const limit = Math.max(1, Number(params.limit) || 20);
      const offset = (page - 1) * limit;

      const {
        dateFrom,
        dateTo,
        customerId,
        channel,
        status,
        minTotal,
        maxTotal,
      } = params;

      const whereConditions = [];
      const whereValues = [];
      let paramIndex = 1;

      if (dateFrom) {
        whereConditions.push(`sr.date::date >= $${paramIndex}::date`);
        whereValues.push(dateFrom);
        paramIndex++;
      }
      if (dateTo) {
        whereConditions.push(`sr.date::date <= $${paramIndex}::date`);
        whereValues.push(dateTo);
        paramIndex++;
      }
      if (customerId) {
        whereConditions.push(`sr.customer_id = $${paramIndex}`);
        whereValues.push(customerId);
        paramIndex++;
      }
      if (channel) {
        whereConditions.push(`sr.channel = $${paramIndex}`);
        whereValues.push(channel);
        paramIndex++;
      }
      if (minTotal !== undefined && minTotal !== "" && minTotal !== null) {
        whereConditions.push(`sr.net_total >= $${paramIndex}`);
        whereValues.push(Number(minTotal));
        paramIndex++;
      }
      if (maxTotal !== undefined && maxTotal !== "" && maxTotal !== null) {
        whereConditions.push(`sr.net_total <= $${paramIndex}`);
        whereValues.push(Number(maxTotal));
        paramIndex++;
      }

      if (Array.isArray(params.taxIds) && params.taxIds.length) {
        const taxPlaceholders = params.taxIds
          .map(() => `$${paramIndex++}`)
          .join(",");
        whereConditions.push(`
        EXISTS (
          SELECT 1 FROM sales_return_taxes srt
          WHERE srt.return_id = sr.id AND srt.tax_id IN (${taxPlaceholders})
        )
      `);
        whereValues.push(...params.taxIds);
      }

      const whereClause = whereConditions.length
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

      const havingClause = status
        ? `HAVING CASE
        WHEN COALESCE(SUM(pa.amount), 0) >= sr.net_total THEN 'paid'
        WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END = $${paramIndex}`
        : "";
      const havingValues = status ? [status] : [];
      if (status) paramIndex++;

      const { rows: returns } = await query(
        `SELECT
        sr.*,
        sr.date::text AS date,
        sr.subtotal::float AS subtotal,
        sr.discount::float AS discount,
        sr.tax_value::float AS tax_value,
        sr.net_total::float AS net_total,
        c.name AS customer_name,
        c.phone AS customer_phone,
        si.invoice_name AS original_invoice_name,
        creator.full_name AS created_by_name,

        returnTaxAgg.taxes_json,

        COALESCE(itemAgg.item_tax_total, 0)::float AS item_tax_total,
        COALESCE(itemAgg.item_discount_total, 0)::float AS item_discount_total,
        (sr.tax_value + COALESCE(itemAgg.item_tax_total, 0))::float AS total_tax_value,
        (sr.discount + COALESCE(itemAgg.item_discount_total, 0))::float AS total_discount_value,

        COALESCE(SUM(pa.amount), 0)::float AS refunded_amount,
        (sr.net_total - COALESCE(SUM(pa.amount), 0))::float AS remaining_amount,

        CASE
          WHEN COALESCE(SUM(pa.amount), 0) >= sr.net_total THEN 'paid'
          WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END AS status

      FROM sales_returns sr
      LEFT JOIN customers c ON c.id = sr.customer_id
      LEFT JOIN users creator ON creator.id = sr.created_by
      LEFT JOIN sales_invoices si ON si.id = sr.sales_invoice_id
      LEFT JOIN (
        SELECT
          return_id,
          SUM(tax_value) AS item_tax_total,
          SUM(discount) AS item_discount_total
        FROM sales_return_items
        GROUP BY return_id
      ) itemAgg ON itemAgg.return_id = sr.id
      LEFT JOIN (
        SELECT
          return_id,
          json_agg(
            json_build_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
          ) AS taxes_json
        FROM sales_return_taxes
        GROUP BY return_id
      ) returnTaxAgg ON returnTaxAgg.return_id = sr.id
      LEFT JOIN payment_allocations pa
        ON pa.invoice_id = sr.id AND pa.invoice_type = 'sales_return'

      ${whereClause}

      GROUP BY sr.id, c.name, c.phone, si.invoice_name, creator.full_name,
               returnTaxAgg.taxes_json, itemAgg.item_tax_total, itemAgg.item_discount_total

      ${havingClause}

      ORDER BY sr.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...whereValues, ...havingValues, limit, offset],
      );

      const { rows: totalRows } = await query(
        `SELECT COUNT(*) AS total FROM (
        SELECT
          sr.id,
          CASE
            WHEN COALESCE(SUM(pa.amount), 0) >= sr.net_total THEN 'paid'
            WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
            ELSE 'unpaid'
          END AS status
        FROM sales_returns sr
        LEFT JOIN payment_allocations pa
          ON pa.invoice_id = sr.id AND pa.invoice_type = 'sales_return'
        ${whereClause}
        GROUP BY sr.id
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
    } catch (err) {
      return { data: [], total: 0, totalPages: 1, error: err.message };
    }
  });

  // GET ONE
  ipcMain.handle("get-sales-return-by-id", async (event, id) => {
    const { rows: returnRows } = await query(
      `SELECT
      sr.*,
      sr.date::text AS date,
      sr.subtotal::float AS subtotal,
      sr.discount::float AS discount,
      sr.tax_value::float AS tax_value,
      sr.net_total::float AS net_total,
      c.name AS customer_name,
      c.phone AS customer_phone,
      creator.full_name AS created_by_name,
      si.invoice_name AS original_invoice_name,

      COALESCE(pa_sum.paid_amount, 0)::float AS paid_amount,
      (sr.net_total - COALESCE(pa_sum.paid_amount, 0))::float AS remaining_amount,

      CASE
        WHEN COALESCE(pa_sum.paid_amount, 0) >= sr.net_total THEN 'paid'
        WHEN COALESCE(pa_sum.paid_amount, 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END AS status

    FROM sales_returns sr
    LEFT JOIN customers c ON c.id = sr.customer_id
    LEFT JOIN users creator ON creator.id = sr.created_by
    LEFT JOIN sales_invoices si ON si.id = sr.sales_invoice_id
    LEFT JOIN (
      SELECT invoice_id, SUM(amount) AS paid_amount
      FROM payment_allocations
      WHERE invoice_type = 'sales_return'
      GROUP BY invoice_id
    ) pa_sum ON pa_sum.invoice_id = sr.id
    WHERE sr.id = $1`,
      [id],
    );
    const returnInvoice = returnRows[0];

    if (!returnInvoice) return null;

    const { rows: items } = await query(
      `SELECT
      sri.*,
      sri.quantity::float AS quantity,
      sri.price::float AS price,
      sri.total::float AS total,
      sri.discount::float AS discount,
      sri.discount_rate::float AS discount_rate,
      sri.tax_rate::float AS tax_rate,
      sri.tax_value::float AS tax_value,
      p.name AS name,
      t.name AS tax_name
    FROM sales_return_items sri
    LEFT JOIN products p ON p.id = sri.product_id
    LEFT JOIN taxes t ON t.id = sri.tax_id
    WHERE sri.return_id = $1`,
      [id],
    );

    const { rows: taxes } = await query(
      `SELECT id, tax_id, tax_name, tax_rate::float AS tax_rate, tax_value::float AS tax_value
     FROM sales_return_taxes
     WHERE return_id = $1
     ORDER BY id ASC`,
      [id],
    );

    const { rows: allocations } = await query(
      `SELECT
      pa.id,
      pa.payment_id,
      pa.amount::float AS amount,
      p.date::text AS date,
      p.fund_id,
      p.note,
      p.currency_code,
      p.exchange_rate::float AS exchange_rate,
      p.effective_rate::float AS effective_rate,
      p.amount_fund_currency::float AS amount_fund_currency,
      f.name AS fund_name,
      c.code AS fund_currency_code,
      c.symbol AS fund_currency_symbol
    FROM payment_allocations pa
    LEFT JOIN payments p ON p.id = pa.payment_id
    LEFT JOIN funds f ON f.id = p.fund_id
    LEFT JOIN currencies c ON c.id = f.currency_id
    WHERE pa.invoice_id = $1
      AND pa.invoice_type = 'sales_return'
    ORDER BY pa.id ASC`,
      [id],
    );

    return {
      ...returnInvoice,
      items,
      taxes,
      allocations,
    };
  });
}
