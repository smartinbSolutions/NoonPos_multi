// printDocsIpc.js
//
// Unified print/PDF handlers for all printable documents (sales invoices,
// purchase invoices, and later quotations/returns). The renderer already
// owns each document's data via its own route (e.g. /print-sales/:id), so
// this file only needs to know how to open a hidden window, load a given
// route, and either save it as PDF or send it to a printer. No document-
// specific logic lives here — that stays in each route's own component.

const { ipcMain, BrowserWindow, dialog } = require("electron");
import path from "path";
import fs from "fs";
import { loadRendererRoute } from "../../main";

function openHiddenDocumentWindow() {
  return new BrowserWindow({
    width: 900,
    height: 1000,
    show: true, // back to hidden now that we're not debugging blind
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"), // matches main window exactly
    },
  });
}

export default function registerPrintDocsIPC() {
  // SAVE AS PDF
  // payload: { route, fileName }
  //   route    -> renderer path to load, e.g. "/print-sales/42"
  //   fileName -> suggested default filename, e.g. "invoice-42.pdf"
  ipcMain.handle("save-document-pdf", async (event, { route, fileName }) => {
    let win = openHiddenDocumentWindow();

    return new Promise((resolve) => {
      win.webContents.on("did-finish-load", () => {
        setTimeout(async () => {
          if (!win) return;
          try {
            const pdfBuffer = await win.webContents.printToPDF({
              printBackground: true,
              pageSize: "A4",
              margins: { marginType: "none" },
            });

            const { filePath, canceled } = await dialog.showSaveDialog({
              title: "Save PDF",
              defaultPath: fileName || "document.pdf",
              filters: [{ name: "PDF", extensions: ["pdf"] }],
            });

            if (canceled || !filePath) {
              resolve({ success: false, error: "CANCELED" });
              return;
            }

            fs.writeFileSync(filePath, pdfBuffer);
            resolve({ success: true, filePath });
          } catch (err) {
            console.error("PDF generation failed:", err);
            resolve({ success: false, error: err.message || String(err) });
          } finally {
            if (win) {
              win.destroy();
              win = null;
            }
          }
        }, 600);
      });

      win.webContents.on("did-fail-load", () => {
        if (win) {
          win.destroy();
          win = null;
        }
        resolve({ success: false, error: "Failed to load print route" });
      });

      loadRendererRoute(win, route);
    });
  });

  // PRINT
  // payload: { route }
  ipcMain.handle("print-document", async (event, { route }) => {
    let win = openHiddenDocumentWindow();

    return new Promise((resolve) => {
      win.webContents.on("did-finish-load", async () => {
        if (!win) return;

        try {
          const printers = await win.webContents.getPrintersAsync();
          if (!printers || printers.length === 0) {
            win.destroy();
            win = null;
            resolve({ success: false, error: "NO_PRINTER" });
            return;
          }
        } catch (err) {
          if (win) {
            win.destroy();
            win = null;
          }
          resolve({ success: false, error: "NO_PRINTER" });
          return;
        }

        setTimeout(() => {
          if (!win) return;
          win.webContents.print(
            { silent: false, printBackground: true },
            (success, failureReason) => {
              if (!success) {
                console.error(`Print failed: ${failureReason}`);
                resolve({ success: false, error: failureReason });
              } else {
                resolve({ success: true });
              }
              if (win) {
                win.destroy();
                win = null;
              }
            }
          );
        }, 600);
      });

      win.webContents.on("did-fail-load", () => {
        if (win) {
          win.destroy();
          win = null;
        }
        resolve({ success: false, error: "Failed to load print route" });
      });

      loadRendererRoute(win, route);
    });
  });
}
