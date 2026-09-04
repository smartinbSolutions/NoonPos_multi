// packages/app/src/backend/currencies.ipc.js
import { ipcMain } from "electron";
import { query } from "../dbConnect.js";

export default function registerCurrenciesIPC() {
  // CREATE
  ipcMain.handle("create-currencies", async (event, data) => {
    if (!data.name || !data.code || !data.exchangeRate) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const rate = Number(data.exchangeRate);

    if (rate === 1) {
      return { success: false, error: "RATE_RESERVED_FOR_PRIMARY" };
    }

    try {
      const { rows } = await query(
        `INSERT INTO currencies (name, latin_name, minor_name, minor_latin_name, code, exchange_rate, symbol, is_primary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,false)
         RETURNING id`,
        [
          data.name,
          data.latinName,
          data.minorName || null,
          data.minorLatinName || null,
          data.code,
          rate,
          data.symbol,
        ],
      );

      return { success: true, id: rows[0].id };
    } catch (err) {
      if (err.code === "23505") {
        return { success: false, error: "CURRENCY_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("update-currency", async (event, data) => {
    if (!data.name || !data.code || !data.exchangeRate) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const { rows: existingRows } = await query(
      "SELECT is_primary FROM currencies WHERE id = $1",
      [data.id],
    );
    const existing = existingRows[0];

    if (!existing) {
      return { success: false, error: "CURRENCY_NOT_FOUND" };
    }

    const rate = Number(data.exchangeRate);

    if (existing.is_primary) {
      if (rate !== 1) {
        return { success: false, error: "PRIMARY_RATE_MUST_BE_ONE" };
      }
    } else if (rate === 1) {
      return { success: false, error: "RATE_RESERVED_FOR_PRIMARY" };
    }

    try {
      await query(
        `UPDATE currencies
         SET name = $1, latin_name = $2, minor_name = $3, minor_latin_name = $4, code = $5, exchange_rate = $6, symbol = $7
         WHERE id = $8`,
        [
          data.name,
          data.latinName,
          data.minorName || null,
          data.minorLatinName || null,
          data.code,
          rate,
          data.symbol,
          data.id,
        ],
      );

      return { success: true };
    } catch (err) {
      if (err.code === "23505") {
        return { success: false, error: "CURRENCY_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
  ipcMain.handle("get-currencies", async () => {
    const { rows } = await query(`
    SELECT
      id,
      name,
      latin_name AS "latinName",
      minor_name AS "minorName",
      minor_latin_name AS "minorLatinName",
      code,
      exchange_rate::float AS "exchangeRate",
      symbol,
      CASE WHEN is_primary THEN 1 ELSE 0 END AS "isPrimary"
    FROM currencies
  `);
    return rows;
  });

  ipcMain.handle("get-currency", async (event, id) => {
    const { rows } = await query(
      `SELECT
      id,
      name,
      latin_name AS "latinName",
      minor_name AS "minorName",
      minor_latin_name AS "minorLatinName",
      code,
      exchange_rate::float AS "exchangeRate",
      symbol,
      CASE WHEN is_primary THEN 1 ELSE 0 END AS "isPrimary"
    FROM currencies WHERE id = $1`,
      [id],
    );
    return rows[0];
  });

  ipcMain.handle("delete-currency", async (event, id) => {
    const { rows: currencyRows } = await query(
      "SELECT is_primary FROM currencies WHERE id = $1",
      [id],
    );
    const currency = currencyRows[0];

    if (!currency) {
      return { success: true };
    }

    if (currency.is_primary) {
      return { success: false, error: "CANNOT_DELETE_PRIMARY" };
    }

    const { rows: usedByFundRows } = await query(
      "SELECT 1 FROM funds WHERE currency_id = $1 LIMIT 1",
      [id],
    );

    if (usedByFundRows[0]) {
      return { success: false, error: "CURRENCY_IN_USE" };
    }

    try {
      await query("DELETE FROM currencies WHERE id = $1", [id]);
      return { success: true };
    } catch (err) {
      if (err.code === "23503") {
        return { success: false, error: "CURRENCY_IN_USE" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
