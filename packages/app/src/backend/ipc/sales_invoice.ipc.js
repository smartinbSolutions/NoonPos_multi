const { ipcMain, BrowserWindow } = require("electron");
import db from "../db";
import {
  buildReceiptHtml,
  printReceiptHtml,
  receiptLabels,
  getReceiptLanguage,
} from "../services/receiptPrinter";
import createFundHistory from "../utils/createFundHistory";
import createPayment from "../utils/createPayment";
import createPartyHistory from "../utils/createPaymentHistory";
import createProductMovement from "../utils/createPorductMovment";
import {
  buildDefaultInvoiceName,
  buildDefaultPaymentNote,
} from "../utils/helpers";
import { applyPartyCredit } from "../utils/partyCredit";
import { query, getClient } from "../dbConnect.js";
import getDeviceHash from "../../main/license/getDeviceHash";
import { printViaRawEscpos } from "../services/rawPrintService";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export default function registerSalesInvoiceIPC() {
  // CREATE
  ipcMain.handle("create-sales-invoice", async (event, data) => {
    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      if (!data.date || !Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("ERROR ENTER DATA");
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
        if (!taxRow) throw new Error("INVALID_TAX_ID");
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
        const enteredQuantity = Number(item.entered_quantity || 0);
        const enteredPrice = Number(item.entered_price || 0);
        const factor = Number(item.unit_conversion_factor || 1);

        if (!item.product_id || enteredQuantity <= 0 || enteredPrice < 0) {
          throw new Error("INVALID ITEM DATA");
        }

        const baseQuantity = enteredQuantity * factor;
        const basePrice = factor > 0 ? enteredPrice / factor : enteredPrice;
        const total = enteredQuantity * enteredPrice;

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
          if (!taxRow) throw new Error("INVALID_ITEM_TAX_ID");
          taxId = item.tax_id;
          taxRate = Number(taxRow.rate || 0);
        }

        const taxValue = Number(((afterDiscount * taxRate) / 100).toFixed(2));

        subtotal += total;
        itemDiscountTotal += discount;
        itemTaxTotal += taxValue;

        const { rows: productRows } = await q(
          `SELECT p.cost_price AS cost_price, p.type AS type, p.code AS code, pu.unit_name AS base_unit_name
         FROM products p
         LEFT JOIN product_units pu
           ON pu.product_id = p.id AND pu.is_base = true
         WHERE p.id = $1`,
          [item.product_id],
        );
        const productRow = productRows[0];
        const buyingPrice = Number(productRow?.cost_price || 0);
        const isService = productRow?.type === "service";
        const baseUnitName = productRow?.base_unit_name || null;
        const productCode = productRow?.code || null;

        preparedItems.push({
          product_id: item.product_id,
          product_name: item.name || null,
          product_code: productCode,
          unit_name: item.unit_name || null,
          unit_conversion_factor: factor,
          baseQuantity,
          basePrice,
          buyingPrice,
          total,
          discount_rate: discountRate,
          discount,
          tax_id: taxId,
          tax_rate: taxRate,
          taxValue,
          description: item.description || null,
          isService,
          baseUnitName,
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
        if (!payment.fund_id) throw new Error("FUND_REQUIRED");
        if (!payment.amount || Number(payment.amount) <= 0)
          throw new Error("INVALID_PAYMENT_AMOUNT");
      }
      if (
        isPaid &&
        isCredit &&
        (!payment.amount || Number(payment.amount) <= 0)
      ) {
        throw new Error("INVALID_CREDIT_AMOUNT");
      }

      const invoiceResult = await q(
        `INSERT INTO sales_invoices
       (customer_id, invoice_name, description, channel, date,
        subtotal, discount, discount_rate, tax_rate, tax_value,
        created_by, updated_by, net_total)
       VALUES ($1,$2,$3,'manual',$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
        [
          data.customer_id || null,
          data.invoice_name?.trim() || null,
          data.description?.trim() || null,
          fullDateTime,
          subtotal,
          invoiceDiscount,
          invoiceDiscountRate,
          invoiceTaxRateSum,
          invoiceTaxValueTotal,
          data.created_by || null,
          null,
          netTotal,
        ],
      );
      const invoiceId = invoiceResult.rows[0].id;

      let invoiceName = data.invoice_name?.trim();
      if (!invoiceName) {
        invoiceName = await buildDefaultInvoiceName(q, "sales", invoiceId);
        await q(`UPDATE sales_invoices SET invoice_name = $1 WHERE id = $2`, [
          invoiceName,
          invoiceId,
        ]);
      }

      for (const tax of preparedInvoiceTaxes) {
        await q(
          `INSERT INTO sales_invoice_taxes (invoice_id, tax_id, tax_name, tax_rate, tax_value)
         VALUES ($1,$2,$3,$4,$5)`,
          [invoiceId, tax.tax_id, tax.tax_name, tax.tax_rate, tax.tax_value],
        );
      }

      for (const item of preparedItems) {
        await q(
          `INSERT INTO sales_invoice_items
         (invoice_id, product_id, quantity, price, buying_price, total,
          product_name, product_code, unit_name, unit_conversion_factor,
          tax_id, tax_rate, tax_value, discount, discount_rate, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            invoiceId,
            item.product_id,
            item.baseQuantity,
            item.basePrice,
            item.buyingPrice,
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

        if (!item.isService) {
          await q(
            `UPDATE products SET quantity = quantity - $1 WHERE id = $2`,
            [item.baseQuantity, item.product_id],
          );
        }

        await createProductMovement(q, {
          product_id: item.product_id,
          reference_id: invoiceId,
          reference_type: "sale",
          type: "out",
          action: "create",
          quantity: item.baseQuantity,
          outPrice: item.basePrice,
          date: fullDateTime,
          base_unit_name: item.baseUnitName,
          unit_name: item.unit_name,
          conversion_factor: item.unit_conversion_factor,
        });
      }

      if (data.customer_id) {
        await createPartyHistory(q, {
          party_type: "customer",
          party_id: data.customer_id,
          invoice_id: invoiceId,
          invoice_type: "sales",
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
          invoiceType: "sales",
          amount: payment.amount,
        });
      } else if (isPaid) {
        const paymentNote =
          payment.note ||
          (await buildDefaultPaymentNote(q, "payment", invoiceName));

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
          note: paymentNote,
          fundOperation: "add",
          date: fullDateTime,
          created_by: data.created_by,
        });

        await createFundHistory(q, {
          fund_id: payment.fund_id,
          record_type: "payment",
          payment_id: insertPaymentId,
          movement_type: "in",
          amount: payment.collected_amount,
          date: fullDateTime,
          note: paymentNote,
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
      return {
        success: false,
        error: err.message || String(err),
        code: err.code,
      };
    } finally {
      client.release();
    }
  });

  //  GET ALL SALES INVOICES
  ipcMain.handle("get-sales-invoices", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const whereConditions = [];
    const whereParams = [];
    const havingConditions = [];
    const havingParams = [];
    let paramIndex = 1;

    if (params.dateFrom) {
      whereConditions.push(`s.date::date >= $${paramIndex}::date`);
      whereParams.push(params.dateFrom);
      paramIndex++;
    }
    if (params.dateTo) {
      whereConditions.push(`s.date::date <= $${paramIndex}::date`);
      whereParams.push(params.dateTo);
      paramIndex++;
    }
    if (params.customerId) {
      whereConditions.push(`s.customer_id = $${paramIndex}`);
      whereParams.push(params.customerId);
      paramIndex++;
    }
    if (params.channel) {
      whereConditions.push(`s.channel = $${paramIndex}`);
      whereParams.push(params.channel);
      paramIndex++;
    }
    if (
      params.minTotal !== undefined &&
      params.minTotal !== "" &&
      params.minTotal !== null
    ) {
      whereConditions.push(`s.net_total >= $${paramIndex}`);
      whereParams.push(Number(params.minTotal));
      paramIndex++;
    }
    if (
      params.maxTotal !== undefined &&
      params.maxTotal !== "" &&
      params.maxTotal !== null
    ) {
      whereConditions.push(`s.net_total <= $${paramIndex}`);
      whereParams.push(Number(params.maxTotal));
      paramIndex++;
    }

    if (Array.isArray(params.taxIds) && params.taxIds.length) {
      const taxPlaceholders = params.taxIds
        .map(() => `$${paramIndex++}`)
        .join(",");
      whereConditions.push(`
      EXISTS (
        SELECT 1 FROM sales_invoice_taxes sit
        WHERE sit.invoice_id = s.id AND sit.tax_id IN (${taxPlaceholders})
      )
    `);
      whereParams.push(...params.taxIds);
    }

    if (params.status) {
      havingConditions.push(`
      CASE
        WHEN COALESCE(SUM(pa.amount), 0) >= s.net_total THEN 'paid'
        WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END = $${paramIndex}
    `);
      havingParams.push(params.status);
      paramIndex++;
    }

    if (params.returnStatus) {
      havingConditions.push(`
      CASE
        WHEN COALESCE(ret.total_returned, 0) <= 0 THEN 'none'
        WHEN ret.total_returned >= ret.total_quantity THEN 'full'
        ELSE 'partial'
      END = $${paramIndex}
    `);
      havingParams.push(params.returnStatus);
      paramIndex++;
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";
    const havingClause = havingConditions.length
      ? `HAVING ${havingConditions.join(" AND ")}`
      : "";

    const { rows: invoices } = await query(
      `SELECT
      s.*,
      s.date::text AS date,
      s.subtotal::float AS subtotal,
      s.discount::float AS discount,
      s.tax_value::float AS tax_value,
      s.net_total::float AS net_total,
      c.name AS customer_name,
      c.phone AS customer_phone,
      creator.full_name AS created_by_name,
      updater.full_name AS updated_by_name,
      invoiceTaxAgg.taxes_json,
      COALESCE(SUM(pa.amount), 0)::float AS paid_amount,

      COALESCE(itemAgg.item_tax_total, 0)::float AS item_tax_total,
      COALESCE(itemAgg.item_discount_total, 0)::float AS item_discount_total,
      (s.tax_value + COALESCE(itemAgg.item_tax_total, 0))::float AS total_tax_value,
      (s.discount + COALESCE(itemAgg.item_discount_total, 0))::float AS total_discount_value,

      (s.net_total - COALESCE(SUM(pa.amount), 0))::float AS remaining_amount,

      CASE
        WHEN COALESCE(SUM(pa.amount), 0) >= s.net_total THEN 'paid'
        WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END AS status,

      CASE
        WHEN COALESCE(ret.total_returned, 0) <= 0 THEN 'none'
        WHEN ret.total_returned >= ret.total_quantity THEN 'full'
        ELSE 'partial'
      END AS return_status

    FROM sales_invoices s

    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN payment_allocations pa
      ON pa.invoice_id = s.id AND pa.invoice_type = 'sales'
    LEFT JOIN users creator ON creator.id = s.created_by
    LEFT JOIN users updater ON updater.id = s.updated_by

    LEFT JOIN (
      SELECT
        invoice_id,
        SUM(tax_value) AS item_tax_total,
        SUM(discount) AS item_discount_total
      FROM sales_invoice_items
      GROUP BY invoice_id
    ) itemAgg ON itemAgg.invoice_id = s.id

    LEFT JOIN (
      SELECT
        invoice_id,
        jsonb_agg(
          json_build_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
        ) AS taxes_json
      FROM sales_invoice_taxes
      GROUP BY invoice_id
    ) invoiceTaxAgg ON invoiceTaxAgg.invoice_id = s.id

    LEFT JOIN (
      SELECT
        si.invoice_id,
        SUM(si.quantity) AS total_quantity,
        SUM(COALESCE(sri.returned_qty, 0)) AS total_returned
      FROM sales_invoice_items si
      LEFT JOIN (
        SELECT sales_invoice_item_id, SUM(quantity) AS returned_qty
        FROM sales_return_items
        GROUP BY sales_invoice_item_id
      ) sri ON sri.sales_invoice_item_id = si.id
      GROUP BY si.invoice_id
    ) ret ON ret.invoice_id = s.id

    ${whereClause}
    GROUP BY s.id, c.name, c.phone, creator.full_name, updater.full_name,
             invoiceTaxAgg.taxes_json, itemAgg.item_tax_total, itemAgg.item_discount_total,
             ret.total_returned, ret.total_quantity
    ${havingClause}

    ORDER BY s.id DESC

    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...whereParams, ...havingParams, limit, offset],
    );

    const { rows: totalRows } = await query(
      `SELECT COUNT(*) AS total FROM (
      SELECT s.id
      FROM sales_invoices s
      LEFT JOIN payment_allocations pa
        ON pa.invoice_id = s.id AND pa.invoice_type = 'sales'
      LEFT JOIN (
        SELECT
          si.invoice_id,
          SUM(si.quantity) AS total_quantity,
          SUM(COALESCE(sri.returned_qty, 0)) AS total_returned
        FROM sales_invoice_items si
        LEFT JOIN (
          SELECT sales_invoice_item_id, SUM(quantity) AS returned_qty
          FROM sales_return_items
          GROUP BY sales_invoice_item_id
        ) sri ON sri.sales_invoice_item_id = si.id
        GROUP BY si.invoice_id
      ) ret ON ret.invoice_id = s.id
      ${whereClause}
      GROUP BY s.id, ret.total_returned, ret.total_quantity
      ${havingClause}
    ) t`,
      [...whereParams, ...havingParams],
    );
    const total = Number(totalRows[0].total);

    const invoicesWithParsedTaxes = invoices.map((inv) => ({
      ...inv,
      taxes: inv.taxes_json || [],
    }));

    return {
      data: invoicesWithParsedTaxes,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  // GET ONE SALES INVOICE
  ipcMain.handle("get-sales-invoice", async (event, id) => {
    const { rows: invoiceRows } = await query(
      `SELECT
      sa.*,
      sa.date::text AS date,
      sa.subtotal::float AS subtotal,
      sa.discount::float AS discount,
      sa.tax_value::float AS tax_value,
      sa.net_total::float AS net_total,
      c.name AS customer_name,
      c.phone AS customer_phone,
      creator.full_name AS created_by_name,
      updater.full_name AS updated_by_name,
      COALESCE(pa_sum.paid_amount, 0)::float AS paid_amount,
      (sa.net_total - COALESCE(pa_sum.paid_amount, 0))::float AS remaining_amount,

      CASE
        WHEN COALESCE(pa_sum.paid_amount, 0) >= sa.net_total THEN 'paid'
        WHEN COALESCE(pa_sum.paid_amount, 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END AS status

    FROM sales_invoices sa
    LEFT JOIN customers c ON c.id = sa.customer_id
    LEFT JOIN users creator ON creator.id = sa.created_by
    LEFT JOIN users updater ON updater.id = sa.updated_by
    LEFT JOIN (
      SELECT invoice_id, SUM(amount) AS paid_amount
      FROM payment_allocations
      WHERE invoice_type = 'sales'
      GROUP BY invoice_id
    ) pa_sum ON pa_sum.invoice_id = sa.id
    WHERE sa.id = $1`,
      [id],
    );
    const invoice = invoiceRows[0];

    if (!invoice) return null;

    const { rows: items } = await query(
      `SELECT
      si.*,
      si.quantity::float AS quantity,
      si.price::float AS price,
      si.buying_price::float AS buying_price,
      si.total::float AS total,
      si.discount::float AS discount,
      si.discount_rate::float AS discount_rate,
      si.tax_rate::float AS tax_rate,
      si.tax_value::float AS tax_value,
      p.name AS name,
      t.name AS tax_name,

      COALESCE(r.returned_quantity, 0)::float AS returned_quantity,

      (si.quantity - COALESCE(r.returned_quantity, 0))::float AS available_quantity,

      (
        (si.quantity - COALESCE(r.returned_quantity, 0))
        * (
            (si.price - (si.discount / NULLIF(si.quantity, 0)))
            - si.buying_price
          )
      )::float AS item_profit,

      (
        (si.price - (si.discount / NULLIF(si.quantity, 0)))
        - si.buying_price
      )::float AS item_profit_per_unit,

      (CASE
        WHEN si.price > 0 THEN
          ROUND(
            (
              (
                (si.price - (si.discount / NULLIF(si.quantity, 0)))
                - si.buying_price
              ) / si.price
            ) * 100,
            2
          )
        ELSE 0
      END)::float AS item_margin_percent

    FROM sales_invoice_items si
    LEFT JOIN products p ON p.id = si.product_id
    LEFT JOIN taxes t ON t.id = si.tax_id
    LEFT JOIN (
      SELECT
        sales_invoice_item_id,
        SUM(quantity) AS returned_quantity
      FROM sales_return_items
      GROUP BY sales_invoice_item_id
    ) r ON r.sales_invoice_item_id = si.id

    WHERE si.invoice_id = $1`,
      [id],
    );

    const { rows: taxes } = await query(
      `SELECT id, tax_id, tax_name, tax_rate::float AS tax_rate, tax_value::float AS tax_value
     FROM sales_invoice_taxes
     WHERE invoice_id = $1
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
      AND pa.invoice_type = 'sales'
    ORDER BY pa.id ASC`,
      [id],
    );

    let itemLevelRevenue = 0;
    let proratedInvoiceDiscount = 0;

    const totalOriginalQuantity = items.reduce(
      (sum, i) => sum + Number(i.quantity || 0),
      0,
    );
    const invoiceDiscountTotal = Number(invoice.discount || 0);

    for (const i of items) {
      const quantity = Number(i.quantity || 0);
      const availableQuantity = Number(i.available_quantity || 0);

      const discountPerUnit =
        quantity > 0 ? Number(i.discount || 0) / quantity : 0;
      const discountedPrice = Number(i.price || 0) - discountPerUnit;
      itemLevelRevenue += availableQuantity * discountedPrice;

      const itemShareOfInvoiceDiscount =
        totalOriginalQuantity > 0
          ? (quantity / totalOriginalQuantity) * invoiceDiscountTotal
          : 0;
      const perUnitInvoiceDiscount =
        quantity > 0 ? itemShareOfInvoiceDiscount / quantity : 0;
      proratedInvoiceDiscount += perUnitInvoiceDiscount * availableQuantity;
    }

    const revenue = Math.max(0, itemLevelRevenue - proratedInvoiceDiscount);
    const cogs = items.reduce(
      (sum, i) =>
        sum + Number(i.available_quantity) * Number(i.buying_price || 0),
      0,
    );
    const grossProfit = Number((revenue - cogs).toFixed(2));
    const marginPercent =
      revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(2)) : 0;

    return {
      ...invoice,
      items,
      taxes,
      allocations,
      profitSummary: {
        revenue: Number(revenue.toFixed(2)),
        cogs: Number(cogs.toFixed(2)),
        grossProfit,
        marginPercent,
      },
    };
  });

  // UPDATE
  ipcMain.handle("update-sales-invoice", async (event, data) => {
    if (
      !data.id ||
      !data.date ||
      !Array.isArray(data.items) ||
      data.items.length === 0
    ) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const { rows: oldInvoiceRows } = await query(
      "SELECT * FROM sales_invoices WHERE id = $1",
      [data.id],
    );
    const oldInvoice = oldInvoiceRows[0];

    if (!oldInvoice) {
      return { success: false, error: "SALES INVOICE NOT FOUND" };
    }
    if (oldInvoice.channel === "pos") {
      return { success: false, error: "CANNOT_MODIFY_POS_INVOICE" };
    }

    const { rows: hasReturnRows } = await query(
      `SELECT 1
     FROM sales_return_items sri
     JOIN sales_invoice_items sii ON sii.id = sri.sales_invoice_item_id
     WHERE sii.invoice_id = $1
     LIMIT 1`,
      [data.id],
    );
    if (hasReturnRows[0]) {
      return { success: false, error: "CANNOT_MODIFY_INVOICE_WITH_RETURN" };
    }

    const oldCustomerId = oldInvoice.customer_id || null;
    const newCustomerId = data.customer_id || null;

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      const dateOnly = data.date.slice(0, 10);
      const time = new Date().toTimeString().slice(0, 8);
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
        if (!taxRow) throw new Error("INVALID_TAX_ID");
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
        if (!item.product_id) continue;

        const enteredQuantity = Number(item.entered_quantity || 0);
        const enteredPrice = Number(item.entered_price || 0);
        const factor = Number(item.unit_conversion_factor || 1);

        if (enteredQuantity <= 0 || enteredPrice < 0)
          throw new Error("INVALID ITEM DATA");

        const baseQuantity = enteredQuantity * factor;
        const basePrice = factor > 0 ? enteredPrice / factor : enteredPrice;
        const total = enteredQuantity * enteredPrice;

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
          if (!taxRow) throw new Error("INVALID_ITEM_TAX_ID");
          taxId = item.tax_id;
          taxRate = Number(taxRow.rate || 0);
        }

        const taxValue = Number(((afterDiscount * taxRate) / 100).toFixed(2));

        subtotal += total;
        itemDiscountTotal += discount;
        itemTaxTotal += taxValue;

        const { rows: productRows } = await q(
          `SELECT p.cost_price AS cost_price, p.type AS type, p.code AS code, pu.unit_name AS base_unit_name
         FROM products p
         LEFT JOIN product_units pu
           ON pu.product_id = p.id AND pu.is_base = true
         WHERE p.id = $1`,
          [item.product_id],
        );
        const productRow = productRows[0];
        const buyingPrice = Number(productRow?.cost_price || 0);
        const isService = productRow?.type === "service";
        const baseUnitName = productRow?.base_unit_name || null;
        const productCode = productRow?.code || null;

        preparedItems.push({
          product_id: item.product_id,
          product_name: item.name || null,
          product_code: productCode,
          unit_name: item.unit_name || null,
          unit_conversion_factor: factor,
          baseQuantity,
          basePrice,
          buyingPrice,
          total,
          discount_rate: discountRate,
          discount,
          tax_id: taxId,
          tax_rate: taxRate,
          taxValue,
          description: item.description || null,
          isService,
          baseUnitName,
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

      const { rows: oldItems } = await q(
        "SELECT * FROM sales_invoice_items WHERE invoice_id = $1",
        [data.id],
      );

      for (const item of oldItems) {
        const { rows: prodRows } = await q(
          "SELECT type FROM products WHERE id = $1",
          [item.product_id],
        );
        const wasService = prodRows[0]?.type === "service";

        if (!wasService) {
          await q(
            `UPDATE products SET quantity = quantity + $1 WHERE id = $2`,
            [item.quantity || 0, item.product_id],
          );
        }
      }

      await q(`DELETE FROM sales_invoice_items WHERE invoice_id = $1`, [
        data.id,
      ]);
      await q(
        `DELETE FROM product_movements WHERE reference_type = 'sale' AND reference_id = $1`,
        [data.id],
      );
      await q(`DELETE FROM sales_invoice_taxes WHERE invoice_id = $1`, [
        data.id,
      ]);

      for (const tax of preparedInvoiceTaxes) {
        await q(
          `INSERT INTO sales_invoice_taxes (invoice_id, tax_id, tax_name, tax_rate, tax_value)
         VALUES ($1,$2,$3,$4,$5)`,
          [data.id, tax.tax_id, tax.tax_name, tax.tax_rate, tax.tax_value],
        );
      }

      for (const item of preparedItems) {
        await q(
          `INSERT INTO sales_invoice_items
         (invoice_id, product_id, quantity, price, buying_price, total,
          product_name, product_code, unit_name, unit_conversion_factor,
          tax_id, tax_rate, tax_value, discount, discount_rate, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            data.id,
            item.product_id,
            item.baseQuantity,
            item.basePrice,
            item.buyingPrice,
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

        if (!item.isService) {
          await q(
            `UPDATE products SET quantity = quantity - $1 WHERE id = $2`,
            [item.baseQuantity, item.product_id],
          );
        }

        await createProductMovement(q, {
          product_id: item.product_id,
          reference_id: data.id,
          reference_type: "sale",
          action: "update",
          type: "out",
          quantity: item.baseQuantity,
          outPrice: item.basePrice,
          date: fullDateTime,
          base_unit_name: item.baseUnitName,
          unit_name: item.unit_name,
          conversion_factor: item.unit_conversion_factor,
        });
      }

      const invoiceName = data.invoice_name?.trim() || oldInvoice.invoice_name;

      await q(
        `UPDATE sales_invoices
       SET customer_id = $1, invoice_name = $2, description = $3, date = $4,
           subtotal = $5, discount = $6, discount_rate = $7,
           tax_rate = $8, tax_value = $9, net_total = $10, updated_by = $11
       WHERE id = $12`,
        [
          newCustomerId,
          invoiceName,
          data.description?.trim() || null,
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

      if (oldCustomerId && oldCustomerId === newCustomerId) {
        await q(
          `UPDATE party_history
         SET amount = $1, date = $2, note = $3
         WHERE invoice_id = $4 AND invoice_type = 'sales' AND record_type = 'invoice'`,
          [netTotal, fullDateTime, invoiceName, data.id],
        );
      } else {
        if (oldCustomerId) {
          await q(
            `DELETE FROM party_history
           WHERE invoice_id = $1 AND invoice_type = 'sales' AND record_type = 'invoice'`,
            [data.id],
          );
        }
        if (newCustomerId) {
          await createPartyHistory(q, {
            party_type: "customer",
            party_id: newCustomerId,
            invoice_id: data.id,
            invoice_type: "sales",
            record_type: "invoice",
            movement_type: "increase",
            amount: netTotal,
            date: fullDateTime,
            note: invoiceName,
          });
        }
      }

      await client.query("COMMIT");
      return { success: true };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });

  // DELETE
  ipcMain.handle("delete-sales-invoice", async (event, id) => {
    const { rows: invoiceRows } = await query(
      "SELECT * FROM sales_invoices WHERE id = $1",
      [id],
    );
    if (!invoiceRows[0]) {
      return { success: false, error: "SALES INVOICE NOT FOUND" };
    }

    const { rows: hasReturnRows } = await query(
      `SELECT 1
     FROM sales_return_items sri
     JOIN sales_invoice_items sii ON sii.id = sri.sales_invoice_item_id
     WHERE sii.invoice_id = $1
     LIMIT 1`,
      [id],
    );
    if (hasReturnRows[0]) {
      return { success: false, error: "CANNOT_DELETE_INVOICE_WITH_RETURN" };
    }

    const { rows: hasPaymentRows } = await query(
      `SELECT 1 FROM payment_allocations
     WHERE invoice_id = $1 AND invoice_type = 'sales'
     LIMIT 1`,
      [id],
    );
    if (hasPaymentRows[0]) {
      return { success: false, error: "CANNOT_DELETE_PAID_INVOICE" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      const { rows: items } = await q(
        "SELECT * FROM sales_invoice_items WHERE invoice_id = $1",
        [id],
      );

      const now = new Date();
      const date =
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(now.getDate()).padStart(2, "0") +
        " " +
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0") +
        ":" +
        String(now.getSeconds()).padStart(2, "0");

      for (const item of items) {
        await q(`UPDATE products SET quantity = quantity + $1 WHERE id = $2`, [
          item.quantity || 0,
          item.product_id,
        ]);

        await createProductMovement(q, {
          product_id: item.product_id,
          reference_id: id,
          reference_type: "sale",
          action: "delete",
          type: "in",
          quantity: item.quantity,
          enterPrice: item.price,
          date,
        });
      }

      await q(`DELETE FROM sales_invoice_items WHERE invoice_id = $1`, [id]);
      await q(
        `DELETE FROM party_history WHERE invoice_id = $1 AND invoice_type = 'sales'`,
        [id],
      );
      await q(`DELETE FROM sales_invoices WHERE id = $1`, [id]);

      await client.query("COMMIT");
      return { success: true };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });
  // POS CHECKOUT
  ipcMain.handle("pos-checkout", async (event, data) => {
    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("ERROR ENTER DATA");
      }

      const rawDate = data.date || new Date().toISOString();
      const dateOnly = rawDate.slice(0, 10);
      const time = new Date().toTimeString().slice(0, 8);
      const fullDateTime = `${dateOnly} ${time}`;

      // ---- Invoice-level taxes ----
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
        if (!taxRow) throw new Error("INVALID_TAX_ID");
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

      // ---- Stock guard — read fresh inside the transaction ----
      const { rows: settingsRows } = await q(
        `SELECT allow_negative_stock FROM company_settings LIMIT 1`,
      );
      const allowNegativeStock = Boolean(settingsRows[0]?.allow_negative_stock);

      // ---- Per-item cascade ----
      const preparedItems = [];
      let subtotal = 0;
      let itemDiscountTotal = 0;
      let itemTaxTotal = 0;

      for (const item of data.items) {
        const enteredQuantity = Number(item.entered_quantity ?? item.qty ?? 0);
        const enteredPrice = Number(item.entered_price ?? item.price ?? 0);
        const factor = Number(item.unit_conversion_factor || 1);

        if (!item.product_id && !item.id) {
          throw new Error("INVALID ITEM DATA");
        }
        const productId = item.product_id || item.id;

        if (enteredQuantity <= 0 || enteredPrice < 0) {
          throw new Error("INVALID ITEM DATA");
        }

        const baseQuantity = enteredQuantity * factor;
        const basePrice = factor > 0 ? enteredPrice / factor : enteredPrice;
        const total = enteredQuantity * enteredPrice;

        const { rows: productRows } = await q(
          `SELECT p.name AS name, p.quantity AS quantity, p.cost_price AS cost_price,
                p.type AS type, p.code AS code,
                pu.unit_name AS base_unit_name
         FROM products p
         LEFT JOIN product_units pu
           ON pu.product_id = p.id AND pu.is_base = true
         WHERE p.id = $1`,
          [productId],
        );
        const productRow = productRows[0];

        if (!productRow) {
          throw new Error("PRODUCT_NOT_FOUND");
        }

        const isService = productRow.type === "service";

        if (!allowNegativeStock && !isService) {
          if (Number(productRow.quantity) - baseQuantity < 0) {
            throw new Error(`INSUFFICIENT_STOCK:${productRow.name}`);
          }
        }

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
          if (!taxRow) throw new Error("INVALID_ITEM_TAX_ID");
          taxId = item.tax_id;
          taxRate = Number(taxRow.rate || 0);
        }

        const taxValue = Number(((afterDiscount * taxRate) / 100).toFixed(2));

        subtotal += total;
        itemDiscountTotal += discount;
        itemTaxTotal += taxValue;

        const buyingPrice = Number(productRow.cost_price || 0);

        preparedItems.push({
          product_id: productId,
          product_name: item.name || null,
          product_code: productRow.code || null,
          unit_name: item.unit_name || null,
          unit_conversion_factor: factor,
          baseQuantity,
          basePrice,
          buyingPrice,
          total,
          discount_rate: discountRate,
          discount,
          tax_id: taxId,
          tax_rate: taxRate,
          taxValue,
          description: item.description || null,
          isService,
          baseUnitName: productRow.base_unit_name || null,
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

      // ---- Payments — multi-fund, POS-specific ----
      const roundCents = (value) => Math.round(Number(value || 0) * 100) / 100;

      const payments = Array.isArray(data.payments)
        ? data.payments
            .map((payment) => ({
              fundId: Number(payment.fundId || payment.fund_id),
              amount: Number(payment.amount || 0),
              amountFundCurrency: Number(
                payment.amount_fund_currency ||
                  payment.amountFundCurrency ||
                  payment.paymentInfundCurrency ||
                  0,
              ),
              currencyCode: payment.currency_code,
              exchangeRate: Number(payment.exchange_rate || 1) || 1,
            }))
            .filter(
              (payment) =>
                payment.fundId &&
                payment.amount > 0 &&
                payment.amountFundCurrency > 0,
            )
        : [];

      if (!payments.length && data.fund_id && data.paymentInfundCurrency) {
        payments.push({
          fundId: Number(data.fund_id),
          amount: netTotal,
          amountFundCurrency: Number(data.paymentInfundCurrency || 0),
          currencyCode: data.currency_code,
          exchangeRate: Number(data.exchange_rate || 1) || 1,
        });
      }

      const paidTotal = roundCents(
        payments.reduce((sum, payment) => sum + payment.amount, 0),
      );

      if (!payments.length || Math.abs(paidTotal - netTotal) > 0.01) {
        throw new Error("POS payments must exactly cover invoice total");
      }

      // ---- Insert invoice header ----
      const invoiceResult = await q(
        `INSERT INTO sales_invoices
       (customer_id, invoice_name, description, channel, date,
        subtotal, discount, discount_rate,
        tax_rate, tax_value,
        net_total, created_by)
       VALUES ($1,$2,$3,'pos',$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
        [
          data.customer_id || null,
          data.invoice_name?.trim() || null,
          data.description?.trim() || null,
          fullDateTime,
          subtotal,
          invoiceDiscount,
          invoiceDiscountRate,
          invoiceTaxRateSum,
          invoiceTaxValueTotal,
          netTotal,
          data.created_by || null,
        ],
      );
      const invoiceId = invoiceResult.rows[0].id;

      let invoiceName = data.invoice_name?.trim();
      if (!invoiceName) {
        invoiceName = await buildDefaultInvoiceName(q, "sales", invoiceId);
        await q(`UPDATE sales_invoices SET invoice_name = $1 WHERE id = $2`, [
          invoiceName,
          invoiceId,
        ]);
      }

      // ---- Invoice-level tax rows ----
      for (const tax of preparedInvoiceTaxes) {
        await q(
          `INSERT INTO sales_invoice_taxes (invoice_id, tax_id, tax_name, tax_rate, tax_value)
         VALUES ($1,$2,$3,$4,$5)`,
          [invoiceId, tax.tax_id, tax.tax_name, tax.tax_rate, tax.tax_value],
        );
      }

      // ---- Items + stock + movements ----
      for (const item of preparedItems) {
        await q(
          `INSERT INTO sales_invoice_items
         (invoice_id, product_id, quantity, price, buying_price, total,
          product_name, product_code, unit_name, unit_conversion_factor,
          tax_id, tax_rate, tax_value, discount, discount_rate, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            invoiceId,
            item.product_id,
            item.baseQuantity,
            item.basePrice,
            item.buyingPrice,
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

        if (!item.isService) {
          await q(
            `UPDATE products SET quantity = quantity - $1 WHERE id = $2`,
            [item.baseQuantity, item.product_id],
          );
        }

        await createProductMovement(q, {
          product_id: item.product_id,
          reference_id: invoiceId,
          reference_type: "sale",
          type: "out",
          action: "create",
          quantity: item.baseQuantity,
          outPrice: item.basePrice,
          date: fullDateTime,
          base_unit_name: item.baseUnitName,
          unit_name: item.unit_name,
          conversion_factor: item.unit_conversion_factor,
        });
      }

      // ---- Party history ----
      if (data.customer_id) {
        await createPartyHistory(q, {
          party_type: "customer",
          party_id: data.customer_id,
          invoice_id: invoiceId,
          invoice_type: "sales",
          record_type: "invoice",
          movement_type: "increase",
          amount: netTotal,
          date: fullDateTime,
          note: invoiceName,
        });
      }

      // ---- Payments, one per fund ----
      const insertedPaymentIds = [];

      for (const payment of payments) {
        const paymentId = await createPayment(q, {
          type: "income",
          party_type: data.customer_id ? "customer" : "walk-in",
          party_id: data.customer_id || null,
          fund_id: payment.fundId,
          amount: payment.amount,
          amount_fund_currency: payment.amountFundCurrency,
          currency_code: payment.currencyCode,
          exchange_rate: payment.exchangeRate,
          effective_rate: payment.exchangeRate,
          invoice_id: invoiceId,
          invoice_type: "sales",
          note: invoiceName,
          fundOperation: "add",
          date: fullDateTime,
        });

        await createFundHistory(q, {
          fund_id: payment.fundId,
          record_type: "payment",
          payment_id: paymentId,
          movement_type: "in",
          amount: payment.amountFundCurrency,
          date: fullDateTime,
          note: await buildDefaultPaymentNote(q, "payment", invoiceName),
        });

        insertedPaymentIds.push(paymentId);
      }

      await client.query("COMMIT");
      return {
        success: true,
        invoiceId,
        invoiceName,
        paymentIds: insertedPaymentIds,
      };
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

  ipcMain.handle("get-daily-pos-report", async (event, params = {}) => {
    const date = params.date || new Date().toLocaleDateString("en-CA");
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const { rows } = await query(
      `
  SELECT * FROM (
    SELECT
      s.id,
      s.date::text AS date,
      s.net_total::float AS net_total,
      s.net_total::float AS paid_amount,
      'paid' AS status,
      'sale' AS type,
      NULL::integer AS sales_invoice_id,
      CASE
        WHEN COALESCE(ret.total_returned, 0) <= 0 THEN 'none'
        WHEN ret.total_returned >= ret.total_quantity THEN 'full'
        ELSE 'partial'
      END AS return_status
    FROM sales_invoices s
    LEFT JOIN (
      SELECT
        si.invoice_id,
        SUM(si.quantity) AS total_quantity,
        SUM(COALESCE(sri.returned_qty, 0)) AS total_returned
      FROM sales_invoice_items si
      LEFT JOIN (
        SELECT sales_invoice_item_id, SUM(quantity) AS returned_qty
        FROM sales_return_items
        GROUP BY sales_invoice_item_id
      ) sri ON sri.sales_invoice_item_id = si.id
      GROUP BY si.invoice_id
    ) ret ON ret.invoice_id = s.id
    WHERE s.date::date = $1::date AND s.channel = 'pos'

    UNION ALL

    SELECT
      r.id,
      r.date::text AS date,
      r.net_total::float AS net_total,
      r.net_total::float AS paid_amount,
      NULL AS status,
      'return' AS type,
      r.sales_invoice_id,
      NULL AS return_status
    FROM sales_returns r
    WHERE r.date::date = $2::date AND r.channel = 'pos'
  ) t
  ORDER BY date DESC, id DESC
  LIMIT $3 OFFSET $4
  `,
      [date, date, limit, offset],
    );

    const { rows: totalRows } = await query(
      `
  SELECT
    (SELECT COUNT(*) FROM sales_invoices WHERE date::date = $1::date AND channel = 'pos') +
    (SELECT COUNT(*) FROM sales_returns WHERE date::date = $2::date AND channel = 'pos') AS total
  `,
      [date, date],
    );
    const total = Number(totalRows[0].total);

    const { rows: salesStatsRows } = await query(
      `
  SELECT
    COUNT(*)::int AS count,
    COALESCE(SUM(s.net_total), 0)::float AS total,
    (COALESCE(SUM(s.tax_value), 0)
      + COALESCE(SUM(itemAgg.item_tax_total), 0))::float AS "taxTotal"
  FROM sales_invoices s
  LEFT JOIN (
    SELECT invoice_id, SUM(tax_value) AS item_tax_total
    FROM sales_invoice_items
    GROUP BY invoice_id
  ) itemAgg ON itemAgg.invoice_id = s.id
  WHERE s.date::date = $1::date AND s.channel = 'pos'
  `,
      [date],
    );
    const salesStats = salesStatsRows[0];

    const { rows: returnStatsRows } = await query(
      `
  SELECT
    COUNT(*)::int AS count,
    COALESCE(SUM(r.net_total), 0)::float AS total,
    (COALESCE(SUM(r.tax_value), 0)
      + COALESCE(SUM(itemAgg.item_tax_total), 0))::float AS "taxTotal"
  FROM sales_returns r
  LEFT JOIN (
    SELECT return_id, SUM(tax_value) AS item_tax_total
    FROM sales_return_items
    GROUP BY return_id
  ) itemAgg ON itemAgg.return_id = r.id
  WHERE r.date::date = $1::date AND r.channel = 'pos'
  `,
      [date],
    );
    const returnStats = returnStatsRows[0];

    const { rows: fundIn } = await query(
      `
  SELECT
    f.id AS fund_id,
    f.name AS fund_name,
    cur.code AS currency_code,
    cur.symbol AS currency_symbol,
    COALESCE(SUM(p.amount), 0)::float AS amount,
    COALESCE(SUM(p.amount_fund_currency), 0)::float AS fund_amount
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  JOIN funds f ON f.id = p.fund_id
  JOIN currencies cur ON cur.id = f.currency_id
  JOIN sales_invoices s ON s.id = pa.invoice_id
  WHERE pa.invoice_type = 'sales'
    AND s.date::date = $1::date
    AND s.channel = 'pos'
  GROUP BY f.id, f.name, cur.code, cur.symbol
  ORDER BY amount DESC
  `,
      [date],
    );

    const { rows: fundOut } = await query(
      `
  SELECT
    f.id AS fund_id,
    f.name AS fund_name,
    cur.code AS currency_code,
    cur.symbol AS currency_symbol,
    COALESCE(SUM(p.amount), 0)::float AS amount,
    COALESCE(SUM(p.amount_fund_currency), 0)::float AS fund_amount
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  JOIN funds f ON f.id = p.fund_id
  JOIN currencies cur ON cur.id = f.currency_id
  JOIN sales_returns r ON r.id = pa.invoice_id
  WHERE pa.invoice_type = 'sales_return'
    AND r.date::date = $1::date
    AND r.channel = 'pos'
  GROUP BY f.id, f.name, cur.code, cur.symbol
  ORDER BY amount DESC
  `,
      [date],
    );

    // Per-invoice fund allocations — batched for just the ids on this page
    const saleIds = rows.filter((r) => r.type === "sale").map((r) => r.id);
    const returnIds = rows.filter((r) => r.type === "return").map((r) => r.id);

    const getInvoiceAllocations = async (ids, invoiceType) => {
      if (!ids.length) return [];
      const placeholders = ids.map((_, i) => `$${i + 2}`).join(",");
      const { rows } = await query(
        `
    SELECT
      pa.invoice_id,
      f.id AS fund_id,
      f.name AS fund_name,
      cur.code AS currency_code,
      cur.symbol AS currency_symbol,
      COALESCE(SUM(p.amount), 0)::float AS amount,
      COALESCE(SUM(p.amount_fund_currency), 0)::float AS fund_amount
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    JOIN funds f ON f.id = p.fund_id
    JOIN currencies cur ON cur.id = f.currency_id
    WHERE pa.invoice_type = $1 AND pa.invoice_id IN (${placeholders})
    GROUP BY pa.invoice_id, f.id, f.name, cur.code, cur.symbol
    `,
        [invoiceType, ...ids],
      );
      return rows;
    };

    const saleAllocations = (await getInvoiceAllocations(saleIds, "sales")).map(
      (a) => ({
        ...a,
        rowType: "sale",
      }),
    );
    const returnAllocations = (
      await getInvoiceAllocations(returnIds, "sales_return")
    ).map((a) => ({
      ...a,
      rowType: "return",
    }));

    const allocationsByKey = {};
    for (const a of [...saleAllocations, ...returnAllocations]) {
      const key = `${a.rowType}-${a.invoice_id}`;
      if (!allocationsByKey[key]) allocationsByKey[key] = [];
      allocationsByKey[key].push({
        fund_id: a.fund_id,
        fund_name: a.fund_name,
        currency_code: a.currency_code,
        currency_symbol: a.currency_symbol,
        amount: a.amount,
        fund_amount: a.fund_amount,
      });
    }

    const rowsWithAllocations = rows.map((r) => ({
      ...r,
      allocations: allocationsByKey[`${r.type}-${r.id}`] || [],
    }));

    return {
      data: rowsWithAllocations,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      stats: {
        salesCount: salesStats.count,
        salesTotal: salesStats.total,
        salesTax: salesStats.taxTotal,
        returnCount: returnStats.count,
        returnTotal: returnStats.total,
        returnTax: returnStats.taxTotal,
        fundIn,
        fundOut,
      },
    };
  });

  ipcMain.handle("print-receipt", async (event, data) => {
    const { rows: settingsRows } = await query(
      `SELECT company_name, company_latin_name, language FROM company_settings LIMIT 1`,
    );
    const companySettings = settingsRows[0];

    // Look up THIS terminal's default printer — same pattern as
    // test-print, except by is_default rather than a user-picked device
    // name, since POS checkout should always target whichever printer
    // this terminal has configured as default, not one named per sale.
    const deviceId = await getDeviceHash();
    const { rows: printerRows } = await query(
      `SELECT * FROM printer_settings WHERE device_id = $1 AND is_default = true`,
      [deviceId],
    );
    const printerSettings = printerRows[0];

    const language = getReceiptLanguage(
      data.language || companySettings?.language,
    );
    const labels = receiptLabels[language];
    const direction = language === "ar" ? "rtl" : "ltr";
    const companyName =
      companySettings?.company_name ||
      companySettings?.company_latin_name ||
      "POS System";
    const items = data.items || [];
    const hasAnyItemDiscount = items.some(
      (item) => Number(item.discount || 0) > 0,
    );
    const hasAnyItemTax = items.some((item) => Number(item.taxValue || 0) > 0);
    const itemsHtml = items
      .map((item) => {
        const total = Number(item.total || 0);
        const discount = Number(item.discount || 0);
        const taxValue = Number(item.taxValue || 0);
        const lineTotal = total - discount + taxValue;
        return `
      <tr>
        <td class="item">${escapeHtml(item.name)}</td>
        <td class="center">${escapeHtml(item.quantity)}</td>
        <td class="right">${Number(item.price).toFixed(2)}</td>
        <td class="right">${lineTotal.toFixed(2)}</td>
      </tr>
    `;
      })
      .join("");
    const subtotal = Number(data.subtotal || 0);
    const itemDiscountTotal = Number(data.itemDiscountTotal || 0);
    const itemTaxTotal = Number(data.itemTaxTotal || 0);
    const invoiceDiscount = Number(data.invoiceDiscount || 0);
    const taxLines = (data.taxes || [])
      .filter((tax) => Number(tax.value || 0) > 0)
      .map((tax) => ({
        label: `${tax.name} (${tax.rate}%)`,
        value: Number(tax.value || 0),
      }));
    const invoiceTaxTotal = taxLines.reduce((sum, t) => sum + t.value, 0);
    const taxLinesHtml = taxLines
      .map(
        (t) => `
    <div><span>${escapeHtml(t.label)}</span><span>${t.value.toFixed(2)}</span></div>
  `,
      )
      .join("");
    const html = buildReceiptHtml({
      companyName: escapeHtml(companyName),
      labels,
      direction,
      data: {
        id: escapeHtml(data.invoice_name || data.id),
        date: escapeHtml(data.date),
        subtotal: subtotal.toFixed(2),
        itemDiscountTotal: itemDiscountTotal.toFixed(2),
        itemTaxTotal: itemTaxTotal.toFixed(2),
        invoiceDiscount: invoiceDiscount.toFixed(2),
        total: Number(data.total || 0).toFixed(2),
      },
      itemsHtml,
      taxLinesHtml,
      showItemDiscount: itemDiscountTotal > 0,
      showInvoiceDiscount: invoiceDiscount > 0,
      showItemTax: itemTaxTotal + invoiceTaxTotal > 0,
      hasAnyItemDiscount,
      hasAnyItemTax,
    });

    if (!printerSettings) {
      // No default printer configured yet for this terminal — fall back to
      // Electron's default print target, same behavior as before.
      return printReceiptHtml(html, data.printerName);
    }

    if (printerSettings.backend === "raw_escpos") {
      return printViaRawEscpos(html, {
        deviceName: printerSettings.device_name,
        paperSize: printerSettings.paper_size,
        hasCutter: Boolean(printerSettings.has_cutter),
      });
    }

    return printReceiptHtml(html, printerSettings.device_name);
  });
}
