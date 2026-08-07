const { ipcMain } = require("electron");
import db from "../db";
import createFundHistory from "../utils/createFundHistory";
import createPayment from "../utils/createPayment";
import createPartyHistory from "../utils/createPaymentHistory";
import createProductMovement from "../utils/createPorductMovment";
import {
  buildDefaultPaymentNote,
  buildDefaultReturnNote,
} from "../utils/helpers";

export default function registerPurchaseReturnIPC() {
  // CREATE
  ipcMain.handle("create-purchase-return", (event, data) => {
    try {
      const transaction = db.transaction(() => {
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

        // ---- Original invoice's own rates — reapplied to whatever fraction
        // of each item is being returned. Never trust anything client-sent
        // here; the invoice row (and its taxes) are the only source of truth. ----
        const originalInvoice = db
          .prepare(`SELECT discount_rate FROM purchase_invoices WHERE id = ?`)
          .get(data.purchase_invoice_id);

        if (!originalInvoice) {
          throw new Error("PURCHASE_INVOICE_NOT_FOUND");
        }

        const originalInvoiceTaxes = db
          .prepare(
            `SELECT tax_id, tax_name, tax_rate FROM purchase_invoice_taxes WHERE invoice_id = ?`
          )
          .all(data.purchase_invoice_id);

        const invoiceDiscountRate = Number(originalInvoice.discount_rate || 0);

        const getOriginalItem = db.prepare(`
          SELECT
            quantity, price, total, discount, discount_rate,
            tax_id, tax_rate, taxValue,
            product_name, product_code , unit_name, unit_conversion_factor, description
          FROM purchase_invoice_items
          WHERE id = ?
        `);

        const getAlreadyReturnedQty = db.prepare(`
          SELECT COALESCE(SUM(quantity), 0) AS total_returned
          FROM purchase_return_items
          WHERE purchase_invoice_item_id = ?
        `);

        // ---- Validate + compute the fractional-return cascade per item ----
        const preparedItems = [];
        let subtotal = 0;
        let itemDiscountTotal = 0;
        let itemTaxTotal = 0;

        for (const item of data.items) {
          const quantityToReturnNow = Number(item.quantity || 0);

          if (!item.purchase_invoice_item_id || quantityToReturnNow <= 0) {
            throw new Error("INVALID ITEM DATA");
          }

          const originalItem = getOriginalItem.get(
            item.purchase_invoice_item_id
          );

          if (!originalItem) {
            throw new Error(
              `PRODUCT_NOT_FOUND_IN_ORIGINAL_INVOICE: ${item.product_id}`
            );
          }

          const returnedRow = getAlreadyReturnedQty.get(
            item.purchase_invoice_item_id
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
            purchase_invoice_item_id: item.purchase_invoice_item_id,
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
        // to the return's own afterInvoiceDiscount base (parallel model),
        // then summed ----
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

        // ---- Payment/refund validation (unchanged) ----
        const payment = data.payment || null;
        const isRefunded = !!payment;

        if (isRefunded) {
          if (!payment.fund_id) {
            throw new Error("FUND_REQUIRED");
          }
          if (!payment.amount || Number(payment.amount) <= 0) {
            throw new Error("INVALID_PAYMENT_AMOUNT");
          }
        }

        // ---- Insert return header — tax column dropped ----
        const returnResult = db
          .prepare(
            `
            INSERT INTO purchase_returns
            (
              purchase_invoice_id,
              supplier_id,
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
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
            data.created_by
          );

        const returnId = returnResult.lastInsertRowid;

        // ---- Insert return-level tax rows ----
        const insertReturnTax = db.prepare(`
          INSERT INTO purchase_return_taxes
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

        // ---- Insert return items + reverse stock + record movements ----
        const insertItem = db.prepare(`
          INSERT INTO purchase_return_items
          (
            return_id, purchase_invoice_item_id, product_id, quantity, price, total,
            product_name,  product_code , unit_name, unit_conversion_factor,
            tax_id, tax_rate, taxValue,
            discount, discount_rate, description
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?)
        `);

        const updateStock = db.prepare(`
          UPDATE products
          SET quantity = quantity - ?
          WHERE id = ?
        `);

        for (const item of preparedItems) {
          insertItem.run(
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
            item.description
          );

          // Needed both to skip the stock reversal for services (their
          // quantity was never incremented on purchase, so it must not be
          // decremented on return either) and to snapshot the current base
          // unit name onto the movement below.
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

        // ---- Party history, refund (unchanged) ----
        createPartyHistory(db, {
          party_type: "supplier",
          party_id: data.supplier_id,
          invoice_id: returnId,
          invoice_type: "purchase_return",
          record_type: "return",
          movement_type: "decrease",
          amount: netTotal,
          date: fullDateTime,
          note: buildDefaultReturnNote(
            db,
            "purchase_return",
            returnId,
            data.purchase_invoice_id
          ),
        });

        let insertPaymentId = null;

        if (isRefunded) {
          insertPaymentId = createPayment(db, {
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
            note:
              payment.note || buildDefaultPaymentNote(db, "refund", returnId),
            fundOperation: "add",
            date: fullDateTime,
          });

          createFundHistory(db, {
            fund_id: payment.fund_id,
            record_type: "payment",
            payment_id: insertPaymentId,
            movement_type: "in",
            amount: payment.collected_amount,
            date: fullDateTime,
            note: buildDefaultPaymentNote(db, "refund", returnId),
          });
        }

        return {
          returnId,
          paymentId: insertPaymentId,
        };
      });

      return {
        success: true,
        ...transaction(),
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || String(err),
        code: err.code,
      };
    }
  });
  // GET ALL
  ipcMain.handle("get-purchase-returns", (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const { dateFrom, dateTo, supplierId, status, minTotal, maxTotal } = params;

    const whereConditions = [];
    const whereValues = [];

    if (dateFrom) {
      whereConditions.push("date(pr.date) >= date(?)");
      whereValues.push(dateFrom);
    }
    if (dateTo) {
      whereConditions.push("date(pr.date) <= date(?)");
      whereValues.push(dateTo);
    }
    if (supplierId) {
      whereConditions.push("pr.supplier_id = ?");
      whereValues.push(supplierId);
    }
    if (minTotal !== undefined && minTotal !== "" && minTotal !== null) {
      whereConditions.push("pr.net_total >= ?");
      whereValues.push(Number(minTotal));
    }
    if (maxTotal !== undefined && maxTotal !== "" && maxTotal !== null) {
      whereConditions.push("pr.net_total <= ?");
      whereValues.push(Number(maxTotal));
    }

    if (Array.isArray(params.taxIds) && params.taxIds.length) {
      const taxPlaceholders = params.taxIds.map(() => "?").join(",");
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM purchase_return_taxes prt
          WHERE prt.return_id = pr.id AND prt.tax_id IN (${taxPlaceholders})
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
        pr.*,

        p.invoice_name AS purchase_invoice_name,
        p.date AS purchase_date,

        s.name AS supplier_name,
        s.phone AS supplier_phone,
        creator.full_name AS created_by_name,

        returnTaxAgg.taxes_json,

        COALESCE(itemAgg.item_tax_total, 0) AS item_tax_total,
        COALESCE(itemAgg.item_discount_total, 0) AS item_discount_total,
        (pr.taxValue + COALESCE(itemAgg.item_tax_total, 0)) AS total_tax_value,
        (pr.discount + COALESCE(itemAgg.item_discount_total, 0)) AS total_discount_value,

        COALESCE(
          SUM(pa.amount),
          0
        ) AS refunded_amount,
        pr.net_total - COALESCE(SUM(pa.amount), 0) AS remaining_amount,

        CASE
          WHEN COALESCE(SUM(pa.amount),0) >= pr.net_total
            THEN 'paid'

          WHEN COALESCE(SUM(pa.amount),0) > 0
            THEN 'partial'

          ELSE 'unpaid'
        END AS status


      FROM purchase_returns pr


      LEFT JOIN purchase_invoices p
        ON p.id = pr.purchase_invoice_id

      LEFT JOIN users creator
        ON creator.id = pr.created_by

      LEFT JOIN suppliers s
        ON s.id = pr.supplier_id

      LEFT JOIN (
        SELECT
          return_id,
          SUM(taxValue) AS item_tax_total,
          SUM(discount) AS item_discount_total
        FROM purchase_return_items
        GROUP BY return_id
      ) itemAgg ON itemAgg.return_id = pr.id

      LEFT JOIN (
        SELECT
          return_id,
          json_group_array(
            json_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
          ) AS taxes_json
        FROM purchase_return_taxes
        GROUP BY return_id
      ) returnTaxAgg ON returnTaxAgg.return_id = pr.id

      LEFT JOIN payment_allocations pa
        ON pa.invoice_id = pr.id
       AND pa.invoice_type = 'purchase_return'

      ${whereClause}

      GROUP BY pr.id

      ${havingClause}

      ORDER BY pr.id DESC


      LIMIT ? OFFSET ?
      `
      )
      .all(...whereValues, ...havingValues, limit, offset);

    const { total } = db
      .prepare(
        `
      SELECT COUNT(*) AS total FROM (
        SELECT
          pr.id,
          CASE
            WHEN COALESCE(SUM(pa.amount),0) >= pr.net_total THEN 'paid'
            WHEN COALESCE(SUM(pa.amount),0) > 0 THEN 'partial'
            ELSE 'unpaid'
          END AS status
        FROM purchase_returns pr
        LEFT JOIN payment_allocations pa
          ON pa.invoice_id = pr.id
         AND pa.invoice_type = 'purchase_return'
        ${whereClause}
        GROUP BY pr.id
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
  });
  // GET ONE
  ipcMain.handle("get-purchase-return", (event, id) => {
    const returnInvoice = db
      .prepare(
        `
    SELECT 
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

    LEFT JOIN suppliers s 
      ON s.id = pr.supplier_id

    LEFT JOIN users creator
      ON creator.id = pr.created_by

    LEFT JOIN (
      SELECT 
        invoice_id,
        SUM(amount) AS paid_amount
      FROM payment_allocations
      WHERE invoice_type = 'purchase_return'
      GROUP BY invoice_id
    ) pa_sum 
      ON pa_sum.invoice_id = pr.id

    WHERE pr.id = ?
    `
      )
      .get(id);

    if (!returnInvoice) return null;

    const items = db
      .prepare(
        `
    SELECT 
      pri.*,
      p.name AS name,
      t.name AS tax_name

    FROM purchase_return_items pri

    LEFT JOIN products p 
      ON p.id = pri.product_id

    LEFT JOIN taxes t
      ON t.id = pri.tax_id

    WHERE pri.return_id = ?
    `
      )
      .all(id);

    // ---- Invoice-level taxes reapplied to this return, one row per tax ----
    const taxes = db
      .prepare(
        `
      SELECT id, tax_id, tax_name, tax_rate, tax_value
      FROM purchase_return_taxes
      WHERE return_id = ?
      ORDER BY id ASC
      `
      )
      .all(id);

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

    LEFT JOIN payments p 
      ON p.id = pa.payment_id

    LEFT JOIN funds f 
      ON f.id = p.fund_id

    LEFT JOIN currencies c 
      ON c.id = f.currency_id

    WHERE pa.invoice_id = ?
      AND pa.invoice_type = 'purchase_return'

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
