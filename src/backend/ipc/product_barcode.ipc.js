const { ipcMain } = require("electron");
import db from "../db";
export default function registerProductBarcodeIPC() {
  // CREATE
  ipcMain.handle("create-product-barcode", (event, data) => {
    if (!data.barcode || !data.product_id) {
      return { message: "ERROR ENTER DATA", status: 500 };
    }
    const result = db
      .prepare(
        `
      INSERT INTO product_barcodes (barcode, product_id)
      VALUES (?, ?)
    `,
      )
      .run(data.barcode, data.product_id);

    return {
      success: true,
      id: result.lastInsertRowid,
    };
  });

  ipcMain.handle("get-product-barcodes", () => {
    const product_barcodes = db
      .prepare(
        `
      SELECT * FROM product_barcodes
    `,
      )
      .all();

    return product_barcodes;
  });

  ipcMain.handle("get-product-barcode", (event, id) => {
    const barcode = db
      .prepare(
        `
      SELECT * FROM product_barcodes WHERE id = ?
    `,
      )
      .get(id);

    return barcode;
  });

  ipcMain.handle("update-product-barcode", (event, data) => {
    if (!data.barcode || !data.product_id) {
      return { message: "ERROR ENTER DATA", status: 500 };
    }
    db.prepare(
      `
      UPDATE product_barcodes
      SET barcode = ?, product_id = ?
      WHERE id = ?
    `,
    ).run(data.barcode, data.product_id, data.id);

    return { success: true };
  });

  ipcMain.handle("delete-product-barcode", (event, id) => {
    db.prepare(
      `
      DELETE FROM product_barcodes WHERE id = ?
    `,
    ).run(id);

    return { success: true };
  });
}
