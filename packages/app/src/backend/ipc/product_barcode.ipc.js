// packages/app/src/backend/productBarcode.ipc.js
import { ipcMain } from "electron";
import { query } from "../dbConnect.js";

export default function registerProductBarcodeIPC() {
  ipcMain.handle("create-product-barcode", async (event, data) => {
    if (!data.barcode || !data.product_id) {
      return { message: "ERROR ENTER DATA", status: 500 };
    }

    const { rows } = await query(
      `INSERT INTO product_barcodes (barcode, product_id)
       VALUES ($1, $2)
       RETURNING id`,
      [data.barcode, data.product_id],
    );

    return { success: true, id: rows[0].id };
  });

  ipcMain.handle("get-product-barcodes", async () => {
    const { rows } = await query("SELECT * FROM product_barcodes");
    return rows;
  });

  ipcMain.handle("get-product-barcode", async (event, id) => {
    const { rows } = await query(
      "SELECT * FROM product_barcodes WHERE id = $1",
      [id],
    );
    return rows[0];
  });

  ipcMain.handle("update-product-barcode", async (event, data) => {
    if (!data.barcode || !data.product_id) {
      return { message: "ERROR ENTER DATA", status: 500 };
    }

    await query(
      `UPDATE product_barcodes
       SET barcode = $1, product_id = $2
       WHERE id = $3`,
      [data.barcode, data.product_id, data.id],
    );

    return { success: true };
  });

  ipcMain.handle("delete-product-barcode", async (event, id) => {
    await query("DELETE FROM product_barcodes WHERE id = $1", [id]);
    return { success: true };
  });
}
