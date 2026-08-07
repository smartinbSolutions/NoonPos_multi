const { ipcMain } = require("electron");
import db from "../db";

export default function registerUnitIPC() {
  ipcMain.handle("create-unit", (event, data) => {
    if (!data.name || !data.code) {
      return { message: "ERROR ENTER DATA", status: 500 };
    }

    try {
      const result = db
        .prepare(
          `
        INSERT INTO unit 
        (name, latinName, code)
        VALUES (?, ?, ?)
      `
        )
        .run(data.name, data.latinName, data.code);

      return { success: true, id: result.lastInsertRowid };
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return { success: false, error: "UNIT_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-units", () => {
    const units = db
      .prepare(
        `
      SELECT * FROM unit
    `
      )
      .all();

    return units;
  });

  ipcMain.handle("get-unit", (event, id) => {
    const unit = db
      .prepare(
        `
      SELECT * FROM unit WHERE id = ?
    `
      )
      .get(id);

    return unit;
  });

  ipcMain.handle("update-unit", (event, data) => {
    if (!data.name || !data.code) {
      return { message: "ERROR ENTER DATA", status: 500 };
    }

    try {
      db.prepare(
        `
        UPDATE unit
        SET name = ?, latinName = ?, code = ?
        WHERE id = ?
      `
      ).run(data.name, data.latinName, data.code, data.id);

      return { success: true };
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return { success: false, error: "UNIT_ALREADY_EXISTS" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("delete-unit", (event, id) => {
    try {
      db.prepare(`DELETE FROM unit WHERE id = ?`).run(id);
      return { success: true };
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
        return { success: false, error: "UNIT_IN_USE" };
      }
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
