import { ipcMain } from "electron";
import db from "../db";
import {
  generateRecoveryKey,
  hashPin,
  hashSecret,
  isPinTaken,
} from "../utils/authCrypto";
import { seedData } from "../utils/data";
import { toAppFileUrl } from "../utils/helpers";
import { getProfitLoss } from "../services/reports.service";

// ---------------------------------------------------------------------------
// Dashboard stats helpers
// ---------------------------------------------------------------------------

function getModuleStats(
  db,
  { table, invoiceType, dateColumn = "date", returnTable = null }
) {
  const total =
    db
      .prepare(`SELECT COALESCE(SUM(net_total), 0) AS value FROM ${table}`)
      .get()?.value || 0;

  const today =
    db
      .prepare(
        `
        SELECT COALESCE(SUM(net_total), 0) AS value
        FROM ${table}
        WHERE date(${dateColumn}) = date('now')
      `
      )
      .get()?.value || 0;

  const count =
    db.prepare(`SELECT COUNT(*) AS value FROM ${table}`).get()?.value || 0;

  const trend = db
    .prepare(
      `
      WITH RECURSIVE days(day) AS (
        SELECT date('now', '-6 days')
        UNION ALL
        SELECT date(day, '+1 day') FROM days WHERE day < date('now')
      )
      SELECT
        days.day,
        COALESCE(SUM(t.net_total), 0) AS total
      FROM days
      LEFT JOIN ${table} t ON date(t.${dateColumn}) = days.day
      GROUP BY days.day
      ORDER BY days.day
    `
    )
    .all();

  const statusBreakdown = db
    .prepare(
      `
      SELECT
        COUNT(CASE WHEN COALESCE(pa.allocated, 0) = 0 THEN 1 END) AS unpaid,
        COUNT(CASE WHEN COALESCE(pa.allocated, 0) > 0 AND COALESCE(pa.allocated, 0) < t.net_total THEN 1 END) AS partial,
        COUNT(CASE WHEN COALESCE(pa.allocated, 0) >= t.net_total AND t.net_total > 0 THEN 1 END) AS paid
      FROM ${table} t
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) AS allocated
        FROM payment_allocations
        WHERE invoice_type = ?
        GROUP BY invoice_id
      ) pa ON pa.invoice_id = t.id
    `
    )
    .get(invoiceType);

  let returns = null;
  if (returnTable) {
    const returnsTotal =
      db
        .prepare(
          `SELECT COALESCE(SUM(net_total), 0) AS value FROM ${returnTable}`
        )
        .get()?.value || 0;

    const returnsToday =
      db
        .prepare(
          `
          SELECT COALESCE(SUM(net_total), 0) AS value
          FROM ${returnTable}
          WHERE date(${dateColumn}) = date('now')
        `
        )
        .get()?.value || 0;

    const returnsCount =
      db.prepare(`SELECT COUNT(*) AS value FROM ${returnTable}`).get()?.value ||
      0;

    returns = {
      total: returnsTotal,
      today: returnsToday,
      count: returnsCount,
    };
  }

  return {
    total,
    today,
    count,
    trend,
    paid: statusBreakdown?.paid || 0,
    partial: statusBreakdown?.partial || 0,
    unpaid: statusBreakdown?.unpaid || 0,
    returns, // null for expense, populated object for sales/purchase
    netTotal: returns ? total - returns.total : total,
  };
}

function getCashFlow(db) {
  const row = db
    .prepare(
      `
      SELECT
        -- Operating: cash from normal business activity (customers, suppliers, other)
        COALESCE(SUM(CASE WHEN type = 'income' AND party_type != 'partner' THEN amount END), 0) AS operatingIncome,
        COALESCE(SUM(CASE WHEN type = 'expense' AND party_type != 'partner' THEN amount END), 0) AS operatingExpense,

        -- Financing: cash from partner deposits/withdrawals
        COALESCE(SUM(CASE WHEN type = 'income' AND party_type = 'partner' THEN amount END), 0) AS financingIncome,
        COALESCE(SUM(CASE WHEN type = 'expense' AND party_type = 'partner' THEN amount END), 0) AS financingExpense
      FROM payments
    `
    )
    .get();

  const operating = {
    income: row.operatingIncome,
    expense: row.operatingExpense,
    net: row.operatingIncome - row.operatingExpense,
  };

  const financing = {
    income: row.financingIncome,
    expense: row.financingExpense,
    net: row.financingIncome - row.financingExpense,
  };

  return {
    operating,
    financing,
    totalIncome: row.operatingIncome + row.financingIncome,
    totalExpense: row.operatingExpense + row.financingExpense,
    net: operating.net + financing.net,
  };
}

