// packages/app/src/backend/companySettings.js
import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";
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

async function getModuleStats(
  query,
  { table, invoiceType, dateColumn = "date", returnTable = null },
) {
  const { rows: totalRows } = await query(
    `SELECT COALESCE(SUM(net_total), 0) AS value FROM ${table}`,
  );
  const total = Number(totalRows[0]?.value || 0);

  const { rows: todayRows } = await query(
    `SELECT COALESCE(SUM(net_total), 0) AS value
     FROM ${table}
     WHERE ${dateColumn}::date = CURRENT_DATE`,
  );
  const today = Number(todayRows[0]?.value || 0);

  const { rows: countRows } = await query(
    `SELECT COUNT(*) AS value FROM ${table}`,
  );
  const count = Number(countRows[0]?.value || 0);

  // Postgres: generate_series replaces SQLite's WITH RECURSIVE day generator.
  const { rows: trend } = await query(
    `
    WITH days AS (
      SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'::interval)::date AS day
    )
    SELECT
      days.day,
      COALESCE(SUM(t.net_total), 0) AS total
    FROM days
    LEFT JOIN ${table} t ON t.${dateColumn}::date = days.day
    GROUP BY days.day
    ORDER BY days.day
    `,
  );

  const trendFormatted = trend.map((r) => {
    const d = new Date(r.day);
    const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    return { day, total: Number(r.total) };
  });

  const { rows: statusRows } = await query(
    `
    SELECT
      COUNT(CASE WHEN COALESCE(pa.allocated, 0) = 0 THEN 1 END) AS unpaid,
      COUNT(CASE WHEN COALESCE(pa.allocated, 0) > 0 AND COALESCE(pa.allocated, 0) < t.net_total THEN 1 END) AS partial,
      COUNT(CASE WHEN COALESCE(pa.allocated, 0) >= t.net_total AND t.net_total > 0 THEN 1 END) AS paid
    FROM ${table} t
    LEFT JOIN (
      SELECT invoice_id, SUM(amount) AS allocated
      FROM payment_allocations
      WHERE invoice_type = $1
      GROUP BY invoice_id
    ) pa ON pa.invoice_id = t.id
    `,
    [invoiceType],
  );
  const statusBreakdown = statusRows[0];

  let returns = null;
  if (returnTable) {
    const { rows: returnsTotalRows } = await query(
      `SELECT COALESCE(SUM(net_total), 0) AS value FROM ${returnTable}`,
    );
    const returnsTotal = Number(returnsTotalRows[0]?.value || 0);

    const { rows: returnsTodayRows } = await query(
      `SELECT COALESCE(SUM(net_total), 0) AS value
       FROM ${returnTable}
       WHERE ${dateColumn}::date = CURRENT_DATE`,
    );
    const returnsToday = Number(returnsTodayRows[0]?.value || 0);

    const { rows: returnsCountRows } = await query(
      `SELECT COUNT(*) AS value FROM ${returnTable}`,
    );
    const returnsCount = Number(returnsCountRows[0]?.value || 0);

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
    trend: trendFormatted,
    paid: Number(statusBreakdown?.paid || 0),
    partial: Number(statusBreakdown?.partial || 0),
    unpaid: Number(statusBreakdown?.unpaid || 0),
    returns,
    netTotal: returns ? total - returns.total : total,
  };
}

