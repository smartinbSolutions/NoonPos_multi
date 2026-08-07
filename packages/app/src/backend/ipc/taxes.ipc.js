const { ipcMain } = require("electron");
import db from "../db";

export default function registerTaxesIPC() {
  ipcMain.handle("create-tax", (event, data) => {
    if (!data.name || data.rate < 0) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const category = ["product", "invoice", "both"].includes(data.category)
      ? data.category
      : "product";

    try {
      const result = db
        .prepare(
          `
        INSERT INTO taxes (name, rate, category)
        VALUES (?, ?, ?)
      `
        )
        .run(data.name, data.rate || 0, category);

      return {
        success: true,
        id: result.lastInsertRowid,
      };
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return { success: false, error: "TAX_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-taxes", (event, params = {}) => {
    const category = params?.category;

    if (category && ["product", "invoice", "both"].includes(category)) {
      // e.g. product dropdown asks for taxes usable on a product: 'product' or 'both'
      return db
        .prepare(
          `
        SELECT * FROM taxes
        WHERE category = ? OR category = 'both'
      `
        )
        .all(category);
    }

    return db.prepare(`SELECT * FROM taxes`).all();
  });

  ipcMain.handle("get-tax", (event, id) => {
    return db
      .prepare(
        `
      SELECT * FROM taxes WHERE id = ?
    `
      )
      .get(id);
  });

  ipcMain.handle("update-tax", (event, data) => {
    if (!data.name || data.rate < 0) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const category = ["product", "invoice", "both"].includes(data.category)
      ? data.category
      : "product";

    try {
      db.prepare(
        `
        UPDATE taxes
        SET name = ?, rate = ?, category = ?
        WHERE id = ?
      `
      ).run(data.name, data.rate, category, data.id);

      return { success: true };
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return { success: false, error: "TAX_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("delete-tax", (event, id) => {
    const usedByProduct = db
      .prepare(`SELECT id FROM products WHERE tax_id = ? LIMIT 1`)
      .get(id);

    if (usedByProduct) {
      return { success: false, error: "TAX_IN_USE" };
    }

    try {
      db.prepare(
        `
        DELETE FROM taxes WHERE id = ?
      `
      ).run(id);

      return { success: true };
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
        return { success: false, error: "TAX_IN_USE" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
