// packages/app/src/backend/test_print.ipc.js
import { ipcMain } from "electron";
import { query } from "../dbConnect.js";
import getDeviceHash from "../../main/license/getDeviceHash";
import { printReceiptHtml } from "../services/receiptPrinter";
import { printViaRawEscpos } from "../services/rawPrintService";

function buildTestReceiptHtml(printerLabel) {
  const now = new Date().toLocaleString();
  return `
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        font-family: 'Courier New', monospace;
        width: 100%;
        margin: 0;
        padding: 6px;
        background: #fff;
        color: #000;
        font-size: 13px;
      }
      h1 { font-size: 15px; margin: 0 0 6px; text-align: center; }
      p { margin: 3px 0; }
      hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    </style>
  </head>
  <body>
    <h1>TEST PRINT</h1>
    <hr />
    <p>Printer: ${printerLabel}</p>
    <p>${now}</p>
    <hr />
    <p>If you can read this clearly, printing is working.</p>
  </body>
</html>
`;
}

export default function registerTestPrintIPC() {
  ipcMain.handle("test-print", async (event, { deviceName }) => {
    if (!deviceName) {
      return { success: false, error: "DEVICE_NAME_REQUIRED" };
    }

    const deviceId = await getDeviceHash();

    const { rows } = await query(
      `SELECT * FROM printer_settings WHERE device_id = $1 AND device_name = $2`,
      [deviceId, deviceName],
    );
    const settings = rows[0];

    const backend = settings?.backend || "electron";
    const paperSize = settings?.paper_size || "80mm";
    const hasCutter = settings ? Boolean(settings.has_cutter) : true;
    const html = buildTestReceiptHtml(settings?.label || deviceName);

    if (backend === "raw_escpos") {
      return printViaRawEscpos(html, { deviceName, paperSize, hasCutter });
    }

    try {
      const success = await printReceiptHtml(html, deviceName);
      return success
        ? { success: true }
        : { success: false, error: "ELECTRON_PRINT_FAILED" };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
