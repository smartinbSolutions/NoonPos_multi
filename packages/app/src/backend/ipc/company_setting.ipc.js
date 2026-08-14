// packages/app/src/backend/companySettings.js
//
// PORTED to Postgres. Dashboard stats (get-dashboard-stats and its
// helpers: getModuleStats, getCashFlow, getTopSellingProducts,
// getFundBalances, getTopExpenseCategories) are DELIBERATELY NOT
// included here — they depend on sales/purchase/expense/products/funds
// modules that haven't been ported yet. That handler will be added back
// once those modules are done; until then, the dashboard will not have
// data from this handler.

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

export default function registerCompanySettingsIPC() {
  // Read-only GET handler — raw data shape, no {success,error} envelope,
  // consistent with the get-party-history-ledger convention.
  ipcMain.handle("get-company-settings", async () => {
    const { rows } = await query("SELECT * FROM company_settings LIMIT 1");
    const settings = rows[0];

    if (!settings) {
      return { exists: false };
    }

    const { rows: defaultPosTaxes } = await query(
      `SELECT cdpt.tax_id, t.name, t.rate
       FROM company_default_pos_taxes cdpt
       JOIN taxes t ON t.id = cdpt.tax_id
       ORDER BY cdpt.id ASC`
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

    // Multi-step write — everything below is one transaction: currency,
    // company_settings, admin user, security_settings, and seed data all
    // succeed together or none of them do.
    const client = await getClient();
    try {
      await client.query("BEGIN");

      // PIN uniqueness check happens inside the transaction too, since
      // this is the very first user — nothing to actually collide with
      // yet, but keeping the check here (rather than before BEGIN) keeps
      // the whole "is this PIN available, then create it" sequence
      // atomic if this handler is ever called concurrently.
      const pinTaken = await isPinTaken(client.query.bind(client), data.admin_pin);
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
        ]
      );
      const currencyId = currencyResult.rows[0].id;

      // company_settings.id is a locked singleton (CHECK id = 1), not an
      // identity column — must be provided explicitly.
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
        ]
      );

      await client.query(
        `INSERT INTO users (username, pin_hash, role, full_name, is_active)
         VALUES ($1, $2, 'admin', $3, true)`,
        [data.admin_username, hashPin(data.admin_pin), data.admin_username]
      );

      const recoveryKey = generateRecoveryKey();
      await client.query(
        `INSERT INTO security_settings (id, recovery_key_hash, updated_at)
         VALUES (1, $1, now())
         ON CONFLICT (id) DO UPDATE SET
           recovery_key_hash = EXCLUDED.recovery_key_hash,
           updated_at = now()`,
        [hashSecret(recoveryKey)]
      );

      await seedData(client.query.bind(client), {
        language,
        currencyId,
      });

      await client.query("COMMIT");

      return {
        success: true,
        id: settingsResult.rows[0].id,
        recoveryKey,
      };
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
      ]
    );

    // Default POS taxes — only touched when the client actually sent a
    // taxIds array, same guard as the original: omitting the field
    // leaves the existing list untouched rather than wiping it.
    if (Array.isArray(data.default_pos_tax_ids)) {
      const client = await getClient();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM company_default_pos_taxes");
        for (const taxId of data.default_pos_tax_ids) {
          await client.query(
            "INSERT INTO company_default_pos_taxes (tax_id) VALUES ($1)",
            [taxId]
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
}