function getTopSellingProducts(db, limit = 5) {
  const baseQuery = (orderBy) => `
    SELECT
      COALESCE(p.name, 'Unknown') AS name,
      sii.product_id,
      COALESCE(SUM(sii.quantity), 0) AS quantity,
      COALESCE(SUM(sii.total), 0) AS revenue,
      COALESCE(SUM(sii.quantity * sii.buyingPrice), 0) AS cogs
    FROM sales_invoice_items sii
    LEFT JOIN products p ON p.id = sii.product_id
    GROUP BY sii.product_id
    ORDER BY ${orderBy} DESC
    LIMIT ?
  `;

  const byQuantity = db.prepare(baseQuery("quantity")).all(limit);
  const byRevenue = db.prepare(baseQuery("revenue")).all(limit);

  return { byQuantity, byRevenue };
}

function getFundBalances(db) {
  return db
    .prepare(
      `
      SELECT
        f.id,
        f.name,
        c.code AS currency_code,
        c.symbol AS currency_symbol,
        c.exchangeRate AS exchange_rate,
        c.isPrimary AS is_primary,
        COALESCE(SUM(
          CASE WHEN fh.movement_type = 'in' THEN fh.amount ELSE -fh.amount END
        ), 0) AS balance
      FROM funds f
      LEFT JOIN currencies c ON c.id = f.currency_id
      LEFT JOIN fund_history fh ON fh.fund_id = f.id
      GROUP BY f.id
      ORDER BY f.id
    `
    )
    .all();
}

function getTopExpenseCategories(db, limit = 5) {
  return db
    .prepare(
      `
      SELECT
        ec.id AS category_id,
        COALESCE(ec.name, 'Unknown') AS name,
        COALESCE(SUM(ei.price), 0) AS total_spent,
        COUNT(ei.id) AS items_count
      FROM expense_items ei
      LEFT JOIN expence_category ec ON ec.id = ei.category_id
      GROUP BY ei.category_id
      ORDER BY total_spent DESC
      LIMIT ?
    `
    )
    .all(limit);
}

// ---------------------------------------------------------------------------

