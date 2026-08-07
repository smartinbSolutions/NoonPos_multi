import { ipcMain } from "electron";
import createFundHistory from "../utils/createFundHistory";
import createPayment from "../utils/createPayment";
import createPartyHistory from "../utils/createPaymentHistory";
import createProductMovement from "../utils/createPorductMovment";
import {
  buildDefaultPaymentNote,
  buildDefaultReturnNote,
} from "../utils/helpers";
import db from "../db";

export default function registerSalesReturnsIpc() {
  ipcMain.handle("create-sales-return", (event, data) => {
    try {
      const transaction = db.transaction(() => {
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

        // ---- Original invoice's own rates + channel — reapplied to whatever
        // fraction of each item is being returned. Never trust anything
        // client-sent here; the invoice row (and its taxes) are the only
        // source of truth. ----
        const originalInvoice = db
          .prepare(
            `SELECT discount_rate, channel FROM sales_invoices WHERE id = ?`
          )
          .get(data.sales_invoice_id);

        if (!originalInvoice) {
          throw new Error("SALES_INVOICE_NOT_FOUND");
        }

        const originalInvoiceTaxes = db
          .prepare(
            `SELECT tax_id, tax_name, tax_rate FROM sales_invoice_taxes WHERE invoice_id = ?`
          )
          .all(data.sales_invoice_id);

        const invoiceDiscountRate = Number(originalInvoice.discount_rate || 0);
        const channel = originalInvoice.channel || "manual";

        const getOriginalItem = db.prepare(`
          SELECT
            quantity, price, total, discount, discount_rate,
            tax_id, tax_rate, taxValue,
            product_name, product_code , unit_name, unit_conversion_factor, description
          FROM sales_invoice_items
          WHERE id = ?
        `);

        const getAlreadyReturnedQty = db.prepare(`
          SELECT COALESCE(SUM(quantity), 0) AS total_returned
          FROM sales_return_items
          WHERE sales_invoice_item_id = ?
        `);

        // ---- Validate + compute the fractional-return cascade per item ----
        const preparedItems = [];
        let subtotal = 0;
        let itemDiscountTotal = 0;
        let itemTaxTotal = 0;

        for (const item of data.items) {
          const quantityToReturnNow = Number(item.quantity || 0);

          if (!item.sales_invoice_item_id || quantityToReturnNow <= 0) {
            throw new Error("INVALID ITEM DATA");
          }

          const originalItem = getOriginalItem.get(item.sales_invoice_item_id);

          if (!originalItem) {
            throw new Error(
              `PRODUCT_NOT_FOUND_IN_ORIGINAL_INVOICE: ${item.product_id}`
            );
          }

          const returnedRow = getAlreadyReturnedQty.get(
            item.sales_invoice_item_id
          );
          const alreadyReturnedQty = Number(returnedRow?.total_returned || 0);
          const maxAllowedToReturn =
            Number(originalItem.quantity) - alreadyReturnedQty;

          if (quantityToReturnNow > maxAllowedToReturn) {
            throw new Error(`EXCEEDED_RETURN_LIMIT: ${item.product_id}`);
          }

          const originalQuantity = Number(originalItem.quantity);
          const price = Number(originalItem.price || 0);
          const returnedTotal = Number(
            (quantityToReturnNow * price).toFixed(2)
          );

          const discountRate = Number(originalItem.discount_rate || 0);
          const returnedDiscount = Number(
            (returnedTotal * (discountRate / 100)).toFixed(2)
          );
          const returnedAfterDiscount = returnedTotal - returnedDiscount;

          const taxId = originalItem.tax_id || null;
          const taxRate = Number(originalItem.tax_rate || 0);
          const returnedTaxValue = Number(
            (returnedAfterDiscount * (taxRate / 100)).toFixed(2)
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
              originalItem.unit_conversion_factor || 1
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

        if (subtotal <= 0) {
          throw new Error("INVALID TOTALS");
        }

        const afterItemDiscounts = subtotal - itemDiscountTotal;

        const invoiceDiscount = Number(
          ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2)
        );
        const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

        // ---- Each of the ORIGINAL invoice's taxes reapplied independently
        // to the return's own afterInvoiceDiscount base (parallel model,
        // same as everywhere else), then summed ----
        let invoiceTaxValueTotal = 0;
        const preparedReturnTaxes = originalInvoiceTaxes.map((tax) => {
          const value = Number(
            ((afterInvoiceDiscount * tax.tax_rate) / 100).toFixed(2)
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
            .toFixed(2)
        );

        const netTotal = Number(
          Math.max(
            0,
            afterInvoiceDiscount + itemTaxTotal + invoiceTaxValueTotal
          ).toFixed(2)
        );

        // ---- Refund validation — sales keeps the multi-fund array, unlike
        // purchase's single payment, since POS refunds can split across
        // funds (cash/card/etc.) ----
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

        // ---- Insert return header — tax column dropped ----
        const returnResult = db
          .prepare(
            `
            INSERT INTO sales_returns
            (
              sales_invoice_id,
              customer_id,
              channel,
              invoice_name,
              description,
              date,
              subtotal,
              discount,
              discount_rate,
              taxRate,
              taxValue,
              net_total,
              created_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
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
            data.created_by
          );

        const returnId = returnResult.lastInsertRowid;

        // ---- Insert return-level tax rows ----
        const insertReturnTax = db.prepare(`
          INSERT INTO sales_return_taxes
          (return_id, tax_id, tax_name, tax_rate, tax_value)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const tax of preparedReturnTaxes) {
          insertReturnTax.run(
            returnId,
            tax.tax_id,
            tax.tax_name,
            tax.tax_rate,
            tax.tax_value
          );
        }

        // ---- Insert return items + restore stock + record movements ----
        const insertItem = db.prepare(`
          INSERT INTO sales_return_items
          (
            return_id, sales_invoice_item_id, product_id, quantity, price, total,
            product_name, product_code , unit_name, unit_conversion_factor,
            tax_id, tax_rate, taxValue,
            discount, discount_rate, description
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?)
        `);

        const updateStock = db.prepare(`
          UPDATE products SET quantity = quantity + ? WHERE id = ?
        `);

        for (const item of preparedItems) {
          insertItem.run(
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
            item.description
          );

          // Needed both to skip the stock restore for services (their
          // quantity was never decremented on sale, so it must not be
          // incremented back on return either) and to snapshot the current
          // base unit name onto the movement below.
          const productRow = db
            .prepare(
              `
              SELECT p.type AS type, pu.unit_name AS base_unit_name
              FROM products p
              LEFT JOIN product_units pu
                ON pu.product_id = p.id AND pu.is_base = 1
              WHERE p.id = ?
              `
            )
            .get(item.product_id);

          const isService = productRow?.type === "service";

          if (!isService) {
            updateStock.run(item.quantity, item.product_id);
          }

          createProductMovement(db, {
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

        // ---- Party history ----
        createPartyHistory(db, {
          party_type: "customer",
          party_id: data.customer_id || null,
          invoice_id: returnId,
          invoice_type: "sales_return",
          record_type: "return",
          movement_type: "decrease",
          amount: netTotal,
          date: fullDateTime,
          note: buildDefaultReturnNote(
            db,
            "sales_return",
            returnId,
            data.sales_invoice_id
          ),
        });

        // ---- Refund out through the same funds the sale came in through —
        // one payment + fund history row per fund ----
        const insertPaymentIds = [];

        for (const p of payments) {
          const paymentId = createPayment(db, {
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
            note: p.note || buildDefaultPaymentNote(db, "refund", returnId),
            fundOperation: "subtract",
            date: fullDateTime,
          });

          createFundHistory(db, {
            fund_id: p.fund_id,
            record_type: "payment",
            payment_id: paymentId,
            movement_type: "out",
            amount: p.amount_fund_currency,
            date: fullDateTime,
            note: buildDefaultPaymentNote(db, "refund", returnId),
          });

          insertPaymentIds.push(paymentId);
        }

        return { returnId, paymentIds: insertPaymentIds };
      });

      const result = transaction();
      return { success: true, ...result };
    } catch (err) {
      return {
        success: false,
        error: err.message || String(err),
        code: err.code,
      };
    }
  });

  // GET ALL — added item_tax_total/item_discount_total aggregation, matching purchase
  ipcMain.handle("get-sales-returns", (event, params = {}) => {
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

      if (dateFrom) {
        whereConditions.push("date(sr.date) >= date(?)");
        whereValues.push(dateFrom);
      }
      if (dateTo) {
        whereConditions.push("date(sr.date) <= date(?)");
        whereValues.push(dateTo);
      }
      if (customerId) {
        whereConditions.push("sr.customer_id = ?");
        whereValues.push(customerId);
      }
      if (channel) {
        whereConditions.push("sr.channel = ?");
        whereValues.push(channel);
      }
      if (minTotal !== undefined && minTotal !== "" && minTotal !== null) {
        whereConditions.push("sr.net_total >= ?");
        whereValues.push(Number(minTotal));
      }
      if (maxTotal !== undefined && maxTotal !== "" && maxTotal !== null) {
        whereConditions.push("sr.net_total <= ?");
        whereValues.push(Number(maxTotal));
      }

      if (Array.isArray(params.taxIds) && params.taxIds.length) {
        const taxPlaceholders = params.taxIds.map(() => "?").join(",");
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

      const havingClause = status ? `HAVING status = ?` : "";
      const havingValues = status ? [status] : [];

      const returns = db
        .prepare(
          `
        SELECT
          sr.*,
          c.name AS customer_name,
          c.phone AS customer_phone,
          si.invoice_name AS original_invoice_name,
          creator.full_name AS created_by_name,

          returnTaxAgg.taxes_json,
  
          COALESCE(itemAgg.item_tax_total, 0) AS item_tax_total,
          COALESCE(itemAgg.item_discount_total, 0) AS item_discount_total,
          (sr.taxValue + COALESCE(itemAgg.item_tax_total, 0)) AS total_tax_value,
          (sr.discount + COALESCE(itemAgg.item_discount_total, 0)) AS total_discount_value,
  
          COALESCE(SUM(pa.amount), 0) AS refunded_amount,
          sr.net_total - COALESCE(SUM(pa.amount), 0) AS remaining_amount,
  
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
            SUM(taxValue) AS item_tax_total,
            SUM(discount) AS item_discount_total
          FROM sales_return_items
          GROUP BY return_id
        ) itemAgg ON itemAgg.return_id = sr.id
        LEFT JOIN (
          SELECT
            return_id,
            json_group_array(
              json_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
            ) AS taxes_json
          FROM sales_return_taxes
          GROUP BY return_id
        ) returnTaxAgg ON returnTaxAgg.return_id = sr.id
        LEFT JOIN payment_allocations pa
          ON pa.invoice_id = sr.id
         AND pa.invoice_type = 'sales_return'
  
        ${whereClause}
  
        GROUP BY sr.id
  
        ${havingClause}
  
        ORDER BY sr.id DESC
        LIMIT ? OFFSET ?
        `
        )
        .all(...whereValues, ...havingValues, limit, offset);

      const { total } = db
        .prepare(
          `
        SELECT COUNT(*) AS total FROM (
          SELECT
            sr.id,
            CASE
              WHEN COALESCE(SUM(pa.amount), 0) >= sr.net_total THEN 'paid'
              WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
              ELSE 'unpaid'
            END AS status
          FROM sales_returns sr
          LEFT JOIN payment_allocations pa
            ON pa.invoice_id = sr.id
           AND pa.invoice_type = 'sales_return'
          ${whereClause}
          GROUP BY sr.id
          ${havingClause}
        )
        `
        )
        .get(...whereValues, ...havingValues).total;

      const returnsWithParsedTaxes = returns.map((ret) => ({
        ...ret,
        taxes: ret.taxes_json ? JSON.parse(ret.taxes_json) : [],
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
  ipcMain.handle("get-sales-return-by-id", (event, id) => {
    const returnInvoice = db
      .prepare(
        `
    SELECT
      sr.*,
      c.name AS customer_name,
      c.phone AS customer_phone,
      creator.full_name AS created_by_name,
      si.invoice_name AS original_invoice_name,
  
      COALESCE(pa_sum.paid_amount, 0) AS paid_amount,
      sr.net_total - COALESCE(pa_sum.paid_amount, 0) AS remaining_amount,
  
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
    WHERE sr.id = ?
    `
      )
      .get(id);

    if (!returnInvoice) return null;

    const items = db
      .prepare(
        `
    SELECT
      sri.*,
      p.name AS name,
      t.name AS tax_name
    FROM sales_return_items sri
    LEFT JOIN products p ON p.id = sri.product_id
    LEFT JOIN taxes t ON t.id = sri.tax_id
    WHERE sri.return_id = ?
    `
      )
      .all(id);

    // ---- Invoice-level taxes reapplied to this return, one row per tax ----
    const taxes = db
      .prepare(
        `
      SELECT id, tax_id, tax_name, tax_rate, tax_value
      FROM sales_return_taxes
      WHERE return_id = ?
      ORDER BY id ASC
      `
      )
      .all(id);

    // ---- Payment-side currency fields (currency_code, exchange_rate,
    // effective_rate, amount_fund_currency) added to match get-sales-invoice —
    // these come from `payments`, not `funds`, and are what the return view
    // actually needs to tell whether a given refund was paid out in a
    // different currency than the primary one. `fund_currency_code`/
    // `fund_currency_symbol` (the fund's own home currency) stay too, since
    // they're harmless to have around even though the current UI doesn't use
    // them.
    const allocations = db
      .prepare(
        `
    SELECT
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
    WHERE pa.invoice_id = ?
      AND pa.invoice_type = 'sales_return'
    ORDER BY pa.id ASC
    `
      )
      .all(id);

    return {
      ...returnInvoice,
      items,
      taxes,
      allocations,
    };
  });
}
