const { ipcMain } = require("electron");
import db from "../db";
export default function registerCurrenciesIPC() {
  // CREATE
  ipcMain.handle("create-currencies", (event, data) => {
    if (!data.name || !data.code || !data.exchangeRate) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const rate = Number(data.exchangeRate);

    if (rate === 1) {
      return { success: false, error: "RATE_RESERVED_FOR_PRIMARY" };
    }

    try {
      const result = db
        .prepare(
          `
        INSERT INTO currencies (name, latinName, minorName, minorLatinName, code, exchangeRate, symbol, isPrimary)
        VALUES (?,?,?,?,?,?,?,?)
      `
        )
        .run(
          data.name,
          data.latinName,
          data.minorName || null,
          data.minorLatinName || null,
          data.code,
          rate,
          data.symbol,
          0
        );

      return {
        success: true,
        id: result.lastInsertRowid,
      };
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return { success: false, error: "CURRENCY_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("update-currency", (event, data) => {
    if (!data.name || !data.code || !data.exchangeRate) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const existing = db
      .prepare(`SELECT isPrimary FROM currencies WHERE id = ?`)
      .get(data.id);

    if (!existing) {
      return { success: false, error: "CURRENCY_NOT_FOUND" };
    }

    const rate = Number(data.exchangeRate);

    if (existing.isPrimary) {
      if (rate !== 1) {
        return { success: false, error: "PRIMARY_RATE_MUST_BE_ONE" };
      }
    } else if (rate === 1) {
      return { success: false, error: "RATE_RESERVED_FOR_PRIMARY" };
    }

    try {
      db.prepare(
        `
        UPDATE currencies
        SET name = ?, latinName = ?, minorName = ?, minorLatinName = ?, code = ?, exchangeRate = ?, symbol = ?
        WHERE id = ?
      `
      ).run(
        data.name,
        data.latinName,
        data.minorName || null,
        data.minorLatinName || null,
        data.code,
        rate,
        data.symbol,
        data.id
      );

      return { success: true };
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return { success: false, error: "CURRENCY_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-currencies", () => {
    const currencies = db
      .prepare(
        `
      SELECT * FROM currencies
    `
      )
      .all();

    return currencies;
  });

  ipcMain.handle("get-currency", (event, id) => {
    const currency = db
      .prepare(
        `
      SELECT * FROM currencies WHERE id = ?
    `
      )
      .get(id);

    return currency;
  });

  ipcMain.handle("delete-currency", (event, id) => {
    const currency = db
      .prepare(`SELECT isPrimary FROM currencies WHERE id = ?`)
      .get(id);

    if (!currency) {
      return { success: true };
    }

    if (currency.isPrimary) {
      return { success: false, error: "CANNOT_DELETE_PRIMARY" };
    }

    const usedByFund = db
      .prepare(`SELECT 1 FROM funds WHERE currency_id = ? LIMIT 1`)
      .get(id);

    if (usedByFund) {
      return { success: false, error: "CURRENCY_IN_USE" };
    }

    try {
      db.prepare(`DELETE FROM currencies WHERE id = ?`).run(id);
      return { success: true };
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
        return { success: false, error: "CURRENCY_IN_USE" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
