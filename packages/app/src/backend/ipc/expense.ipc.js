const { ipcMain } = require("electron");
import db from "../db";
import createFundHistory from "../utils/createFundHistory";
import createPayment from "../utils/createPayment";
import createPartyHistory from "../utils/createPaymentHistory";
import { buildDefaultInvoiceName } from "../utils/helpers";
import { applyPartyCredit } from "../utils/partyCredit";

export default function registerExpenseIPC() {
  ipcMain.handle("create-expense", (event, data) => {
    try {
      const transaction = db.transaction(() => {
        if (
          !data.date ||
          !Array.isArray(data.items) ||
          data.items.length === 0
        ) {
          throw new Error("MISSING_REQUIRED_FIELDS");
        }

        const dateOnly = data.date.slice(0, 10);
        const now = new Date();
        const time = now.toTimeString().slice(0, 8);
        const fullDateTime = `${dateOnly} ${time}`;

        // ---- Invoice-level taxes — PARALLEL, same model as sales/purchase ----
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

        // ---- Per-item cascade: total = price (no quantity for expenses) ----
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
            category_id: item.category_id,
            price,
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
          throw new Error("INVALID_TOTALS");
        }

        const afterItemDiscounts = subtotal - itemDiscountTotal;

        const invoiceDiscount = Number(
          ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2)
        );
        const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

        // ---- Each invoice tax computed independently off the same base ----
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

        const invoiceResult = db
          .prepare(
            `
            INSERT INTO expense
            (supplier_id, invoice_name, description, date,
             subtotal, discount, discount_rate, taxRate, taxValue,
             net_total, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
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
            data.created_by
          );
        const invoiceId = invoiceResult.lastInsertRowid;

        let invoiceName = data.invoice_name?.trim();
        if (!invoiceName) {
          invoiceName = buildDefaultInvoiceName(db, "expense", invoiceId);
          db.prepare(`UPDATE expense SET invoice_name = ? WHERE id = ?`).run(
            invoiceName,
            invoiceId
          );
        }

        const insertInvoiceTax = db.prepare(`
          INSERT INTO expense_taxes
          (expense_id, tax_id, tax_name, tax_rate, tax_value)
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

        const insertItem = db.prepare(`
          INSERT INTO expense_items
          (expense_id, category_id, price, total,
           discount, discount_rate, tax_id, tax_rate, taxValue, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of preparedItems) {
          insertItem.run(
            invoiceId,
            item.category_id,
            item.price,
            item.total,
            item.discount,
            item.discount_rate,
            item.tax_id,
            item.tax_rate,
            item.taxValue,
            item.description
          );
        }

        if (data.supplier_id) {
          createPartyHistory(db, {
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
          creditApplied = applyPartyCredit(db, {
            partyId: payment.party_id,
            partyType: payment.party_type,
            invoiceId,
            invoiceType: "expense",
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
            note: `${invoiceName}`,
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
            note: invoiceName,
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
      };
    }
  });

  ipcMain.handle("get-expenses", (event, params = {}) => {
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

    if (startDate) {
      whereConditions.push("date(e.date) >= date(?)");
      whereValues.push(startDate);
    }
    if (endDate) {
      whereConditions.push("date(e.date) <= date(?)");
      whereValues.push(endDate);
    }
    if (supplier_id === "none") {
      whereConditions.push("e.supplier_id IS NULL");
    } else if (supplier_id) {
      whereConditions.push("e.supplier_id = ?");
      whereValues.push(supplier_id);
    }
    if (Array.isArray(params.taxIds) && params.taxIds.length) {
      const taxPlaceholders = params.taxIds.map(() => "?").join(",");
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM expense_taxes et
          WHERE et.expense_id = e.id AND et.tax_id IN (${taxPlaceholders})
        )
      `);
      whereValues.push(...params.taxIds);
    }
    if (minTotal !== undefined && minTotal !== "" && minTotal !== null) {
      whereConditions.push("e.net_total >= ?");
      whereValues.push(Number(minTotal));
    }
    if (maxTotal !== undefined && maxTotal !== "" && maxTotal !== null) {
      whereConditions.push("e.net_total <= ?");
      whereValues.push(Number(maxTotal));
    }
    if (category_id) {
      whereConditions.push(
        "EXISTS (SELECT 1 FROM expense_items ei WHERE ei.expense_id = e.id AND ei.category_id = ?)"
      );
      whereValues.push(category_id);
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    const havingClause = status ? `HAVING status = ?` : "";
    const havingValues = status ? [status] : [];

    try {
      const rows = db
        .prepare(
          `
        SELECT
          e.*,
          s.name AS supplier_name,
          s.phone AS supplier_phone,
          creator.full_name AS created_by_name,
          updater.full_name AS updated_by_name,
    
          COALESCE(SUM(pa.amount), 0) AS paid_amount,
          e.net_total - COALESCE(SUM(pa.amount), 0) AS remaining_amount,
    
          CASE
            WHEN COALESCE(SUM(pa.amount), 0) >= e.net_total THEN 'paid'
            WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
            ELSE 'unpaid'
          END AS status,
    
          COALESCE(itemAgg.item_tax_total, 0) AS item_tax_total,
          COALESCE(itemAgg.item_discount_total, 0) AS item_discount_total,
          (e.taxValue + COALESCE(itemAgg.item_tax_total, 0)) AS total_tax_value,
          (e.discount + COALESCE(itemAgg.item_discount_total, 0)) AS total_discount_value,
    
          expenseTaxAgg.taxes_json,
    
          (
            SELECT GROUP_CONCAT(DISTINCT ec.name)
            FROM expense_items ei2
            JOIN expence_category ec ON ec.id = ei2.category_id
            WHERE ei2.expense_id = e.id
          ) AS category_names
    
        FROM expense e
    
        LEFT JOIN suppliers s
          ON s.id = e.supplier_id
    
        LEFT JOIN users creator
          ON creator.id = e.created_by
    
        LEFT JOIN users updater
          ON updater.id = e.updated_by
    
        LEFT JOIN payment_allocations pa
          ON pa.invoice_id = e.id
         AND pa.invoice_type = 'expense'
    
        LEFT JOIN (
          SELECT
            expense_id,
            SUM(taxValue) AS item_tax_total,
            SUM(discount) AS item_discount_total
          FROM expense_items
          GROUP BY expense_id
        ) itemAgg ON itemAgg.expense_id = e.id
    
        LEFT JOIN (
          SELECT
            expense_id,
            json_group_array(
              json_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
            ) AS taxes_json
          FROM expense_taxes
          GROUP BY expense_id
        ) expenseTaxAgg ON expenseTaxAgg.expense_id = e.id
    
        ${whereClause}
    
        GROUP BY e.id
    
        ${havingClause}
    
        ORDER BY e.id DESC
    
        LIMIT ? OFFSET ?
        `
        )
        .all(...whereValues, ...havingValues, limit, offset);

      const countHaving = status
        ? `
      HAVING 
        CASE
          WHEN COALESCE(SUM(pa.amount), 0) >= e.net_total THEN 'paid'
          WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END = ?
    `
        : "";

      const { total } = db
        .prepare(
          `
      SELECT COUNT(*) AS total
      FROM (
        SELECT e.id
        FROM expense e
    
        LEFT JOIN payment_allocations pa
          ON pa.invoice_id = e.id
         AND pa.invoice_type = 'expense'
    
        ${whereClause}
    
        GROUP BY e.id
    
        ${countHaving}
      )
      `
        )
        .get(...whereValues, ...(status ? [status] : []));

      const rowsWithParsedTaxes = rows.map((row) => ({
        ...row,
        taxes: row.taxes_json ? JSON.parse(row.taxes_json) : [],
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

  // GET ONE
  ipcMain.handle("get-expense", (event, id) => {
    try {
      const invoice = db
        .prepare(
          `
          SELECT 
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
          WHERE e.id = ?
          `
        )
        .get(id);

      if (!invoice) return null;

      const items = db
        .prepare(
          `
          SELECT 
            ei.*,
            c.name AS category_name,
            t.name AS tax_name
          FROM expense_items ei
          LEFT JOIN expence_category c ON c.id = ei.category_id
          LEFT JOIN taxes t ON t.id = ei.tax_id
          WHERE ei.expense_id = ?
          `
        )
        .all(id);

      const taxes = db
        .prepare(
          `
          SELECT id, tax_id, tax_name, tax_rate, tax_value
          FROM expense_taxes
          WHERE expense_id = ?
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
            f.name AS fund_name,
            c.code AS fund_currency_code,
            c.symbol AS fund_currency_symbol
          FROM payment_allocations pa
          LEFT JOIN payments p ON p.id = pa.payment_id
          LEFT JOIN funds f ON f.id = p.fund_id
          LEFT JOIN currencies c ON c.id = f.currency_id
          WHERE pa.invoice_id = ?
            AND pa.invoice_type = 'expense'
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
    } catch (err) {
      console.error("Failed to load expense:", err);
      return null;
    }
  });

  // UPDATE
  ipcMain.handle("update-expense", (event, data) => {
    if (
      !data.id ||
      !data.date ||
      !Array.isArray(data.items) ||
      data.items.length === 0
    ) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    try {
      const transaction = db.transaction(() => {
        const oldInvoice = db
          .prepare(`SELECT * FROM expense WHERE id = ?`)
          .get(data.id);

        if (!oldInvoice) {
          throw new Error("EXPENSE_NOT_FOUND");
        }

        const existingPayment = db
          .prepare(
            `
          SELECT pa.id
          FROM payment_allocations pa
          WHERE pa.invoice_id = ? AND pa.invoice_type = 'expense'
          LIMIT 1
          `
          )
          .get(data.id);

        if (existingPayment) {
          throw new Error("CANNOT_EDIT_PAID_EXPENSE");
        }

        const oldSupplierId = oldInvoice.supplier_id || null;
        const newSupplierId = data.supplier_id || null;

        const dateOnly = data.date.slice(0, 10);
        const now = new Date();
        const time = now.toTimeString().slice(0, 8);
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

        // ---- Per-item cascade ----
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
            category_id: item.category_id,
            price,
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
          throw new Error("INVALID_TOTALS");
        }

        const afterItemDiscounts = subtotal - itemDiscountTotal;

        const invoiceDiscount = Number(
          ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2)
        );
        const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

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

        const invoiceName =
          data.invoice_name?.trim() ||
          oldInvoice.invoice_name ||
          buildDefaultInvoiceName(db, "expense", data.id);

        db.prepare(
          `
          UPDATE expense
          SET supplier_id = ?,
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
          data.id
        );

        // ---- Replace items ----
        db.prepare(`DELETE FROM expense_items WHERE expense_id = ?`).run(
          data.id
        );

        const insertItem = db.prepare(`
          INSERT INTO expense_items
          (expense_id, category_id, price, total,
           discount, discount_rate, tax_id, tax_rate, taxValue, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of preparedItems) {
          insertItem.run(
            data.id,
            item.category_id,
            item.price,
            item.total,
            item.discount,
            item.discount_rate,
            item.tax_id,
            item.tax_rate,
            item.taxValue,
            item.description
          );
        }

        // ---- Replace invoice-level taxes ----
        db.prepare(`DELETE FROM expense_taxes WHERE expense_id = ?`).run(
          data.id
        );

        const insertInvoiceTax = db.prepare(`
          INSERT INTO expense_taxes
          (expense_id, tax_id, tax_name, tax_rate, tax_value)
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

        // ---- Party history reconciliation ----
        if (oldSupplierId && oldSupplierId === newSupplierId) {
          db.prepare(
            `
            UPDATE party_history
            SET amount = ?, date = ?, note = ?
            WHERE invoice_id = ? AND invoice_type = 'expense' AND record_type = 'invoice'
          `
          ).run(netTotal, fullDateTime, invoiceName, data.id);
        } else {
          if (oldSupplierId) {
            db.prepare(
              `
              DELETE FROM party_history
              WHERE invoice_id = ? AND invoice_type = 'expense' AND record_type = 'invoice'
            `
            ).run(data.id);
          }

          if (newSupplierId) {
            createPartyHistory(db, {
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

        // ---- New payment attached in this same edit ----
        const payment = data.payment || null;
        let insertPaymentId = null;

        if (payment && Number(payment.amount || 0) > 0) {
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
            invoice_id: data.id,
            invoice_type: payment.mode,
            note: payment.note || invoiceName,
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
            note: payment.note || invoiceName,
          });
        }

        return { invoiceId: data.id, paymentId: insertPaymentId };
      });

      const result = transaction();
      return { success: true, ...result };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // DELETE
  ipcMain.handle("delete-expense", (event, id) => {
    try {
      const existingPayment = db
        .prepare(
          `
          SELECT pa.id
          FROM payment_allocations pa
          WHERE pa.invoice_id = ? AND pa.invoice_type = 'expense'
          LIMIT 1
          `
        )
        .get(id);

      if (existingPayment) {
        return { success: false, error: "CANNOT_DELETE_PAID_EXPENSE" };
      }

      const transaction = db.transaction(() => {
        db.prepare(`DELETE FROM expense_items WHERE expense_id = ?`).run(id);
        db.prepare(`DELETE FROM expense_taxes WHERE expense_id = ?`).run(id);
        db.prepare(
          `
          DELETE FROM party_history
          WHERE invoice_id = ?
            AND invoice_type = 'expense'
            AND record_type = 'invoice'
        `
        ).run(id);
        db.prepare(`DELETE FROM expense WHERE id = ?`).run(id);
      });

      transaction();
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
