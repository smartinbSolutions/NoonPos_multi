const { ipcMain } = require("electron");
import db from "../db";
import { buildDefaultInvoiceName } from "../utils/helpers";

export default function registerSalesQuotationsIPC() {
  ipcMain.handle("create-sales-quotation", (event, data) => {
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

        // ---- Quotation-level taxes — same PARALLEL pattern as invoices ----
        const requestedTaxIds = Array.isArray(data.taxes)
          ? [...new Set(data.taxes.filter(Boolean))]
          : [];

        const quotationTaxes = requestedTaxIds.map((taxId) => {
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

        const quotationDiscountRate = Math.min(
          100,
          Math.max(0, Number(data.discount_rate || 0))
        );

        // ---- Per-item cascade — no product lookup: nothing to snapshot
        // (no buyingPrice/isService) since a quotation has no stock effect
        // and product_id may not even reference a real row ----
        const preparedItems = [];
        let subtotal = 0;
        let itemDiscountTotal = 0;
        let itemTaxTotal = 0;

        for (const item of data.items) {
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
            // null is valid here — the product may never have existed
            product_id: item.product_id || null,
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

        const quotationDiscount = Number(
          ((afterItemDiscounts * quotationDiscountRate) / 100).toFixed(2)
        );
        const afterQuotationDiscount = afterItemDiscounts - quotationDiscount;

        let quotationTaxValueTotal = 0;
        const preparedQuotationTaxes = quotationTaxes.map((tax) => {
          const value = Number(
            ((afterQuotationDiscount * tax.tax_rate) / 100).toFixed(2)
          );
          quotationTaxValueTotal += value;
          return { ...tax, tax_value: value };
        });
        quotationTaxValueTotal = Number(quotationTaxValueTotal.toFixed(2));

        const quotationTaxRateSum = Number(
          quotationTaxes.reduce((sum, t) => sum + t.tax_rate, 0).toFixed(2)
        );

        const netTotal = Number(
          Math.max(
            0,
            afterQuotationDiscount + itemTaxTotal + quotationTaxValueTotal
          ).toFixed(2)
        );

        // ---- Insert quotation header — no channel, no payment ----
        const quotationResult = db
          .prepare(
            `
          INSERT INTO sales_quotations
            (customer_id, quotation_name, description, status, date,
             subtotal, discount, discount_rate,
             taxRate, taxValue,
             created_by, updated_by, net_total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            data.customer_id || null,
            data.quotation_name?.trim() || null,
            data.description?.trim() || null,
            "draft",
            fullDateTime,
            subtotal,
            quotationDiscount,
            quotationDiscountRate,
            quotationTaxRateSum,
            quotationTaxValueTotal,
            data.created_by || null,
            null,
            netTotal
          );

        const quotationId = quotationResult.lastInsertRowid;

        let quotationName = data.quotation_name?.trim();
        if (!quotationName) {
          quotationName = buildDefaultInvoiceName(
            db,
            "sales_quotation",
            quotationId
          );
          db.prepare(
            `UPDATE sales_quotations SET quotation_name = ? WHERE id = ?`
          ).run(quotationName, quotationId);
        }

        // ---- Insert quotation-level tax rows ----
        const insertQuotationTax = db.prepare(`
          INSERT INTO sales_quotation_taxes
          (quotation_id, tax_id, tax_name, tax_rate, tax_value)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const tax of preparedQuotationTaxes) {
          insertQuotationTax.run(
            quotationId,
            tax.tax_id,
            tax.tax_name,
            tax.tax_rate,
            tax.tax_value
          );
        }

        // ---- Insert items — no stock, no movements ----
        const insertItem = db.prepare(`
          INSERT INTO sales_quotation_items
          (
            quotation_id, product_id, quantity, price, total,
            product_name, product_code, unit_name, unit_conversion_factor,
            tax_id, tax_rate, taxValue,
            discount, discount_rate, description
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of preparedItems) {
          insertItem.run(
            quotationId,
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

        return { quotationId, quotationName };
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

  ipcMain.handle("update-sales-quotation", (event, data) => {
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
        const oldQuotation = db
          .prepare(`SELECT * FROM sales_quotations WHERE id = ?`)
          .get(data.id);

        if (!oldQuotation) {
          throw new Error("SALES_QUOTATION_NOT_FOUND");
        }

        // ---- Resolve quotation-level taxes — same as create ----
        const requestedTaxIds = Array.isArray(data.taxes)
          ? [...new Set(data.taxes.filter(Boolean))]
          : [];

        const quotationTaxes = requestedTaxIds.map((taxId) => {
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

        const quotationDiscountRate = Math.min(
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
            product_id: item.product_id || null,
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

        const quotationDiscount = Number(
          ((afterItemDiscounts * quotationDiscountRate) / 100).toFixed(2)
        );
        const afterQuotationDiscount = afterItemDiscounts - quotationDiscount;

        let quotationTaxValueTotal = 0;
        const preparedQuotationTaxes = quotationTaxes.map((tax) => {
          const value = Number(
            ((afterQuotationDiscount * tax.tax_rate) / 100).toFixed(2)
          );
          quotationTaxValueTotal += value;
          return { ...tax, tax_value: value };
        });
        quotationTaxValueTotal = Number(quotationTaxValueTotal.toFixed(2));

        const quotationTaxRateSum = Number(
          quotationTaxes.reduce((sum, t) => sum + t.tax_rate, 0).toFixed(2)
        );

        const netTotal = Number(
          Math.max(
            0,
            afterQuotationDiscount + itemTaxTotal + quotationTaxValueTotal
          ).toFixed(2)
        );

        // ---- Delete + reinsert items — no stock reversal, no movements ----
        db.prepare(
          `DELETE FROM sales_quotation_items WHERE quotation_id = ?`
        ).run(data.id);

        db.prepare(
          `DELETE FROM sales_quotation_taxes WHERE quotation_id = ?`
        ).run(data.id);

        const insertQuotationTax = db.prepare(`
          INSERT INTO sales_quotation_taxes
          (quotation_id, tax_id, tax_name, tax_rate, tax_value)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const tax of preparedQuotationTaxes) {
          insertQuotationTax.run(
            data.id,
            tax.tax_id,
            tax.tax_name,
            tax.tax_rate,
            tax.tax_value
          );
        }

        const insertItem = db.prepare(`
          INSERT INTO sales_quotation_items
          (
            quotation_id, product_id, quantity, price, total,
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

        // ---- Update quotation header ----
        const quotationName =
          data.quotation_name?.trim() || oldQuotation.quotation_name;

        db.prepare(
          `
          UPDATE sales_quotations
          SET customer_id = ?,
              quotation_name = ?,
              description = ?,
              status = ?,
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
          data.customer_id || null,
          quotationName,
          data.description?.trim() || null,
          data.status || oldQuotation.status,
          fullDateTime,
          subtotal,
          quotationDiscount,
          quotationDiscountRate,
          quotationTaxRateSum,
          quotationTaxValueTotal,
          netTotal,
          data.updated_by,
          data.id
        );
      });

      transaction();
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // GET ALL SALES QUOTATIONS
  ipcMain.handle("get-sales-quotations", (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const whereConditions = [];
    const whereParams = [];

    if (params.dateFrom) {
      whereConditions.push("DATE(q.date) >= ?");
      whereParams.push(params.dateFrom);
    }
    if (params.dateTo) {
      whereConditions.push("DATE(q.date) <= ?");
      whereParams.push(params.dateTo);
    }
    if (params.customerId) {
      whereConditions.push("q.customer_id = ?");
      whereParams.push(params.customerId);
    }
    if (params.status) {
      whereConditions.push("q.status = ?");
      whereParams.push(params.status);
    }
    if (
      params.minTotal !== undefined &&
      params.minTotal !== "" &&
      params.minTotal !== null
    ) {
      whereConditions.push("q.net_total >= ?");
      whereParams.push(Number(params.minTotal));
    }
    if (
      params.maxTotal !== undefined &&
      params.maxTotal !== "" &&
      params.maxTotal !== null
    ) {
      whereConditions.push("q.net_total <= ?");
      whereParams.push(Number(params.maxTotal));
    }
    if (Array.isArray(params.taxIds) && params.taxIds.length) {
      const taxPlaceholders = params.taxIds.map(() => "?").join(",");
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM sales_quotation_taxes sqt
          WHERE sqt.quotation_id = q.id AND sqt.tax_id IN (${taxPlaceholders})
        )
      `);
      whereParams.push(...params.taxIds);
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    const quotations = db
      .prepare(
        `
      SELECT
        q.*,
        c.name AS customer_name,
        c.phone AS customer_phone,
        creator.full_name AS created_by_name,
        updater.full_name AS updated_by_name,
        invoiceTaxAgg.taxes_json,
  
        COALESCE(itemAgg.item_tax_total, 0) AS item_tax_total,
        COALESCE(itemAgg.item_discount_total, 0) AS item_discount_total,
        (q.taxValue + COALESCE(itemAgg.item_tax_total, 0)) AS total_tax_value,
        (q.discount + COALESCE(itemAgg.item_discount_total, 0)) AS total_discount_value
  
      FROM sales_quotations q
  
      LEFT JOIN customers c
        ON c.id = q.customer_id
  
      LEFT JOIN users creator
        ON creator.id = q.created_by
  
      LEFT JOIN users updater
        ON updater.id = q.updated_by
  
      LEFT JOIN (
        SELECT
          quotation_id,
          SUM(taxValue) AS item_tax_total,
          SUM(discount) AS item_discount_total
        FROM sales_quotation_items
        GROUP BY quotation_id
      ) itemAgg ON itemAgg.quotation_id = q.id
  
      LEFT JOIN (
        SELECT
          quotation_id,
          json_group_array(
            json_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
          ) AS taxes_json
        FROM sales_quotation_taxes
        GROUP BY quotation_id
      ) invoiceTaxAgg ON invoiceTaxAgg.quotation_id = q.id
  
      ${whereClause}
      ORDER BY q.id DESC
      LIMIT ? OFFSET ?
      `
      )
      .all(...whereParams, limit, offset);

    const { total } = db
      .prepare(
        `
        SELECT COUNT(*) AS total
        FROM sales_quotations q
        ${whereClause}
        `
      )
      .get(...whereParams);

    const quotationsWithParsedTaxes = quotations.map((q) => ({
      ...q,
      taxes: q.taxes_json ? JSON.parse(q.taxes_json) : [],
    }));

    return {
      data: quotationsWithParsedTaxes,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  // GET ONE SALES QUOTATION
  ipcMain.handle("get-sales-quotation", (event, id) => {
    const quotation = db
      .prepare(
        `
      SELECT
        q.*,
        c.name AS customer_name,
        c.phone AS customer_phone,
        creator.full_name AS created_by_name,
        updater.full_name AS updated_by_name
      FROM sales_quotations q
      LEFT JOIN customers c ON c.id = q.customer_id
      LEFT JOIN users creator ON creator.id = q.created_by
      LEFT JOIN users updater ON updater.id = q.updated_by
      WHERE q.id = ?
      `
      )
      .get(id);

    if (!quotation) return null;

    // LEFT JOIN products — product_id may be null, or point to a product
    // that no longer exists; p.name simply comes back null in that case,
    // and product_name (the snapshot) is what the UI should fall back to.
    const items = db
      .prepare(
        `
      SELECT
        qi.*,
        p.name,
        t.name AS tax_name
      FROM sales_quotation_items qi
      LEFT JOIN products p ON p.id = qi.product_id
      LEFT JOIN taxes t ON t.id = qi.tax_id
      WHERE qi.quotation_id = ?
      `
      )
      .all(id);

    const taxes = db
      .prepare(
        `
        SELECT id, tax_id, tax_name, tax_rate, tax_value
        FROM sales_quotation_taxes
        WHERE quotation_id = ?
        ORDER BY id ASC
        `
      )
      .all(id);

    return {
      ...quotation,
      items,
      taxes,
    };
  });

  ipcMain.handle("delete-sales-quotation", (event, id) => {
    try {
      const transaction = db.transaction(() => {
        const quotation = db
          .prepare(`SELECT * FROM sales_quotations WHERE id = ?`)
          .get(id);

        if (!quotation) {
          throw new Error("SALES_QUOTATION_NOT_FOUND");
        }

        if (quotation.status === "accepted") {
          throw new Error("CANNOT_DELETE_ACCEPTED_QUOTATION");
        }

        // No stock, no movements, no party_history, no payments — a quotation
        // never touched any of them, so deletion is just removing the rows.
        db.prepare(
          `DELETE FROM sales_quotation_items WHERE quotation_id = ?`
        ).run(id);
        db.prepare(
          `DELETE FROM sales_quotation_taxes WHERE quotation_id = ?`
        ).run(id);
        db.prepare(`DELETE FROM sales_quotations WHERE id = ?`).run(id);
      });

      transaction();
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
