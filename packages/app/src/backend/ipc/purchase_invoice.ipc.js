const { ipcMain } = require("electron");
import db from "../db";
import createFundHistory from "../utils/createFundHistory";
import createPayment from "../utils/createPayment";
import createPartyHistory from "../utils/createPaymentHistory";
import createProductMovement from "../utils/createPorductMovment";
import {
  buildDefaultInvoiceName,
  buildDefaultPaymentNote,
} from "../utils/helpers";
import { applyPartyCredit } from "../utils/partyCredit";
export default function registerPurchaseInvoicesIPC() {
  // CREATE
  ipcMain.handle("create-purchase-invoice", (event, data) => {
    try {
      const transaction = db.transaction(() => {
        if (
          !data.supplier_id ||
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

        // ---- Invoice-level taxes — PARALLEL, same model as sales.
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

        // ---- Per-item cascade, recomputed from raw inputs only ----
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

          preparedItems.push({
            product_id: item.product_id,
            product_name: item.name || null,
            product_code: item.code || null,
            unit_name: item.unit_name || null,
            unit_conversion_factor: factor,
            baseQuantity,
            basePrice,
            total,
            discount_rate: discountRate,
            discount,
            tax_id: taxId,
            tax_rate: taxRate,
            taxValue,
            description: item.description || null,
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
            INSERT INTO purchase_invoices
            (
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            data.supplier_id,
            data.invoice_name?.trim() || null,
            data.description?.trim() || null,
            fullDateTime,
            subtotal,
            invoiceDiscount,
            invoiceDiscountRate,
            invoiceTaxRateSum,
            invoiceTaxValueTotal,
            netTotal,
            data.created_by
          );

        const invoiceId = invoiceResult.lastInsertRowid;

        let invoiceName = data.invoice_name?.trim();
        if (!invoiceName) {
          invoiceName = buildDefaultInvoiceName(db, "purchase", invoiceId);
          db.prepare(
            `UPDATE purchase_invoices SET invoice_name = ? WHERE id = ?`
          ).run(invoiceName, invoiceId);
        }

        // ---- Insert invoice-level tax rows ----
        const insertInvoiceTax = db.prepare(`
          INSERT INTO purchase_invoice_taxes
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

        // ---- Insert items + update stock + record movements ----
        const insertItem = db.prepare(`
          INSERT INTO purchase_invoice_items
          (
            invoice_id, product_id, quantity, price, total,
           product_name, product_code, unit_name, unit_conversion_factor,
            tax_id, tax_rate, taxValue,
            discount, discount_rate, description
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const updateStockAndCost = db.prepare(`
          UPDATE products
          SET quantity = quantity + ?, costPrice = ?
          WHERE id = ?
        `);

        // Service products have no physical stock — quantity is never
        // touched for them, only cost (buyingPrice/margin tracking is
        // still kept per product decision, even without real inventory).
        const updateCostOnly = db.prepare(`
          UPDATE products
          SET costPrice = ?
          WHERE id = ?
        `);

        for (const item of preparedItems) {
          insertItem.run(
            invoiceId,
            item.product_id,
            item.baseQuantity,
            item.basePrice,
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

          // Also pulls the current base unit's name here — needed for the
          // movement snapshot below, and needed regardless of type since
          // this is a plain informational join, not a stock decision.
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

          if (isService) {
            updateCostOnly.run(item.basePrice, item.product_id);
          } else {
            updateStockAndCost.run(
              item.baseQuantity,
              item.basePrice,
              item.product_id
            );
          }

          createProductMovement(db, {
            product_id: item.product_id,
            reference_id: invoiceId,
            reference_type: "purchase",
            type: "in",
            action: "create",
            quantity: item.baseQuantity,
            enterPrice: item.basePrice,
            date: fullDateTime,
            base_unit_name: productRow?.base_unit_name || null,
            unit_name: item.unit_name,
            conversion_factor: item.unit_conversion_factor,
          });
        }

        // ---- Party history, payment/credit (unchanged) ----
        createPartyHistory(db, {
          party_type: "supplier",
          party_id: data.supplier_id,
          invoice_id: invoiceId,
          invoice_type: "purchase",
          record_type: "invoice",
          movement_type: "increase",
          amount: netTotal,
          date: fullDateTime,
          note: invoiceName,
        });

        let insertPaymentId = null;
        let creditApplied = null;

        if (isPaid && isCredit) {
          creditApplied = applyPartyCredit(db, {
            partyId: payment.party_id,
            partyType: payment.party_type,
            invoiceId,
            invoiceType: "purchase",
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
            fundOperation: "subtract",
            date: fullDateTime,
            created_by: data.created_by,
          });
          createFundHistory(db, {
            fund_id: payment.fund_id,
            record_type: "payment",
            payment_id: insertPaymentId,
            movement_type: "out",
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
  ipcMain.handle("get-purchase-invoices", (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const whereConditions = [];
    const whereParams = [];
    const havingConditions = [];
    const havingParams = [];

    if (params.dateFrom) {
      whereConditions.push("DATE(p.date) >= ?");
      whereParams.push(params.dateFrom);
    }
    if (params.dateTo) {
      whereConditions.push("DATE(p.date) <= ?");
      whereParams.push(params.dateTo);
    }
    if (params.supplierId) {
      whereConditions.push("p.supplier_id = ?");
      whereParams.push(params.supplierId);
    }
    if (
      params.minTotal !== undefined &&
      params.minTotal !== "" &&
      params.minTotal !== null
    ) {
      whereConditions.push("p.net_total >= ?");
      whereParams.push(Number(params.minTotal));
    }
    if (
      params.maxTotal !== undefined &&
      params.maxTotal !== "" &&
      params.maxTotal !== null
    ) {
      whereConditions.push("p.net_total <= ?");
      whereParams.push(Number(params.maxTotal));
    }

    if (Array.isArray(params.taxIds) && params.taxIds.length) {
      const taxPlaceholders = params.taxIds.map(() => "?").join(",");
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM purchase_invoice_taxes pit
          WHERE pit.invoice_id = p.id AND pit.tax_id IN (${taxPlaceholders})
        )
      `);
      whereParams.push(...params.taxIds);
    }

    if (params.status) {
      havingConditions.push(`
      CASE
        WHEN COALESCE(SUM(pa.amount), 0) >= p.net_total THEN 'paid'
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
      p.*,
      s.name AS supplier_name,
      s.phone AS supplier_phone,
      creator.full_name AS created_by_name,
      updater.full_name AS updated_by_name,
      invoiceTaxAgg.taxes_json,
      COALESCE(SUM(pa.amount), 0) AS paid_amount,

      COALESCE(itemAgg.item_tax_total, 0) AS item_tax_total,
      COALESCE(itemAgg.item_discount_total, 0) AS item_discount_total,
      (p.taxValue + COALESCE(itemAgg.item_tax_total, 0)) AS total_tax_value,
      (p.discount + COALESCE(itemAgg.item_discount_total, 0)) AS total_discount_value,

      p.net_total - COALESCE(SUM(pa.amount), 0) AS remaining_amount,

      CASE
        WHEN COALESCE(SUM(pa.amount), 0) >= p.net_total THEN 'paid'
        WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END AS status,

      CASE
        WHEN COALESCE(ret.total_returned, 0) <= 0 THEN 'none'
        WHEN ret.total_returned >= ret.total_quantity THEN 'full'
        ELSE 'partial'
      END AS return_status

    FROM purchase_invoices p

    LEFT JOIN suppliers s
      ON s.id = p.supplier_id

    LEFT JOIN payment_allocations pa
      ON pa.invoice_id = p.id
     AND pa.invoice_type = 'purchase'

    LEFT JOIN users creator
      ON creator.id = p.created_by

    LEFT JOIN users updater
      ON updater.id = p.updated_by

    LEFT JOIN (
      SELECT
        invoice_id,
        SUM(taxValue) AS item_tax_total,
        SUM(discount) AS item_discount_total
      FROM purchase_invoice_items
      GROUP BY invoice_id
    ) itemAgg ON itemAgg.invoice_id = p.id

    LEFT JOIN (
      SELECT
        invoice_id,
        json_group_array(
          json_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
        ) AS taxes_json
      FROM purchase_invoice_taxes
      GROUP BY invoice_id
    ) invoiceTaxAgg ON invoiceTaxAgg.invoice_id = p.id

    LEFT JOIN (
      SELECT
        pi.invoice_id,
        SUM(pi.quantity) AS total_quantity,
        SUM(COALESCE(pri.returned_qty, 0)) AS total_returned
      FROM purchase_invoice_items pi
      LEFT JOIN (
        SELECT purchase_invoice_item_id, SUM(quantity) AS returned_qty
        FROM purchase_return_items
        GROUP BY purchase_invoice_item_id
      ) pri ON pri.purchase_invoice_item_id = pi.id
      GROUP BY pi.invoice_id
    ) ret ON ret.invoice_id = p.id

      ${whereClause}
    GROUP BY p.id
      ${havingClause}

    ORDER BY p.id DESC

    LIMIT ? OFFSET ?
    `
      )
      .all(...whereParams, ...havingParams, limit, offset);

    const { total } = db
      .prepare(
        `
      SELECT COUNT(*) AS total FROM (
        SELECT p.id
        FROM purchase_invoices p
        LEFT JOIN payment_allocations pa
          ON pa.invoice_id = p.id AND pa.invoice_type = 'purchase'
        LEFT JOIN (
          SELECT
            pi.invoice_id,
            SUM(pi.quantity) AS total_quantity,
            SUM(COALESCE(pri.returned_qty, 0)) AS total_returned
          FROM purchase_invoice_items pi
          LEFT JOIN (
            SELECT purchase_invoice_item_id, SUM(quantity) AS returned_qty
            FROM purchase_return_items
            GROUP BY purchase_invoice_item_id
          ) pri ON pri.purchase_invoice_item_id = pi.id
          GROUP BY pi.invoice_id
        ) ret ON ret.invoice_id = p.id
        ${whereClause}
        GROUP BY p.id
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

  // GET ONE
  ipcMain.handle("get-purchase-invoice", (event, id) => {
    const invoice = db
      .prepare(
        `
    SELECT 
      pi.*,
      s.name AS supplier_name,
      s.phone AS supplier_phone,
      creator.full_name AS created_by_name,
      updater.full_name AS updated_by_name,
      COALESCE(pa_sum.paid_amount, 0) AS paid_amount,
      pi.net_total - COALESCE(pa_sum.paid_amount, 0) AS remaining_amount,

      CASE
        WHEN COALESCE(pa_sum.paid_amount, 0) >= pi.net_total THEN 'paid'
        WHEN COALESCE(pa_sum.paid_amount, 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END AS status

    FROM purchase_invoices pi
    LEFT JOIN suppliers s ON s.id = pi.supplier_id

    LEFT JOIN users creator
    ON creator.id = pi.created_by

    LEFT JOIN users updater
    ON updater.id = pi.updated_by

    LEFT JOIN (
      SELECT invoice_id, SUM(amount) AS paid_amount
      FROM payment_allocations
      WHERE invoice_type = 'purchase'
      GROUP BY invoice_id
    ) pa_sum ON pa_sum.invoice_id = pi.id
    WHERE pi.id = ?
  `
      )
      .get(id);

    if (!invoice) return null;

    const items = db
      .prepare(
        `
  SELECT
    pii.*,
    p.name AS name,
    t.name AS tax_name,

    COALESCE(r.returned_quantity, 0) AS returned_quantity,

    (
      pii.quantity - COALESCE(r.returned_quantity, 0)
    ) AS available_quantity

  FROM purchase_invoice_items pii

  LEFT JOIN products p
    ON p.id = pii.product_id

  LEFT JOIN taxes t
    ON t.id = pii.tax_id

  LEFT JOIN (
    SELECT
      pri.purchase_invoice_item_id,
      SUM(pri.quantity) AS returned_quantity
    FROM purchase_return_items pri
    INNER JOIN purchase_returns pr
      ON pr.id = pri.return_id
    GROUP BY pri.purchase_invoice_item_id
  ) r
    ON r.purchase_invoice_item_id = pii.id

  WHERE pii.invoice_id = ?
  `
      )
      .all(id);

    // ---- Invoice-level taxes, one row per applied tax ----
    const taxes = db
      .prepare(
        `
        SELECT id, tax_id, tax_name, tax_rate, tax_value
        FROM purchase_invoice_taxes
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
      AND pa.invoice_type = 'purchase'
    ORDER BY pa.id ASC
  `
      )
      .all(id);

    return {
      ...invoice,
      items,
      taxes,
      allocations,
    };
  });
  // UPDATE
  ipcMain.handle("update-purchase-invoice", (event, data) => {
    if (
      !data.id ||
      !data.supplier_id ||
      !data.date ||
      !Array.isArray(data.items) ||
      data.items.length === 0
    ) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const oldInvoice = db
      .prepare(`SELECT * FROM purchase_invoices WHERE id = ?`)
      .get(data.id);

    if (!oldInvoice) {
      return { success: false, error: "Invoice not found" };
    }

    const hasReturn = db
      .prepare(
        `
      SELECT 1
      FROM purchase_return_items pri
      JOIN purchase_invoice_items pii ON pii.id = pri.purchase_invoice_item_id
      WHERE pii.invoice_id = ?
      LIMIT 1
    `
      )
      .get(data.id);

    if (hasReturn) {
      return { success: false, error: "CANNOT_MODIFY_INVOICE_WITH_RETURN" };
    }

    const oldSupplierId = oldInvoice.supplier_id || null;
    const newSupplierId = data.supplier_id || null;

    try {
      const transaction = db.transaction(() => {
        const dateOnly = data.date.slice(0, 10);
        const time = new Date().toTimeString().slice(0, 8);
        const fullDateTime = `${dateOnly} ${time}`;

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

          preparedItems.push({
            product_id: item.product_id,
            product_name: item.name || null,
            product_code: item.code || null,
            unit_name: item.unit_name || null,
            unit_conversion_factor: factor,
            baseQuantity,
            basePrice,
            total,
            discount_rate: discountRate,
            discount,
            tax_id: taxId,
            tax_rate: taxRate,
            taxValue,
            description: item.description || null,
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

        // ---- Aggregate old vs new BASE quantities per product, for stock diff ----
        const oldItems = db
          .prepare(`SELECT * FROM purchase_invoice_items WHERE invoice_id = ?`)
          .all(data.id);

        const oldByProduct = new Map();
        for (const item of oldItems) {
          const cur = oldByProduct.get(item.product_id) || {
            quantity: 0,
            price: item.price,
          };
          oldByProduct.set(item.product_id, {
            quantity: cur.quantity + Number(item.quantity || 0),
            price: item.price,
          });
        }

        const newByProduct = new Map();
        for (const item of preparedItems) {
          const cur = newByProduct.get(item.product_id) || {
            quantity: 0,
            price: item.basePrice,
            unit_name: item.unit_name,
            conversion_factor: item.unit_conversion_factor,
          };
          newByProduct.set(item.product_id, {
            quantity: cur.quantity + item.baseQuantity,
            price: item.basePrice,
            unit_name: item.unit_name,
            conversion_factor: item.unit_conversion_factor,
          });
        }

        // Batched lookup of each involved product's type + current base
        // unit name — needed to (a) skip stock adjustment for services and
        // (b) snapshot the base unit onto movement rows below.
        const involvedProductIds = [
          ...new Set([...oldByProduct.keys(), ...newByProduct.keys()]),
        ];
        const productInfoById = new Map();
        if (involvedProductIds.length) {
          const placeholders = involvedProductIds.map(() => "?").join(",");
          const rows = db
            .prepare(
              `
              SELECT p.id, p.type, pu.unit_name AS base_unit_name
              FROM products p
              LEFT JOIN product_units pu
                ON pu.product_id = p.id AND pu.is_base = 1
              WHERE p.id IN (${placeholders})
              `
            )
            .all(...involvedProductIds);
          for (const row of rows) {
            productInfoById.set(row.id, row);
          }
        }

        const adjustStock = db.prepare(
          `UPDATE products SET quantity = quantity + ? WHERE id = ?`
        );

        const updateMovement = db.prepare(`
        UPDATE product_movements
        SET quantity = ?, enterPrice = ?, action = 'update', date = ?,
            base_unit_name = ?, unit_name = ?, conversion_factor = ?
        WHERE reference_type = 'purchase' AND reference_id = ? AND product_id = ?
      `);
        const deleteMovement = db.prepare(`
        DELETE FROM product_movements
        WHERE reference_type = 'purchase' AND reference_id = ? AND product_id = ?
      `);

        for (const [productId, old] of oldByProduct) {
          if (!newByProduct.has(productId)) {
            const isService =
              productInfoById.get(productId)?.type === "service";
            // Service products never had their quantity incremented at
            // creation time (see create-purchase-invoice), so removing
            // them here must not decrement it either — that would
            // subtract stock that was never actually added.
            if (!isService) {
              adjustStock.run(-old.quantity, productId);
            }
            deleteMovement.run(data.id, productId);
          }
        }

        for (const [productId, next] of newByProduct) {
          const old = oldByProduct.get(productId);
          const oldQty = old ? old.quantity : 0;
          const delta = next.quantity - oldQty;
          const info = productInfoById.get(productId);
          const isService = info?.type === "service";

          if (delta !== 0 && !isService) {
            adjustStock.run(delta, productId);
          }

          db.prepare(`UPDATE products SET costPrice = ? WHERE id = ?`).run(
            next.price,
            productId
          );

          if (old) {
            updateMovement.run(
              next.quantity,
              next.price,
              fullDateTime,
              info?.base_unit_name || null,
              next.unit_name,
              next.conversion_factor,
              data.id,
              productId
            );
          } else {
            createProductMovement(db, {
              product_id: productId,
              reference_id: data.id,
              reference_type: "purchase",
              action: "create",
              type: "in",
              quantity: next.quantity,
              enterPrice: next.price,
              date: fullDateTime,
              base_unit_name: info?.base_unit_name || null,
              unit_name: next.unit_name,
              conversion_factor: next.conversion_factor,
            });
          }
        }

        // ---- Delete + reinsert invoice-level tax rows, same pattern as items ----
        db.prepare(
          `DELETE FROM purchase_invoice_taxes WHERE invoice_id = ?`
        ).run(data.id);

        const insertInvoiceTax = db.prepare(`
        INSERT INTO purchase_invoice_taxes
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

        // ---- Replace items ----
        db.prepare(
          `DELETE FROM purchase_invoice_items WHERE invoice_id = ?`
        ).run(data.id);

        const insertItem = db.prepare(`
        INSERT INTO purchase_invoice_items
        (
          invoice_id, product_id, quantity, price, total,
        product_name, product_code, unit_name, unit_conversion_factor,
          tax_id, tax_rate, taxValue,
          discount, discount_rate, description
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

        for (const item of preparedItems) {
          insertItem.run(
            data.id,
            item.product_id,
            item.baseQuantity,
            item.basePrice,
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
        }

        // ---- Update invoice header — tax column dropped ----
        const invoiceName =
          data.invoice_name?.trim() || oldInvoice.invoice_name;

        db.prepare(
          `
        UPDATE purchase_invoices
        SET supplier_id = ?, invoice_name = ?, description = ?, date = ?,
            subtotal = ?, discount = ?, discount_rate = ?,
            taxRate = ?, taxValue = ?, net_total = ?, updated_by = ?
        WHERE id = ?
      `
        ).run(
          newSupplierId,
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
        if (oldSupplierId && oldSupplierId === newSupplierId) {
          db.prepare(
            `
          UPDATE party_history
          SET amount = ?, date = ?, note = ?
          WHERE invoice_id = ? AND invoice_type = 'purchase' AND record_type = 'invoice'
        `
          ).run(netTotal, fullDateTime, invoiceName, data.id);
        } else {
          if (oldSupplierId) {
            db.prepare(
              `
            DELETE FROM party_history
            WHERE invoice_id = ? AND invoice_type = 'purchase' AND record_type = 'invoice'
          `
            ).run(data.id);
          }

          if (newSupplierId) {
            createPartyHistory(db, {
              party_type: "supplier",
              party_id: newSupplierId,
              invoice_id: data.id,
              invoice_type: "purchase",
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
  ipcMain.handle("delete-purchase-invoice", (event, id) => {
    const invoice = db
      .prepare(`SELECT * FROM purchase_invoices WHERE id = ?`)
      .get(id);

    if (!invoice) {
      return { success: false, error: "PURCHASE INVOICE NOT FOUND" };
    }

    const hasReturn = db
      .prepare(
        `
        SELECT 1
        FROM purchase_return_items pri
        JOIN purchase_invoice_items pii ON pii.id = pri.purchase_invoice_item_id
        WHERE pii.invoice_id = ?
        LIMIT 1
      `
      )
      .get(id);

    if (hasReturn) {
      return { success: false, error: "CANNOT_DELETE_INVOICE_WITH_RETURN" };
    }

    const hasPayment = db
      .prepare(
        `
        SELECT 1 FROM payment_allocations
        WHERE invoice_id = ? AND invoice_type = 'purchase'
        LIMIT 1
      `
      )
      .get(id);

    if (hasPayment) {
      return { success: false, error: "CANNOT_DELETE_PAID_INVOICE" };
    }

    const transaction = db.transaction(() => {
      const items = db
        .prepare(`SELECT * FROM purchase_invoice_items WHERE invoice_id = ?`)
        .all(id);
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

      const reverseStock = db.prepare(`
        UPDATE products
        SET quantity = quantity - ?
        WHERE id = ?
      `);

      for (const item of items) {
        reverseStock.run(item.quantity || 0, item.product_id);

        createProductMovement(db, {
          product_id: item.product_id,
          reference_id: id,
          reference_type: "purchase",
          action: "delete",
          type: "out",
          quantity: item.quantity,
          enterPrice: item.price,
          date: date,
        });
      }

      db.prepare(`DELETE FROM purchase_invoice_items WHERE invoice_id = ?`).run(
        id
      );
      db.prepare(
        `
        DELETE FROM party_history
        WHERE invoice_id = ? AND invoice_type = 'purchase'
      `
      ).run(id);
      db.prepare(`DELETE FROM purchase_invoices WHERE id = ?`).run(id);
    });

    try {
      transaction();
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
}