async function getCashFlow(query) {
  const { rows } = await query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' AND party_type != 'partner' THEN amount END), 0) AS "operatingIncome",
      COALESCE(SUM(CASE WHEN type = 'expense' AND party_type != 'partner' THEN amount END), 0) AS "operatingExpense",
      COALESCE(SUM(CASE WHEN type = 'income' AND party_type = 'partner' THEN amount END), 0) AS "financingIncome",
      COALESCE(SUM(CASE WHEN type = 'expense' AND party_type = 'partner' THEN amount END), 0) AS "financingExpense"
    FROM payments
    `,
  );
  const row = rows[0];

  const operatingIncome = Number(row.operatingIncome);
  const operatingExpense = Number(row.operatingExpense);
  const financingIncome = Number(row.financingIncome);
  const financingExpense = Number(row.financingExpense);

  const operating = {
    income: operatingIncome,
    expense: operatingExpense,
    net: operatingIncome - operatingExpense,
  };

  const financing = {
    income: financingIncome,
    expense: financingExpense,
    net: financingIncome - financingExpense,
  };

  return {
    operating,
    financing,
    totalIncome: operatingIncome + financingIncome,
    totalExpense: operatingExpense + financingExpense,
    net: operating.net + financing.net,
  };
}

async function getTopSellingProducts(query, limit = 5) {
  const baseQuery = (orderBy) => `
    SELECT
      COALESCE(p.name, 'Unknown') AS name,
      sii.product_id,
      COALESCE(SUM(sii.quantity), 0) AS quantity,
      COALESCE(SUM(sii.total), 0) AS revenue,
      COALESCE(SUM(sii.quantity * sii.buying_price), 0) AS cogs
    FROM sales_invoice_items sii
    LEFT JOIN products p ON p.id = sii.product_id
    GROUP BY sii.product_id, p.name
    ORDER BY ${orderBy} DESC
    LIMIT $1
  `;

  const { rows: byQuantity } = await query(baseQuery("quantity"), [limit]);
  const { rows: byRevenue } = await query(baseQuery("revenue"), [limit]);

  const coerce = (rows) =>
    rows.map((r) => ({
      ...r,
      quantity: Number(r.quantity),
      revenue: Number(r.revenue),
      cogs: Number(r.cogs),
    }));

  return { byQuantity: coerce(byQuantity), byRevenue: coerce(byRevenue) };
}

async function getFundBalances(query) {
  const { rows } = await query(
    `
    SELECT
      f.id,
      f.name,
      c.code AS currency_code,
      c.symbol AS currency_symbol,
      c.exchange_rate::float AS exchange_rate,
      c.is_primary AS is_primary,
      COALESCE(SUM(
        CASE WHEN fh.movement_type = 'in' THEN fh.amount ELSE -fh.amount END
      ), 0) AS balance
    FROM funds f
    LEFT JOIN currencies c ON c.id = f.currency_id
    LEFT JOIN fund_history fh ON fh.fund_id = f.id
    GROUP BY f.id, f.name, c.code, c.symbol, c.exchange_rate, c.is_primary
    ORDER BY f.id
    `,
  );

  return rows.map((r) => ({ ...r, balance: Number(r.balance) }));
}

async function getTopExpenseCategories(query, limit = 5) {
  const { rows } = await query(
    `
    SELECT
      ec.id AS category_id,
      COALESCE(ec.name, 'Unknown') AS name,
      COALESCE(SUM(ei.price), 0) AS total_spent,
      COUNT(ei.id) AS items_count
    FROM expense_items ei
    LEFT JOIN expense_category ec ON ec.id = ei.category_id
    GROUP BY ec.id, ei.category_id
    ORDER BY total_spent DESC
    LIMIT $1
    `,
    [limit],
  );

  return rows.map((r) => ({
    ...r,
    total_spent: Number(r.total_spent),
    items_count: Number(r.items_count),
  }));
}

// ---------------------------------------------------------------------------

export default function registerCompanySettingsIPC() {
  ipcMain.handle("get-company-settings", async () => {
    const { rows } = await query(
      `SELECT *,
      created_at::text AS created_at,
      updated_at::text AS updated_at,
      minimum_stock::float AS minimum_stock
    FROM company_settings LIMIT 1`,
    );
    const settings = rows[0];

    if (!settings) {
      return { exists: false };
    }

    const { rows: defaultPosTaxes } = await query(
      `SELECT cdpt.tax_id, t.name, t.rate::float AS rate
     FROM company_default_pos_taxes cdpt
     JOIN taxes t ON t.id = cdpt.tax_id
     ORDER BY cdpt.id ASC`,
    );

    return {
      exists: true,
      settings: {
        ...settings,
        default_pos_taxes: defaultPosTaxes,
      },
    };
  });

  ipcMain.handle("create-company-settings", async (event, data) => {
    if (!/^\d{6}$/.test(data.admin_pin || "")) {
      return { success: false, error: "Admin PIN must be exactly 6 digits" };
    }
    if (!data.admin_username?.trim()) {
      return { success: false, error: "Admin username is required" };
    }
    if (!data.country?.trim()) {
      return { success: false, error: "Country is required" };
    }

    const language = ["ar", "en", "tr"].includes(data.language)
      ? data.language
      : "ar";

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const pinTaken = await isPinTaken(
        client.query.bind(client),
        data.admin_pin,
      );
      if (pinTaken) {
        await client.query("ROLLBACK");
        return { success: false, error: "PIN already in use" };
      }

      const currencyResult = await client.query(
        `INSERT INTO currencies (name, latin_name, minor_name, minor_latin_name, code, exchange_rate, symbol, is_primary)
         VALUES ($1,$2,$3,$4,$5,1,$6,true)
         RETURNING id`,
        [
          data.currency_name,
          data.latinName,
          data.minor_name || null,
          data.minor_latin_name || null,
          data.code,
          data.symbol,
        ],
      );
      const currencyId = currencyResult.rows[0].id;

      const settingsResult = await client.query(
        `INSERT INTO company_settings (
           id, company_name, company_latin_name, phone, address, email, logo,
           country, base_currency_id, language, timezone
         ) VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          data.company_name,
          data.company_latin_name,
          data.phone,
          data.address,
          data.email,
          data.logo,
          data.country,
          currencyId,
          language,
          data.timezone,
        ],
      );

      await client.query(
        `INSERT INTO users (username, pin_hash, role, full_name, is_active)
         VALUES ($1, $2, 'admin', $3, true)`,
        [data.admin_username, hashPin(data.admin_pin), data.admin_username],
      );

      const recoveryKey = generateRecoveryKey();
      await client.query(
        `INSERT INTO security_settings (id, recovery_key_hash, updated_at)
         VALUES (1, $1, now())
         ON CONFLICT (id) DO UPDATE SET
           recovery_key_hash = EXCLUDED.recovery_key_hash,
           updated_at = now()`,
        [hashSecret(recoveryKey)],
      );

      await seedData(client.query.bind(client), { language, currencyId });

      await client.query("COMMIT");

      return { success: true, id: settingsResult.rows[0].id, recoveryKey };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  ipcMain.handle("save-logo", async (event, { base64, name }) => {
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

  ipcMain.handle("update-company-settings", async (event, data) => {
    if (!data.country?.trim()) {
      return { success: false, error: "Country is required" };
    }

    await query(
      `UPDATE company_settings SET
         company_name = $1,
         company_latin_name = $2,
         phone = $3,
         address = $4,
         email = $5,
         logo = $6,
         country = $7,
         base_currency_id = $8,
         language = $9,
         timezone = $10,
         allow_negative_stock = $11,
         minimum_stock = $12,
         pos_invoice_tax_mode = $13,
         updated_at = now()
       WHERE id = $14`,
      [
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
        !!data.allow_negative_stock,
        Number(data.minimum_stock || 0),
        data.pos_invoice_tax_mode === "fixed" ? "fixed" : "manual",
        data.id,
      ],
    );

    if (Array.isArray(data.default_pos_tax_ids)) {
      const client = await getClient();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM company_default_pos_taxes");
        for (const taxId of data.default_pos_tax_ids) {
          await client.query(
            "INSERT INTO company_default_pos_taxes (tax_id) VALUES ($1)",
            [taxId],
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    return { success: true };
  });

  ipcMain.handle("get-dashboard-stats", async () => {
    const sales = await getModuleStats(query, {
      table: "sales_invoices",
      invoiceType: "sales",
      returnTable: "sales_returns",
    });
    const purchase = await getModuleStats(query, {
      table: "purchase_invoices",
      invoiceType: "purchase",
      returnTable: "purchase_returns",
    });
    const expense = await getModuleStats(query, {
      table: "expense",
      invoiceType: "expense",
    });
    const profitLoss = await getProfitLoss(query);
    const cashFlow = await getCashFlow(query);
    const topProducts = await getTopSellingProducts(query);
    const topExpenseCategories = await getTopExpenseCategories(query);
    const fundBalances = await getFundBalances(query);

    const { rows: productsRows } = await query(
      `SELECT COUNT(*) AS count FROM products`,
    );
    const products = Number(productsRows[0]?.count || 0);

    const { rows: customersRows } = await query(
      `SELECT COUNT(*) AS count FROM customers`,
    );
    const customers = Number(customersRows[0]?.count || 0);

    const { rows: inventoryRows } = await query(
      `SELECT COALESCE(SUM(quantity * cost_price), 0) AS value FROM products`,
    );
    const inventoryValue = Number(inventoryRows[0]?.value || 0);

    const { rows: minStockRows } = await query(
      `SELECT minimum_stock::float AS minimum_stock FROM company_settings LIMIT 1`,
    );
    const minimumStock = Number(minStockRows[0]?.minimum_stock ?? 5);

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
