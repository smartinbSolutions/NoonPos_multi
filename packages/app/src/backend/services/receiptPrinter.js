import { BrowserWindow } from "electron";

export const receiptLabels = {
  en: {
    invoice: "Invoice",
    item: "Item",
    quantity: "Qty",
    price: "Price",
    total: "Total",
    subtotal: "Subtotal",
    paid: "Paid",
    change: "Change",
    thankYou: "Thank you",
    itemTax: "Item Tax",
    itemDiscount: "Item Discount",
    invoiceDiscount: "Invoice Discount",
    visitAgain: "Visit again",
  },
  tr: {
    invoice: "Fatura",
    item: "Urun",
    quantity: "Miktar",
    price: "Fiyat",
    total: "Toplam",
    subtotal: "Ara Toplam",
    paid: "Odenen",
    change: "Para Ustu",
    thankYou: "Tesekkurler",
    visitAgain: "Yine bekleriz",
    itemTax: "Ürün Vergisi",
    itemDiscount: "Ürün İndirimi",
    invoiceDiscount: "Fatura İndirimi",
  },
  ar: {
    invoice: "فاتورة",
    item: "الصنف",
    quantity: "الكمية",
    price: "السعر",
    total: "الإجمالي",
    subtotal: "المجموع الفرعي",
    paid: "المدفوع",
    change: "الباقي",
    thankYou: "شكرا لك",
    visitAgain: "نراك مرة أخرى",
    itemTax: "ضريبة الصنف",
    itemDiscount: "خصم الصنف",
    invoiceDiscount: "خصم الفاتورة",
  },
};

export const getReceiptLanguage = (value) => {
  const language = String(value || "en").split("-")[0];
  return receiptLabels[language] ? language : "en";
};

export function buildReceiptHtml({
  companyName,
  labels,
  direction,
  data,
  itemsHtml,
  taxLinesHtml,
  showItemDiscount,
  showInvoiceDiscount,
  showItemTax,
}) {
  return `
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      @page { margin: 0; size: 80mm auto; }
      * { box-sizing: border-box; }
      body {
        font-family: 'Courier New', monospace;
        width: 100%;
        margin: 0;
        padding: 5mm 3.5mm;
        color: #000;
        direction: ${direction};
        font-size: 10.5px;
        line-height: 1.35;
      }

      /* ---- Header ---- */
      .header { text-align: center; margin-bottom: 8px; }
      .header h1 {
        font-size: 15px;
        margin: 0 0 3px;
        letter-spacing: 0.5px;
        font-weight: 800;
      }
      .header p {
        font-size: 9.5px;
        margin: 1px 0;
        color: #333;
        font-weight: 700;
        letter-spacing: 0.2px;
      }

      .line { border-top: 1px dashed #000; margin: 7px 0; }
      .line.solid { border-top: 1.5px solid #000; }

      /* ---- Table ---- */
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th {
        text-align: start;
        border-bottom: 1px solid #000;
        padding: 0 3px 4px;
        font-size: 8.5px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #222;
      }
      td { padding: 4px 3px; vertical-align: top; }
      tr:not(:last-child) td { border-bottom: 1px dotted #ddd; }

      .item {
        word-break: break-word;
        font-weight: 700;
        font-size: 10px;
      }
      .center { text-align: center; }
      .right { text-align: right; }

      /* Numbers: bold, tabular, the visual anchor of every row */
      td.center, td.right {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      /* ---- Summary ---- */
      .summary { margin-top: 9px; font-size: 11px; }
      .summary div {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin: 4px 0;
      }
      .summary span:first-child {
        font-size: 9.5px;
        color: #222;
        font-weight: 700;
      }
      .summary span:last-child {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .total {
        border-top: 1.5px solid #000;
        margin-top: 7px;
        padding-top: 6px;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .total span:first-child {
        font-size: 11.5px;
        font-weight: 800;
        color: #000;
      }
      .total span:last-child {
        font-size: 17px;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
      }

      /* ---- Footer ---- */
      .footer {
        text-align: center;
        font-size: 9.5px;
        color: #333;
        font-weight: 700;
        margin-top: 11px;
        padding-top: 7px;
        border-top: 1px dashed #000;
        line-height: 1.5;
      }
      .footer .thanks {
        font-weight: 800;
        font-size: 10.5px;
        color: #000;
        margin-bottom: 1px;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>${companyName}</h1>
      <p>${labels.invoice} #${data.id}</p>
      <p>${data.date}</p>
    </div>
    <div class="line solid"></div>
    <table>
      <thead>
        <tr>
          <th>${labels.item}</th>
          <th class="center">${labels.quantity}</th>
          <th class="right">${labels.price}</th>
          <th class="right">${labels.total}</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="line"></div>
    <div class="summary">
      <div><span>${labels.subtotal}</span><span>${data.subtotal}</span></div>
      ${showItemDiscount ? `<div><span>${labels.itemDiscount}</span><span>-${data.itemDiscountTotal}</span></div>` : ""}
      ${showItemTax ? `<div><span>${labels.itemTax}</span><span>${data.itemTaxTotal}</span></div>` : ""}
      ${showInvoiceDiscount ? `<div><span>${labels.invoiceDiscount}</span><span>-${data.invoiceDiscount}</span></div>` : ""}
      ${taxLinesHtml}
      <div class="total"><span>${labels.total}</span><span>${data.total}</span></div>
    </div>
    <div class="footer">
      <div class="thanks">${labels.thankYou}</div>
      <div>${labels.visitAgain}</div>
    </div>
  </body>
</html>
`;
}

export async function printReceiptHtml(html, printerName) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));

  const printers = await win.webContents.getPrintersAsync();
  const printerNames = printers.map((p) => p.name);

  let deviceName = printerName;
  if (!deviceName || !printerNames.includes(deviceName)) {
    console.warn(
      `Requested printer "${deviceName}" not found, falling back to default.`
    );
    deviceName = undefined;
  }

  return new Promise((resolve) => {
    win.webContents.print(
      {
        silent: true,
        printBackground: true,
        margins: { marginType: "none" },
        pageSize: { width: 70000, height: 200000 },
        deviceName,
      },
      (success, errorType) => {
        if (!success) console.error("Print failed:", errorType);
        win.close();
        resolve(success);
      }
    );
  });
}
