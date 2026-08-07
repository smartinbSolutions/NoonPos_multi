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

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export default function registerSalesInvoiceIPC() {
  // CREATE
  ipcMain.handle("create-sales-invoice", (event, data) => {
    try {
      const transaction = db.transaction(() => {
        if (
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

        // ---- Invoice-level taxes — PARALLEL: each computed independently
        // off the same post-discount base, then summed. Never trust
        // client-sent rates — every id is re-validated and re-priced here. ----
        const requestedTaxIds = Array.isArray(data.taxes)
          ? [...new Set(data.taxes.filter(Boolean))]
          : [];

        const invoiceTaxes = requestedTaxIds.map((taxId) => {
          const taxRow = db
            .prepare(
              `SELECT id, name, rate FROM taxes WHERE id = ? AND category IN ('invoice', 'both')`
            )
            .get(taxId);
          if (!taxRow) {
            throw new Error("INVALID_TAX_ID");
          }
          return {
            tax_id: taxRow.id,
            tax_name: taxRow.name,
            tax_rate: Number(taxRow.rate || 0),
          };
        });

        const invoiceDiscountRate = Math.min(
          100,
          Math.max(0, Number(data.discount_rate || 0))
        );

        // ---- Per-item cascade — unchanged, still single tax per item ----
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
            Math.max(0, Number(item.discount_rate || 0))
          );
          const discount = Number(((total * discountRate) / 100).toFixed(2));
          const afterDiscount = total - discount;

          let taxId = null;
          let taxRate = 0;

          if (item.tax_id) {
            const taxRow = db
              .prepare(
                `SELECT rate FROM taxes WHERE id = ? AND category IN ('product', 'both')`
              )
              .get(item.tax_id);
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

          // Extended to also pull type + current base unit name — needed
          // below to skip stock decrement for services and to snapshot the
          // base unit onto the movement, without a second query per item.
          const productRow = db
            .prepare(
              `
            SELECT p.costPrice, p.type, p.code, pu.unit_name AS base_unit_name
            FROM products p
            LEFT JOIN product_units pu
              ON pu.product_id = p.id AND pu.is_base = 1
            WHERE p.id = ?
            `
            )
            .get(item.product_id);
          const buyingPrice = Number(productRow?.costPrice || 0);
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

        if (subtotal <= 0) {
          throw new Error("INVALID TOTALS");
        }

        const afterItemDiscounts = subtotal - itemDiscountTotal;

        const invoiceDiscount = Number(
          ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2)
        );
        const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

        // ---- Each invoice tax computed independently (parallel) off the
        // SAME afterInvoiceDiscount base, then summed ----
        let invoiceTaxValueTotal = 0;
        const preparedInvoiceTaxes = invoiceTaxes.map((tax) => {
          const value = Number(
            ((afterInvoiceDiscount * tax.tax_rate) / 100).toFixed(2)
          );
          invoiceTaxValueTotal += value;
          return { ...tax, tax_value: value };
        });
        invoiceTaxValueTotal = Number(invoiceTaxValueTotal.toFixed(2));

        // Sum-of-rates — display convenience only ("18% total"), never
        // used in computation; each tax already computed independently above.
        const invoiceTaxRateSum = Number(
          invoiceTaxes.reduce((sum, t) => sum + t.tax_rate, 0).toFixed(2)
        );

        const netTotal = Number(
          Math.max(
            0,
            afterInvoiceDiscount + itemTaxTotal + invoiceTaxValueTotal
          ).toFixed(2)
        );

        // ---- Payment validation (unchanged) ----
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

        // ---- Insert invoice header — tax column dropped ----
        const invoiceResult = db
          .prepare(
            `
          INSERT INTO sales_invoices
            (customer_id, invoice_name, description, channel, date,
             subtotal, discount, discount_rate,
             taxRate, taxValue,
             created_by, updated_by, net_total)
          VALUES (?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
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
            netTotal
          );

        const invoiceId = invoiceResult.lastInsertRowid;

        let invoiceName = data.invoice_name?.trim();
        if (!invoiceName) {
          invoiceName = buildDefaultInvoiceName(db, "sales", invoiceId);
          db.prepare(
            `UPDATE sales_invoices SET invoice_name = ? WHERE id = ?`
          ).run(invoiceName, invoiceId);
        }

        // ---- Insert invoice-level tax rows ----
        const insertInvoiceTax = db.prepare(`
          INSERT INTO sales_invoice_taxes
          (invoice_id, tax_id, tax_name, tax_rate, tax_value)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const tax of preparedInvoiceTaxes) {
          insertInvoiceTax.run(
            invoiceId,
            tax.tax_id,
            tax.tax_name,
            tax.tax_rate,
            tax.tax_value
          );
        }

        // ---- Insert items + reduce stock + record movements ----
        const insertItem = db.prepare(`
          INSERT INTO sales_invoice_items
          (
            invoice_id, product_id, quantity, price, buyingPrice, total,
            product_name, product_code, unit_name, unit_conversion_factor,
            tax_id, tax_rate, taxValue,
            discount, discount_rate, description
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const updateStock = db.prepare(`
          UPDATE products
          SET quantity = quantity - ?
          WHERE id = ?
        `);

        for (const item of preparedItems) {
          insertItem.run(
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
            item.description
          );

          // Services have no physical stock — never decremented, matching
          // how they were never incremented on purchase.
          if (!item.isService) {
            updateStock.run(item.baseQuantity, item.product_id);
          }

          createProductMovement(db, {
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

        // ---- Party history, payment/credit (unchanged) ----
        if (data.customer_id) {
          createPartyHistory(db, {
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
          creditApplied = applyPartyCredit(db, {
            partyId: payment.party_id,
            partyType: payment.party_type,
            invoiceId,
            invoiceType: "sales",
            amount: payment.amount,
          });
        } else if (isPaid) {
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
            invoice_id: invoiceId,
            invoice_type: payment.mode,
            note:
              payment.note ||
              buildDefaultPaymentNote(db, "payment", invoiceName),
            fundOperation: "add",
            date: fullDateTime,
            created_by: data.created_by,
          });

          createFundHistory(db, {
            fund_id: payment.fund_id,
            record_type: "payment",
            payment_id: insertPaymentId,
            movement_type: "in",
            amount: payment.collected_amount,
            date: fullDateTime,
            note: buildDefaultPaymentNote(db, "payment", invoiceName),
          });
        }

        return {
          invoiceId,
          invoiceName,
          paymentId: insertPaymentId,
          creditApplied,
        };
      });

      return { success: true, ...transaction() };
    } catch (err) {
      return {
        success: false,
        error: err.message || String(err),
        code: err.code,
      };
    }
  });

  //  GET ALL SALES INVOICES
  ipcMain.handle("get-sales-invoices", (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const whereConditions = [];
    const whereParams = [];
    const havingConditions = [];
    const havingParams = [];

    if (params.dateFrom) {
      whereConditions.push("DATE(s.date) >= ?");
      whereParams.push(params.dateFrom);
    }
    if (params.dateTo) {
      whereConditions.push("DATE(s.date) <= ?");
      whereParams.push(params.dateTo);
    }
    if (params.customerId) {
      whereConditions.push("s.customer_id = ?");
      whereParams.push(params.customerId);
    }
    if (params.channel) {
      whereConditions.push("s.channel = ?");
      whereParams.push(params.channel);
    }
    if (
      params.minTotal !== undefined &&
      params.minTotal !== "" &&
      params.minTotal !== null
    ) {
      whereConditions.push("s.net_total >= ?");
      whereParams.push(Number(params.minTotal));
    }
    if (
      params.maxTotal !== undefined &&
      params.maxTotal !== "" &&
      params.maxTotal !== null
    ) {
      whereConditions.push("s.net_total <= ?");
      whereParams.push(Number(params.maxTotal));
    }

    if (params.status) {
      havingConditions.push(`
        CASE
          WHEN COALESCE(SUM(pa.amount), 0) >= s.net_total THEN 'paid'
          WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END = ?
      `);
      havingParams.push(params.status);
    }

    if (params.returnStatus) {
      havingConditions.push(`
        CASE
          WHEN COALESCE(ret.total_returned, 0) <= 0 THEN 'none'
          WHEN ret.total_returned >= ret.total_quantity THEN 'full'
          ELSE 'partial'
        END = ?
      `);
      havingParams.push(params.returnStatus);
    }

    if (Array.isArray(params.taxIds) && params.taxIds.length) {
      const taxPlaceholders = params.taxIds.map(() => "?").join(",");
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM sales_invoice_taxes sit
          WHERE sit.invoice_id = s.id AND sit.tax_id IN (${taxPlaceholders})
        )
      `);
      whereParams.push(...params.taxIds);
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";
    const havingClause = havingConditions.length
      ? `HAVING ${havingConditions.join(" AND ")}`
      : "";

    const invoices = db
      .prepare(
        `
      SELECT
        s.*,
        c.name AS customer_name,
        c.phone AS customer_phone,
        creator.full_name AS created_by_name,
        updater.full_name AS updated_by_name,
        invoiceTaxAgg.taxes_json,
        COALESCE(SUM(pa.amount), 0) AS paid_amount,
  
        COALESCE(itemAgg.item_tax_total, 0) AS item_tax_total,
        COALESCE(itemAgg.item_discount_total, 0) AS item_discount_total,
        (s.taxValue + COALESCE(itemAgg.item_tax_total, 0)) AS total_tax_value,
        (s.discount + COALESCE(itemAgg.item_discount_total, 0)) AS total_discount_value,
  
        s.net_total - COALESCE(SUM(pa.amount), 0) AS remaining_amount,
  
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
  
      LEFT JOIN customers c
        ON c.id = s.customer_id
  
      LEFT JOIN payment_allocations pa
        ON pa.invoice_id = s.id
       AND pa.invoice_type = 'sales'
  
      LEFT JOIN users creator
        ON creator.id = s.created_by
  
      LEFT JOIN users updater
        ON updater.id = s.updated_by
  
      LEFT JOIN (
        SELECT
          invoice_id,
          SUM(taxValue) AS item_tax_total,
          SUM(discount) AS item_discount_total
        FROM sales_invoice_items
        GROUP BY invoice_id
      ) itemAgg ON itemAgg.invoice_id = s.id
  
      LEFT JOIN (
        SELECT
          invoice_id,
          json_group_array(
            json_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
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
      GROUP BY s.id
         ${havingClause}
  
      ORDER BY s.id DESC
  
      LIMIT ? OFFSET ?
      `
      )
      .all(...whereParams, ...havingParams, limit, offset);

    const { total } = db
      .prepare(
        `
        SELECT COUNT(*) AS total FROM (
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
          GROUP BY s.id
          ${havingClause}
        ) t
        `
      )
      .get(...whereParams, ...havingParams);

    const invoicesWithParsedTaxes = invoices.map((inv) => ({
      ...inv,
      taxes: inv.taxes_json ? JSON.parse(inv.taxes_json) : [],
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
  ipcMain.handle("get-sales-invoice", (event, id) => {
    const invoice = db
      .prepare(
        `
    SELECT
      sa.*,
      c.name AS customer_name,
      c.phone AS customer_phone,
      creator.full_name AS created_by_name,
      updater.full_name AS updated_by_name,
      COALESCE(pa_sum.paid_amount, 0) AS paid_amount,
      sa.net_total - COALESCE(pa_sum.paid_amount, 0) AS remaining_amount,
  
      CASE
        WHEN COALESCE(pa_sum.paid_amount, 0) >= sa.net_total THEN 'paid'
        WHEN COALESCE(pa_sum.paid_amount, 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END AS status
  
    FROM sales_invoices sa
    LEFT JOIN customers c ON c.id = sa.customer_id
  
    LEFT JOIN users creator
    ON creator.id = sa.created_by
  
    LEFT JOIN users updater
    ON updater.id = sa.updated_by
  
    LEFT JOIN (
      SELECT invoice_id, SUM(amount) AS paid_amount
      FROM payment_allocations
      WHERE invoice_type = 'sales'
      GROUP BY invoice_id
    ) pa_sum ON pa_sum.invoice_id = sa.id
    WHERE sa.id = ?
    `
      )
      .get(id);

    if (!invoice) return null;

    const items = db
      .prepare(
        `
    SELECT
      si.*,
      p.name,
      t.name AS tax_name,
  
      COALESCE(r.returned_quantity, 0) AS returned_quantity,
  
      (
        si.quantity - COALESCE(r.returned_quantity, 0)
      ) AS available_quantity,
  
      (
        (si.quantity - COALESCE(r.returned_quantity, 0))
        * (
            (si.price - (si.discount / NULLIF(si.quantity, 0)))
            - si.buyingPrice
          )
      ) AS item_profit,
  
      (
        (si.price - (si.discount / NULLIF(si.quantity, 0)))
        - si.buyingPrice
      ) AS item_profit_per_unit,
  
      CASE
        WHEN si.price > 0 THEN
          ROUND(
            (
              (
                (si.price - (si.discount / NULLIF(si.quantity, 0)))
                - si.buyingPrice
              ) / si.price
            ) * 100,
            2
          )
        ELSE 0
      END AS item_margin_percent
  
    FROM sales_invoice_items si
  
    LEFT JOIN products p
    ON p.id = si.product_id
  
    LEFT JOIN taxes t
    ON t.id = si.tax_id
  
    LEFT JOIN (
    SELECT
      sales_invoice_item_id,
      SUM(quantity) AS returned_quantity
    FROM sales_return_items
    GROUP BY sales_invoice_item_id
    ) r
    ON r.sales_invoice_item_id = si.id
  
    WHERE si.invoice_id = ?
    `
      )
      .all(id);

    // ---- Invoice-level taxes, one row per applied tax ----
    const taxes = db
      .prepare(
        `
        SELECT id, tax_id, tax_name, tax_rate, tax_value
        FROM sales_invoice_taxes
        WHERE invoice_id = ?
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
    LEFT JOIN payments p ON p.id = pa.payment_id
    LEFT JOIN funds f ON f.id = p.fund_id
    LEFT JOIN currencies c ON c.id = f.currency_id
    WHERE pa.invoice_id = ?
      AND pa.invoice_type = 'sales'
    ORDER BY pa.id ASC
    `
      )
      .all(id);

    let itemLevelRevenue = 0;
    let proratedInvoiceDiscount = 0;

    const totalOriginalQuantity = items.reduce(
      (sum, i) => sum + Number(i.quantity || 0),
      0
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
        sum + Number(i.available_quantity) * Number(i.buyingPrice || 0),
      0
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
  ipcMain.handle("update-sales-invoice", (event, data) => {
    if (
      !data.id ||
      !data.date ||
      !Array.isArray(data.items) ||
      data.items.length === 0
    ) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const dateOnly = data.date.slice(0, 10);
    const time = new Date().toTimeString().slice(0, 8);
    const fullDateTime = `${dateOnly} ${time}`;

    try {
      const transaction = db.transaction(() => {
        const oldInvoice = db
          .prepare(`SELECT * FROM sales_invoices WHERE id = ?`)
          .get(data.id);

        if (!oldInvoice) {
          throw new Error("SALES INVOICE NOT FOUND");
        }

        if (oldInvoice.channel === "pos") {
          throw new Error("CANNOT_MODIFY_POS_INVOICE");
        }

        const hasReturn = db
          .prepare(
            `
          SELECT 1
          FROM sales_return_items sri
          JOIN sales_invoice_items sii ON sii.id = sri.sales_invoice_item_id
          WHERE sii.invoice_id = ?
          LIMIT 1
        `
          )
          .get(data.id);

        if (hasReturn) {
          throw new Error("CANNOT_MODIFY_INVOICE_WITH_RETURN");
        }

        const oldCustomerId = oldInvoice.customer_id || null;
        const newCustomerId = data.customer_id || null;

        // ---- Resolve invoice-level taxes — PARALLEL, same as create ----
        const requestedTaxIds = Array.isArray(data.taxes)
          ? [...new Set(data.taxes.filter(Boolean))]
          : [];

        const invoiceTaxes = requestedTaxIds.map((taxId) => {
          const taxRow = db
            .prepare(
              `SELECT id, name, rate FROM taxes WHERE id = ? AND category IN ('invoice', 'both')`
            )
            .get(taxId);
          if (!taxRow) {
            throw new Error("INVALID_TAX_ID");
          }
          return {
            tax_id: taxRow.id,
            tax_name: taxRow.name,
            tax_rate: Number(taxRow.rate || 0),
          };
        });

        const invoiceDiscountRate = Math.min(
          100,
          Math.max(0, Number(data.discount_rate || 0))
        );

        // ---- Per-item cascade, recomputed from raw inputs only ----
        const preparedItems = [];
        let subtotal = 0;
        let itemDiscountTotal = 0;
        let itemTaxTotal = 0;

        for (const item of data.items) {
          if (!item.product_id) continue;

          const enteredQuantity = Number(item.entered_quantity || 0);
          const enteredPrice = Number(item.entered_price || 0);
          const factor = Number(item.unit_conversion_factor || 1);

          if (enteredQuantity <= 0 || enteredPrice < 0) {
            throw new Error("INVALID ITEM DATA");
          }

          const baseQuantity = enteredQuantity * factor;
          const basePrice = factor > 0 ? enteredPrice / factor : enteredPrice;
          const total = enteredQuantity * enteredPrice;

          const discountRate = Math.min(
            100,
            Math.max(0, Number(item.discount_rate || 0))
          );
          const discount = Number(((total * discountRate) / 100).toFixed(2));
          const afterDiscount = total - discount;

          let taxId = null;
          let taxRate = 0;

          if (item.tax_id) {
            const taxRow = db
              .prepare(
                `SELECT rate FROM taxes WHERE id = ? AND category IN ('product', 'both')`
              )
              .get(item.tax_id);
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

          // Extended (same as create-sales-invoice) to also pull type +
          // current base unit name in the same query as costPrice — used
          // below to skip stock apply for services and to snapshot the
          // base unit onto the movement.
          const productRow = db
            .prepare(
              `
            SELECT p.costPrice, p.type, p.code, pu.unit_name AS base_unit_name
            FROM products p
            LEFT JOIN product_units pu
              ON pu.product_id = p.id AND pu.is_base = 1
            WHERE p.id = ?
            `
            )
            .get(item.product_id);
          const buyingPrice = Number(productRow?.costPrice || 0);
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

        if (subtotal <= 0) {
          throw new Error("INVALID TOTALS");
        }

        const afterItemDiscounts = subtotal - itemDiscountTotal;

        const invoiceDiscount = Number(
          ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2)
        );
        const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

        // ---- Each invoice tax computed independently, then summed ----
        let invoiceTaxValueTotal = 0;
        const preparedInvoiceTaxes = invoiceTaxes.map((tax) => {
          const value = Number(
            ((afterInvoiceDiscount * tax.tax_rate) / 100).toFixed(2)
          );
          invoiceTaxValueTotal += value;
          return { ...tax, tax_value: value };
        });
        invoiceTaxValueTotal = Number(invoiceTaxValueTotal.toFixed(2));

        const invoiceTaxRateSum = Number(
          invoiceTaxes.reduce((sum, t) => sum + t.tax_rate, 0).toFixed(2)
        );

        const netTotal = Number(
          Math.max(
            0,
            afterInvoiceDiscount + itemTaxTotal + invoiceTaxValueTotal
          ).toFixed(2)
        );

        // ---- Reverse old stock, delete old items/movements ----
        const oldItems = db
          .prepare(`SELECT * FROM sales_invoice_items WHERE invoice_id = ?`)
          .all(data.id);

        const reverseStock = db.prepare(`
        UPDATE products SET quantity = quantity + ? WHERE id = ?
      `);
        const applyStock = db.prepare(`
        UPDATE products SET quantity = quantity - ? WHERE id = ?
      `);

        // type is immutable once a product exists (never changes after
        // creation), so checking it NOW against these old rows is exactly
        // equivalent to checking it at the time they were originally
        // created — no drift risk from looking it up fresh here.
        for (const item of oldItems) {
          const productRow = db
            .prepare(`SELECT type FROM products WHERE id = ?`)
            .get(item.product_id);
          const wasService = productRow?.type === "service";

          if (!wasService) {
            reverseStock.run(item.quantity || 0, item.product_id);
          }
        }

        db.prepare(`DELETE FROM sales_invoice_items WHERE invoice_id = ?`).run(
          data.id
        );
        db.prepare(
          `
        DELETE FROM product_movements
        WHERE reference_type = 'sale' AND reference_id = ?
      `
        ).run(data.id);

        // ---- Delete + reinsert invoice-level tax rows, same pattern as items ----
        db.prepare(`DELETE FROM sales_invoice_taxes WHERE invoice_id = ?`).run(
          data.id
        );

        const insertInvoiceTax = db.prepare(`
        INSERT INTO sales_invoice_taxes
        (invoice_id, tax_id, tax_name, tax_rate, tax_value)
        VALUES (?, ?, ?, ?, ?)
      `);

        for (const tax of preparedInvoiceTaxes) {
          insertInvoiceTax.run(
            data.id,
            tax.tax_id,
            tax.tax_name,
            tax.tax_rate,
            tax.tax_value
          );
        }

        // ---- Insert new items + apply stock + record movements ----
        const insertItem = db.prepare(`
          INSERT INTO sales_invoice_items
          (
            invoice_id, product_id, quantity, price, buyingPrice, total,
            product_name, product_code, unit_name, unit_conversion_factor,
            tax_id, tax_rate, taxValue,
            discount, discount_rate, description
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of preparedItems) {
          insertItem.run(
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
            item.description
          );

          // Services have no physical stock — same rule as create.
          if (!item.isService) {
            applyStock.run(item.baseQuantity, item.product_id);
          }

          createProductMovement(db, {
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

        // ---- Update invoice header — tax column dropped ----
        const invoiceName =
          data.invoice_name?.trim() || oldInvoice.invoice_name;

        db.prepare(
          `
        UPDATE sales_invoices
        SET customer_id = ?,
            invoice_name = ?,
            description = ?,
            date = ?,
            subtotal = ?,
            discount = ?,
            discount_rate = ?,
            taxRate = ?,
            taxValue = ?,
            net_total = ?,
            updated_by = ?
        WHERE id = ?
      `
        ).run(
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
          data.id
        );

        // ---- Party history ----
        if (oldCustomerId && oldCustomerId === newCustomerId) {
          db.prepare(
            `
          UPDATE party_history
          SET amount = ?, date = ?, note = ?
          WHERE invoice_id = ? AND invoice_type = 'sales' AND record_type = 'invoice'
        `
          ).run(netTotal, fullDateTime, invoiceName, data.id);
        } else {
          if (oldCustomerId) {
            db.prepare(
              `
            DELETE FROM party_history
            WHERE invoice_id = ? AND invoice_type = 'sales' AND record_type = 'invoice'
          `
            ).run(data.id);
          }

          if (newCustomerId) {
            createPartyHistory(db, {
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
      });

      transaction();
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // DELETE
  ipcMain.handle("delete-sales-invoice", (event, id) => {
    try {
      const transaction = db.transaction(() => {
        const invoice = db
          .prepare(`SELECT * FROM sales_invoices WHERE id = ?`)
          .get(id);

        if (!invoice) {
          throw new Error("SALES INVOICE NOT FOUND");
        }

        const hasReturn = db
          .prepare(
            `
            SELECT 1
            FROM sales_return_items sri
            JOIN sales_invoice_items sii ON sii.id = sri.sales_invoice_item_id
            WHERE sii.invoice_id = ?
            LIMIT 1
          `
          )
          .get(id);

        if (hasReturn) {
          throw new Error("CANNOT_DELETE_INVOICE_WITH_RETURN");
        }

        const hasPayment = db
          .prepare(
            `
            SELECT 1 FROM payment_allocations
            WHERE invoice_id = ? AND invoice_type = 'sales'
            LIMIT 1
          `
          )
          .get(id);

        if (hasPayment) {
          throw new Error("CANNOT_DELETE_PAID_INVOICE");
        }

        const items = db
          .prepare(`SELECT * FROM sales_invoice_items WHERE invoice_id = ?`)
          .all(id);

        const reverseStock = db.prepare(`
          UPDATE products SET quantity = quantity + ? WHERE id = ?
        `);

        for (const item of items) {
          reverseStock.run(item.quantity || 0, item.product_id);
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
          createProductMovement(db, {
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

        db.prepare(`DELETE FROM sales_invoice_items WHERE invoice_id = ?`).run(
          id
        );
        db.prepare(
          `
          DELETE FROM party_history
          WHERE invoice_id = ? AND invoice_type = 'sales'
        `
        ).run(id);
        db.prepare(`DELETE FROM sales_invoices WHERE id = ?`).run(id);
      });

      transaction();
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // POS CHECKOUT
  ipcMain.handle("pos-checkout", (event, data) => {
    try {
      const transaction = db.transaction(() => {
        if (!Array.isArray(data.items) || data.items.length === 0) {
          throw new Error("ERROR ENTER DATA");
        }

        const rawDate = data.date || new Date().toISOString();
        const dateOnly = rawDate.slice(0, 10);
        const time = new Date().toTimeString().slice(0, 8);
        const fullDateTime = `${dateOnly} ${time}`;

        // ---- Invoice-level taxes — PARALLEL, same model as create-sales-invoice.
        // Never trust client-sent rates — every id re-validated and re-priced here. ----
        const requestedTaxIds = Array.isArray(data.taxes)
          ? [...new Set(data.taxes.filter(Boolean))]
          : [];

        const invoiceTaxes = requestedTaxIds.map((taxId) => {
          const taxRow = db
            .prepare(
              `SELECT id, name, rate FROM taxes WHERE id = ? AND category IN ('invoice', 'both')`
            )
            .get(taxId);
          if (!taxRow) {
            throw new Error("INVALID_TAX_ID");
          }
          return {
            tax_id: taxRow.id,
            tax_name: taxRow.name,
            tax_rate: Number(taxRow.rate || 0),
          };
        });

        const invoiceDiscountRate = Math.min(
          100,
          Math.max(0, Number(data.discount_rate || 0))
        );

        // ---- Stock guard — read fresh inside the transaction, never trust
        // anything the client claims about allowing negative stock ----
        const companySettings = db
          .prepare(`SELECT allow_negative_stock FROM company_settings LIMIT 1`)
          .get();
        const allowNegativeStock = Boolean(
          companySettings?.allow_negative_stock
        );

        // ---- Per-item cascade — identical to create-sales-invoice ----
        const preparedItems = [];
        let subtotal = 0;
        let itemDiscountTotal = 0;
        let itemTaxTotal = 0;

        for (const item of data.items) {
          const enteredQuantity = Number(
            item.entered_quantity ?? item.qty ?? 0
          );
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

          const productRow = db
            .prepare(
              `
            SELECT p.name, p.quantity, p.costPrice, p.type, p.code,
                   pu.unit_name AS base_unit_name
            FROM products p
            LEFT JOIN product_units pu
              ON pu.product_id = p.id AND pu.is_base = 1
            WHERE p.id = ?
            `
            )
            .get(productId);

          if (!productRow) {
            throw new Error("PRODUCT_NOT_FOUND");
          }

          const isService = productRow.type === "service";

          if (!allowNegativeStock && !isService) {
            if (productRow.quantity - baseQuantity < 0) {
              throw new Error(`INSUFFICIENT_STOCK:${productRow.name}`);
            }
          }

          const discountRate = Math.min(
            100,
            Math.max(0, Number(item.discount_rate || 0))
          );
          const discount = Number(((total * discountRate) / 100).toFixed(2));
          const afterDiscount = total - discount;

          let taxId = null;
          let taxRate = 0;

          if (item.tax_id) {
            const taxRow = db
              .prepare(
                `SELECT rate FROM taxes WHERE id = ? AND category IN ('product', 'both')`
              )
              .get(item.tax_id);
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

          const buyingPrice = Number(productRow.costPrice || 0);

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

        if (subtotal <= 0) {
          throw new Error("INVALID TOTALS");
        }

        const afterItemDiscounts = subtotal - itemDiscountTotal;

        const invoiceDiscount = Number(
          ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2)
        );
        const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

        // ---- Each invoice tax computed independently off the same base,
        // then summed (parallel model) ----
        let invoiceTaxValueTotal = 0;
        const preparedInvoiceTaxes = invoiceTaxes.map((tax) => {
          const value = Number(
            ((afterInvoiceDiscount * tax.tax_rate) / 100).toFixed(2)
          );
          invoiceTaxValueTotal += value;
          return { ...tax, tax_value: value };
        });
        invoiceTaxValueTotal = Number(invoiceTaxValueTotal.toFixed(2));

        // Sum-of-rates — display convenience only, never used in computation
        const invoiceTaxRateSum = Number(
          invoiceTaxes.reduce((sum, t) => sum + t.tax_rate, 0).toFixed(2)
        );

        const netTotal = Number(
          Math.max(
            0,
            afterInvoiceDiscount + itemTaxTotal + invoiceTaxValueTotal
          ).toFixed(2)
        );

        // ---- Payments — multi-fund, POS-specific ----
        const roundCents = (value) =>
          Math.round(Number(value || 0) * 100) / 100;

        const payments = Array.isArray(data.payments)
          ? data.payments
              .map((payment) => ({
                fundId: Number(payment.fundId || payment.fund_id),
                amount: Number(payment.amount || 0),
                amountFundCurrency: Number(
                  payment.amount_fund_currency ||
                    payment.amountFundCurrency ||
                    payment.paymentInfundCurrency ||
                    0
                ),
                currencyCode: payment.currency_code,
                exchangeRate: Number(payment.exchange_rate || 1) || 1,
              }))
              .filter(
                (payment) =>
                  payment.fundId &&
                  payment.amount > 0 &&
                  payment.amountFundCurrency > 0
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
          payments.reduce((sum, payment) => sum + payment.amount, 0)
        );

        if (!payments.length || Math.abs(paidTotal - netTotal) > 0.01) {
          throw new Error("POS payments must exactly cover invoice total");
        }

        // ---- Insert invoice header — tax column dropped ----
        const invoiceResult = db
          .prepare(
            `
            INSERT INTO sales_invoices
            (
              customer_id, invoice_name, description, channel, date,
              subtotal, discount, discount_rate,
              taxRate, taxValue,
              net_total, created_by
            )
            VALUES (?, ?, ?, 'pos', ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
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
            data.created_by || null
          );

        const invoiceId = invoiceResult.lastInsertRowid;

        let invoiceName = data.invoice_name?.trim();
        if (!invoiceName) {
          invoiceName = buildDefaultInvoiceName(db, "sales", invoiceId);
          db.prepare(
            `UPDATE sales_invoices SET invoice_name = ? WHERE id = ?`
          ).run(invoiceName, invoiceId);
        }

        // ---- Insert invoice-level tax rows ----
        const insertInvoiceTax = db.prepare(`
          INSERT INTO sales_invoice_taxes
          (invoice_id, tax_id, tax_name, tax_rate, tax_value)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const tax of preparedInvoiceTaxes) {
          insertInvoiceTax.run(
            invoiceId,
            tax.tax_id,
            tax.tax_name,
            tax.tax_rate,
            tax.tax_value
          );
        }

        // ---- Insert items + reduce stock + record movements ----
        const insertItem = db.prepare(`
          INSERT INTO sales_invoice_items
          (
            invoice_id, product_id, quantity, price, buyingPrice, total,
            product_name, product_code, unit_name, unit_conversion_factor,
            tax_id, tax_rate, taxValue,
            discount, discount_rate, description
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const updateStock = db.prepare(`
          UPDATE products SET quantity = quantity - ? WHERE id = ?
        `);

        for (const item of preparedItems) {
          insertItem.run(
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
            item.description
          );

          // Services have no physical stock — never decremented.
          if (!item.isService) {
            updateStock.run(item.baseQuantity, item.product_id);
          }

          createProductMovement(db, {
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

        // ---- Party history (only when a real customer is attached) ----
        if (data.customer_id) {
          createPartyHistory(db, {
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
          const paymentId = createPayment(db, {
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

          createFundHistory(db, {
            fund_id: payment.fundId,
            record_type: "payment",
            payment_id: paymentId,
            movement_type: "in",
            amount: payment.amountFundCurrency,
            date: fullDateTime,
            note: buildDefaultPaymentNote(db, "payment", invoiceName),
          });

          insertedPaymentIds.push(paymentId);
        }

        return { invoiceId, invoiceName, paymentIds: insertedPaymentIds };
      });

      return { success: true, ...transaction() };
    } catch (err) {
      return {
        success: false,
        error: err.message || String(err),
        code: err.code,
      };
    }
  });

  ipcMain.handle("get-daily-pos-report", (event, params = {}) => {
    const date = params.date || new Date().toLocaleDateString("en-CA");
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const rows = db
      .prepare(
        `
      SELECT * FROM (
        SELECT
          s.id,
          s.date,
          s.net_total,
          s.net_total AS paid_amount,
          'paid' AS status,
          'sale' AS type,
          NULL AS sales_invoice_id,
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
        WHERE DATE(s.date) = ? AND s.channel = 'pos'
  
        UNION ALL
  
        SELECT
          r.id,
          r.date,
          r.net_total,
          r.net_total AS paid_amount,
          NULL AS status,
          'return' AS type,
          r.sales_invoice_id,
          NULL AS return_status
        FROM sales_returns r
        WHERE DATE(r.date) = ? AND r.channel = 'pos'
      )
      ORDER BY date DESC, id DESC
      LIMIT ? OFFSET ?
      `
      )
      .all(date, date, limit, offset);

    const { total } = db
      .prepare(
        `
        SELECT
          (SELECT COUNT(*) FROM sales_invoices WHERE DATE(date) = ? AND channel = 'pos') +
          (SELECT COUNT(*) FROM sales_returns WHERE DATE(date) = ? AND channel = 'pos') AS total
        `
      )
      .get(date, date);

    const salesStats = db
      .prepare(
        `
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(s.net_total), 0) AS total,
          COALESCE(SUM(s.taxValue), 0)
            + COALESCE(SUM(itemAgg.item_tax_total), 0) AS taxTotal
        FROM sales_invoices s
        LEFT JOIN (
          SELECT invoice_id, SUM(taxValue) AS item_tax_total
          FROM sales_invoice_items
          GROUP BY invoice_id
        ) itemAgg ON itemAgg.invoice_id = s.id
        WHERE DATE(s.date) = ? AND s.channel = 'pos'
        `
      )
      .get(date);

    const returnStats = db
      .prepare(
        `
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(r.net_total), 0) AS total,
          COALESCE(SUM(r.taxValue), 0)
            + COALESCE(SUM(itemAgg.item_tax_total), 0) AS taxTotal
        FROM sales_returns r
        LEFT JOIN (
          SELECT return_id, SUM(taxValue) AS item_tax_total
          FROM sales_return_items
          GROUP BY return_id
        ) itemAgg ON itemAgg.return_id = r.id
        WHERE DATE(r.date) = ? AND r.channel = 'pos'
        `
      )
      .get(date);

    const fundIn = db
      .prepare(
        `
        SELECT
          f.id AS fund_id,
          f.name AS fund_name,
          cur.code AS currency_code,
          cur.symbol AS currency_symbol,
          COALESCE(SUM(p.amount), 0) AS amount,
          COALESCE(SUM(p.amount_fund_currency), 0) AS fund_amount
        FROM payment_allocations pa
        JOIN payments p ON p.id = pa.payment_id
        JOIN funds f ON f.id = p.fund_id
        JOIN currencies cur ON cur.id = f.currency_id
        JOIN sales_invoices s ON s.id = pa.invoice_id
        WHERE pa.invoice_type = 'sales'
          AND DATE(s.date) = ?
          AND s.channel = 'pos'
        GROUP BY f.id, f.name, cur.code, cur.symbol
        ORDER BY amount DESC
        `
      )
      .all(date);

    const fundOut = db
      .prepare(
        `
        SELECT
          f.id AS fund_id,
          f.name AS fund_name,
          cur.code AS currency_code,
          cur.symbol AS currency_symbol,
          COALESCE(SUM(p.amount), 0) AS amount,
          COALESCE(SUM(p.amount_fund_currency), 0) AS fund_amount
        FROM payment_allocations pa
        JOIN payments p ON p.id = pa.payment_id
        JOIN funds f ON f.id = p.fund_id
        JOIN currencies cur ON cur.id = f.currency_id
        JOIN sales_returns r ON r.id = pa.invoice_id
        WHERE pa.invoice_type = 'sales_return'
          AND DATE(r.date) = ?
          AND r.channel = 'pos'
        GROUP BY f.id, f.name, cur.code, cur.symbol
        ORDER BY amount DESC
        `
      )
      .all(date);

    // Per-invoice fund allocations — unchanged, batched for just the ids on
    // this page, grouped by invoice_id + fund.
    const saleIds = rows.filter((r) => r.type === "sale").map((r) => r.id);
    const returnIds = rows.filter((r) => r.type === "return").map((r) => r.id);

    const getInvoiceAllocations = (ids, invoiceType) => {
      if (!ids.length) return [];
      const placeholders = ids.map(() => "?").join(",");
      return db
        .prepare(
          `
          SELECT
            pa.invoice_id,
            f.id AS fund_id,
            f.name AS fund_name,
            cur.code AS currency_code,
            cur.symbol AS currency_symbol,
            COALESCE(SUM(p.amount), 0) AS amount,
            COALESCE(SUM(p.amount_fund_currency), 0) AS fund_amount
          FROM payment_allocations pa
          JOIN payments p ON p.id = pa.payment_id
          JOIN funds f ON f.id = p.fund_id
          JOIN currencies cur ON cur.id = f.currency_id
          WHERE pa.invoice_type = ? AND pa.invoice_id IN (${placeholders})
          GROUP BY pa.invoice_id, f.id, f.name, cur.code, cur.symbol
          `
        )
        .all(invoiceType, ...ids);
    };

    const saleAllocations = getInvoiceAllocations(saleIds, "sales").map(
      (a) => ({ ...a, rowType: "sale" })
    );
    const returnAllocations = getInvoiceAllocations(
      returnIds,
      "sales_return"
    ).map((a) => ({ ...a, rowType: "return" }));

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
    const companySettings = db
      .prepare(
        `SELECT company_name, company_latin_name, language FROM company_settings LIMIT 1`
      )
      .get();
    const language = getReceiptLanguage(
      data.language || companySettings?.language
    );
    const labels = receiptLabels[language];
    const direction = language === "ar" ? "rtl" : "ltr";
    const companyName =
      companySettings?.company_name ||
      companySettings?.company_latin_name ||
      "POS System";

    const items = data.items || [];

    const hasAnyItemDiscount = items.some(
      (item) => Number(item.discount || 0) > 0
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
    `
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

    return printReceiptHtml(html, data.printerName);
  });
}
