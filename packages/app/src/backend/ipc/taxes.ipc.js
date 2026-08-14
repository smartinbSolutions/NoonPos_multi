// packages/app/src/backend/taxes.ipc.js
import { ipcMain } from "electron";
import { query } from "../dbConnect.js";

export default function registerTaxesIPC() {
  ipcMain.handle("create-tax", async (event, data) => {
    if (!data.name || data.rate < 0) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const category = ["product", "invoice", "both"].includes(data.category)
      ? data.category
      : "product";

    try {
      const { rows } = await query(
        `INSERT INTO taxes (name, rate, category)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [data.name, data.rate || 0, category],
      );

      return { success: true, id: rows[0].id };
    } catch (err) {
      if (err.code === "23505") {
        return { success: false, error: "TAX_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-taxes", async (event, params = {}) => {
    const category = params?.category;

    if (category && ["product", "invoice", "both"].includes(category)) {
      // e.g. product dropdown asks for taxes usable on a product: 'product' or 'both'
      const { rows } = await query(
        "SELECT * FROM taxes WHERE category = $1 OR category = 'both'",
        [category],
      );
      return rows;
    }

    const { rows } = await query("SELECT * FROM taxes");
    return rows;
  });

  ipcMain.handle("get-tax", async (event, id) => {
    const { rows } = await query("SELECT * FROM taxes WHERE id = $1", [id]);
    return rows[0];
  });

  ipcMain.handle("update-tax", async (event, data) => {
    if (!data.name || data.rate < 0) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const category = ["product", "invoice", "both"].includes(data.category)
      ? data.category
      : "product";

    try {
      await query(
        `UPDATE taxes
         SET name = $1, rate = $2, category = $3
         WHERE id = $4`,
        [data.name, data.rate, category, data.id],
      );

      return { success: true };
    } catch (err) {
      if (err.code === "23505") {
        return { success: false, error: "TAX_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("delete-tax", async (event, id) => {
    const { rows: usedByProductRows } = await query(
      "SELECT id FROM products WHERE tax_id = $1 LIMIT 1",
      [id],
    );

    if (usedByProductRows[0]) {
      return { success: false, error: "TAX_IN_USE" };
    }

    try {
      await query("DELETE FROM taxes WHERE id = $1", [id]);
      return { success: true };
    } catch (err) {
      if (err.code === "23503") {
        return { success: false, error: "TAX_IN_USE" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
