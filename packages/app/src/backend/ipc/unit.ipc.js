// packages/app/src/backend/unit.ipc.js
import { ipcMain } from "electron";
import { query } from "../dbConnect.js";

export default function registerUnitIPC() {
  ipcMain.handle("create-unit", async (event, data) => {
    if (!data.name || !data.code) {
      return { message: "ERROR ENTER DATA", status: 500 };
    }

    try {
      const { rows } = await query(
        `INSERT INTO unit (name, latin_name, code)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [data.name, data.latinName, data.code],
      );

      return { success: true, id: rows[0].id };
    } catch (err) {
      if (err.code === "23505") {
        return { success: false, error: "UNIT_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-units", async () => {
    const { rows } = await query(
      `SELECT id, name, latin_name AS "latinName", code FROM unit`,
    );
    return rows;
  });

  ipcMain.handle("get-unit", async (event, id) => {
    const { rows } = await query(
      `SELECT id, name, latin_name AS "latinName", code FROM unit WHERE id = $1`,
      [id],
    );
    return rows[0];
  });

  ipcMain.handle("update-unit", async (event, data) => {
    if (!data.name || !data.code) {
      return { message: "ERROR ENTER DATA", status: 500 };
    }

    try {
      await query(
        `UPDATE unit
         SET name = $1, latin_name = $2, code = $3
         WHERE id = $4`,
        [data.name, data.latinName, data.code, data.id],
      );

      return { success: true };
    } catch (err) {
      if (err.code === "23505") {
        return { success: false, error: "UNIT_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("delete-unit", async (event, id) => {
    try {
      await query("DELETE FROM unit WHERE id = $1", [id]);
      return { success: true };
    } catch (err) {
      if (err.code === "23503") {
        return { success: false, error: "UNIT_IN_USE" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