export default function registerCompanySettingsIPC() {
  ipcMain.handle("get-company-settings", () => {
    const settings = db
      .prepare(
        `
      SELECT * FROM company_settings LIMIT 1
    `
      )
      .get();

    if (!settings) {
      return { exists: false };
    }

    const defaultPosTaxes = db
      .prepare(
        `
        SELECT cdpt.tax_id, t.name, t.rate
        FROM company_default_pos_taxes cdpt
        JOIN taxes t ON t.id = cdpt.tax_id
        ORDER BY cdpt.id ASC
        `
      )
      .all();

    return {
      exists: true,
      settings: {
        ...settings,
        default_pos_taxes: defaultPosTaxes,
      },
    };
  });

  ipcMain.handle("create-company-settings", (event, data) => {
    if (!/^\d{6}$/.test(data.admin_pin || "")) {
      return { success: false, error: "Admin PIN must be exactly 6 digits" };
    }
    if (!data.admin_username?.trim()) {
      return { success: false, error: "Admin username is required" };
    }
    if (!data.country?.trim()) {
      return { success: false, error: "Country is required" };
    }
    if (isPinTaken(db, data.admin_pin)) {
      return { success: false, error: "PIN already in use" };
    }

    const language = ["ar", "en", "tr"].includes(data.language)
      ? data.language
      : "ar";

    const currencyResult = db
      .prepare(
        `
        INSERT INTO currencies (name, latinName, minorName, minorLatinName, code, exchangeRate, symbol, isPrimary)
        VALUES (?,?,?,?,?,?,?,?)
      `
      )
      .run(
        data.currency_name,
        data.latinName,
        data.minor_name || null,
        data.minor_latin_name || null,
        data.code,
        1,
        data.symbol,
        1
      );

    const result = db
      .prepare(
        `
        INSERT INTO company_settings (
          company_name, company_latin_name, phone, address, email, logo,
          country, base_currency_id, language, timezone
        ) VALUES (?,?,?,?,?,?,?,?,?,?)
      `
      )
      .run(
        data.company_name,
        data.company_latin_name,
        data.phone,
        data.address,
        data.email,
        data.logo,
        data.country,
        currencyResult.lastInsertRowid,
        language,
        data.timezone
      );

    db.prepare(
      `
      INSERT INTO users (username, pin_hash, role, full_name, is_active)
      VALUES (?, ?, 'admin', ?, 1)
    `
    ).run(data.admin_username, hashPin(data.admin_pin), data.admin_username);

    const recoveryKey = generateRecoveryKey();
    db.prepare(
      `INSERT INTO security_settings (id, recovery_key_hash, updated_at)
       VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET recovery_key_hash = excluded.recovery_key_hash,
         updated_at = datetime('now')`
    ).run(hashSecret(recoveryKey));

    seedData(db, {
      language,
      currencyId: currencyResult.lastInsertRowid,
    });

    return { success: true, id: result.lastInsertRowid, recoveryKey };
  });

  ipcMain.handle("save-logo", (event, { base64, name }) => {
    const fs = require("fs");
    const path = require("path");
    const { app } = require("electron");

    const uploadDir = path.join(app.getPath("userData"), "uploads");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, name);

    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");

    fs.writeFileSync(filePath, base64Data, "base64");

    return toAppFileUrl(filePath);
  });

  ipcMain.handle("update-company-settings", (event, data) => {
    if (!data.country?.trim()) {
      return { success: false, error: "Country is required" };
    }

    db.prepare(
      `
      UPDATE company_settings SET
        company_name = ?,
        company_latin_name = ?,
        phone = ?,
        address = ?,
        email = ?,
        logo = ?,
        country = ?,
        base_currency_id = ?,
        language = ?,
        timezone = ?,
        allow_negative_stock = ?,
        minimum_stock = ?,
        pos_invoice_tax_mode = ?,
        updatedAt = datetime('now')
      WHERE id = ?
    `
    ).run(
      data.company_name,
      data.company_latin_name,
      data.phone,
      data.address,
      data.email,
      data.logo,
      data.country,
      data.base_currency_id,
      data.language,
      data.timezone,
      data.allow_negative_stock ? 1 : 0,
      Number(data.minimum_stock || 0),
      data.pos_invoice_tax_mode === "fixed" ? "fixed" : "manual",
      data.id
    );

    // ---- Default POS taxes — only touched when the mode is 'fixed' AND
    // the client actually sent a taxIds array. Passing undefined/null
    // (e.g. a settings-form save that doesn't manage this field) leaves
    // the existing list untouched rather than silently wiping it. ----
    if (Array.isArray(data.default_pos_tax_ids)) {
      db.prepare(`DELETE FROM company_default_pos_taxes`).run();

      const insertTax = db.prepare(
        `INSERT INTO company_default_pos_taxes (tax_id) VALUES (?)`
      );

      for (const taxId of data.default_pos_tax_ids) {
        insertTax.run(taxId);
      }
    }

    return { success: true };
  });

  ipcMain.handle("get-dashboard-stats", () => {
    const sales = getModuleStats(db, {
      table: "sales_invoices",
      invoiceType: "sales",
      returnTable: "sales_returns",
    });
    const purchase = getModuleStats(db, {
      table: "purchase_invoices",
      invoiceType: "purchase",
      returnTable: "purchase_returns",
    });
    const expense = getModuleStats(db, {
      table: "expense",
      invoiceType: "expense",
    });
    const profitLoss = getProfitLoss(db);
    const cashFlow = getCashFlow(db);
    const topProducts = getTopSellingProducts(db);
    const topExpenseCategories = getTopExpenseCategories(db);
    const fundBalances = getFundBalances(db);

    const products =
      db.prepare(`SELECT COUNT(*) AS count FROM products`).get()?.count || 0;
    const customers =
      db.prepare(`SELECT COUNT(*) AS count FROM customers`).get()?.count || 0;
    const inventoryValue =
      db
        .prepare(
          `SELECT COALESCE(SUM(quantity * costPrice), 0) AS value FROM products`
        )
        .get()?.value || 0;

    const minimumStock =
      db.prepare(`SELECT minimum_stock FROM company_settings LIMIT 1`).get()
        ?.minimum_stock ?? 5;

    const isInventoryLow = minimumStock > 0 && inventoryValue < minimumStock;

    return {
      sales,
      purchase,
      expense,
      profitLoss,
      cashFlow,
      topProducts,
      topExpenseCategories,
      fundBalances,
      products,
      customers,
      inventoryValue,
      isInventoryLow,
      minimumStock,
    };
  });
}
