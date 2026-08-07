const { ipcMain, dialog, BrowserWindow } = require("electron");
import ExcelJS from "exceljs";
import fs from "fs";
import db from "../db";
import { getPartyCredit, applyPartyCredit } from "../utils/partyCredit";

const EXPORT_LABELS = {
  en: {
    title: "Party Ledger",
    date: "Date",
    type: "Type",
    direction: "Direction",
    amount: "Amount",
    reference: "Reference",
    note: "Note",
    runningBalance: "Running Balance",
    openingBalance: "Opening Balance",
    totalIncrease: "Total Increase",
    totalDecrease: "Total Decrease",
    increase: "Increase",
    decrease: "Decrease",
    allTime: "All time",
    present: "Present",
    period: "Period",
    recordTypes: {
      invoice: "Invoice",
      return: "Return",
      payment: "Payment",
      opening_balance: "Opening Balance",
    },
  },
  ar: {
    title: "كشف حساب الطرف",
    date: "التاريخ",
    type: "النوع",
    direction: "الاتجاه",
    amount: "المبلغ",
    reference: "المرجع",
    note: "ملاحظة",
    runningBalance: "الرصيد الجاري",
    openingBalance: "الرصيد الافتتاحي",
    totalIncrease: "إجمالي الزيادة",
    totalDecrease: "إجمالي النقصان",
    increase: "زيادة",
    decrease: "نقصان",
    allTime: "كل الوقت",
    present: "الحاضر",
    period: "الفترة",
    recordTypes: {
      invoice: "فاتورة",
      return: "مرتجع",
      payment: "دفعة",
      opening_balance: "رصيد افتتاحي",
    },
  },
  tr: {
    title: "Cari Hesap Ekstresi",
    date: "Tarih",
    type: "Tür",
    direction: "Yön",
    amount: "Tutar",
    reference: "Referans",
    note: "Not",
    runningBalance: "Bakiye",
    openingBalance: "Açılış Bakiyesi",
    totalIncrease: "Toplam Artış",
    totalDecrease: "Toplam Azalış",
    increase: "Artış",
    decrease: "Azalış",
    allTime: "Tüm zamanlar",
    present: "Bugün",
    period: "Dönem",
    recordTypes: {
      invoice: "Fatura",
      return: "İade",
      payment: "Ödeme",
      opening_balance: "Açılış Bakiyesi",
    },
  },
};

const getLabels = (language) => EXPORT_LABELS[language] || EXPORT_LABELS.en;

const formatRecordType = (L, recordType) =>
  L.recordTypes[recordType] || recordType;

const formatExportDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value).slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatReference = (row) => {
  if (row.invoice_name) return row.invoice_name;
  if (row.record_type === "payment") {
    return row.payment_note
      ? `${row.payment_note}${row.fund_name ? ` (${row.fund_name})` : ""}`
      : row.fund_name || "";
  }
  return "";
};

function fetchPartyHistoryLedger(
  db,
  {
    partyId,
    partyType,
    page = 1,
    limit = 50,
    startDate,
    endDate,
    exportAll = false,
  }
) {
  const currentPage = Math.max(1, Number(page) || 1);
  const perPage = Math.max(1, Number(limit) || 50);
  const offset = (currentPage - 1) * perPage;

  const dateConditions = [];
  const dateValues = [];

  if (startDate) {
    dateConditions.push("date(p.date) >= date(?)");
    dateValues.push(startDate);
  }
  if (endDate) {
    dateConditions.push("date(p.date) <= date(?)");
    dateValues.push(endDate);
  }
  const dateFilter = dateConditions.length
    ? `AND ${dateConditions.join(" AND ")}`
    : "";

  const pagingClause = exportAll ? "" : "LIMIT ? OFFSET ?";
  const pagingValues = exportAll ? [] : [perPage, offset];

  const rows = db
    .prepare(
      `
      SELECT
        p.*,

        -- invoice-side info, resolved by invoice_type
        COALESCE(si.invoice_name, pi.invoice_name, ex.invoice_name) AS invoice_name,

        -- payment-side info, resolved via payment_id
        pay.note AS payment_note,
        pay.fund_id AS payment_fund_id,
        f.name AS fund_name,

        SUM(
          CASE
            WHEN p.movement_type = 'increase' THEN p.amount
            WHEN p.movement_type = 'decrease' THEN -p.amount
            ELSE 0
          END
        ) OVER (
          PARTITION BY p.party_type, p.party_id
          ORDER BY p.id
        ) AS running_balance

      FROM party_history p

      LEFT JOIN sales_invoices si
        ON p.record_type IN ('invoice','return')
        AND p.invoice_type IN ('sales','sales_return')
        AND si.id = p.invoice_id

      LEFT JOIN purchase_invoices pi
        ON p.record_type IN ('invoice','return')
        AND p.invoice_type IN ('purchase','purchase_return')
        AND pi.id = p.invoice_id

      LEFT JOIN expense ex
        ON p.record_type = 'invoice'
        AND p.invoice_type = 'expense'
        AND ex.id = p.invoice_id

      LEFT JOIN payments pay
        ON p.record_type = 'payment'
        AND pay.id = p.payment_id

      LEFT JOIN funds f
        ON f.id = pay.fund_id

      WHERE p.party_id = ?
        AND p.party_type = ?
        ${dateFilter}
      ORDER BY p.id DESC
      ${pagingClause}
      `
    )
    .all(partyId, partyType, ...dateValues, ...pagingValues);

  const { total } = db
    .prepare(
      `
      SELECT COUNT(*) AS total
      FROM party_history p
      WHERE p.party_id = ?
        AND p.party_type = ?
        ${dateFilter}
      `
    )
    .get(partyId, partyType, ...dateValues);

  const summary = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN movement_type = 'increase' THEN amount ELSE 0 END), 0) AS total_increase,
        COALESCE(SUM(CASE WHEN movement_type = 'decrease' THEN amount ELSE 0 END), 0) AS total_decrease,
        COALESCE(SUM(CASE WHEN record_type = 'invoice' THEN amount ELSE 0 END), 0) AS total_invoice,
        COALESCE(SUM(CASE WHEN record_type = 'return' THEN amount ELSE 0 END), 0) AS total_return,
        COALESCE(SUM(CASE WHEN record_type = 'payment' THEN amount ELSE 0 END), 0) AS total_payment,
        COALESCE(SUM(CASE WHEN record_type = 'opening_balance' THEN
          CASE WHEN movement_type = 'increase' THEN amount ELSE -amount END
        ELSE 0 END), 0) AS opening_balance
      FROM party_history p
      WHERE p.party_id = ?
        AND p.party_type = ?
        ${dateFilter}
      `
    )
    .get(partyId, partyType, ...dateValues);

  return {
    data: rows,
    page: currentPage,
    limit: perPage,
    total,
    totalPages: Math.ceil(total / perPage),
    summary: {
      total_increase: Number(summary?.total_increase || 0),
      total_decrease: Number(summary?.total_decrease || 0),
      total_invoice: Number(summary?.total_invoice || 0),
      total_return: Number(summary?.total_return || 0),
      total_payment: Number(summary?.total_payment || 0),
      opening_balance: Number(summary?.opening_balance || 0),
    },
  };
}

export default function registerPartyHistoryIPC() {
  ipcMain.handle("get-party-history-ledger", (event, params) => {
    return fetchPartyHistoryLedger(db, params);
  });
  ipcMain.handle("get-customer-credit", (event, customerId) => {
    return getPartyCredit(db, { partyId: customerId, partyType: "customer" });
  });

  ipcMain.handle("get-supplier-credit", (event, supplierId) => {
    return getPartyCredit(db, { partyId: supplierId, partyType: "supplier" });
  });

  ipcMain.handle("get-party-earliest-date", (event, { partyId, partyType }) => {
    try {
      if (!partyId || !partyType) {
        return { success: true, minDate: null };
      }
      const row = db
        .prepare(
          `SELECT MIN(date) AS minDate FROM party_history WHERE party_id = ? AND party_type = ?`
        )
        .get(partyId, partyType);
      return { success: true, minDate: row?.minDate || null };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(
    "apply-invoice-credit",
    (event, { partyId, partyType, invoiceId, invoiceType, amount }) => {
      try {
        const applied = applyPartyCredit(db, {
          partyId,
          partyType,
          invoiceId,
          invoiceType,
          amount,
        });
        return { success: true, applied };
      } catch (err) {
        return { success: false, error: err.message || String(err) };
      }
    }
  );

  ipcMain.handle(
    "export-party-history-excel",
    async (
      event,
      { partyId, partyType, startDate, endDate, language, partyName }
    ) => {
      try {
        const L = getLabels(language);
        const isRtl = language === "ar";

        const { data: rows, summary } = fetchPartyHistoryLedger(db, {
          partyId,
          partyType,
          startDate,
          endDate,
          exportAll: true,
        });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(L.title);

        if (isRtl) {
          sheet.views = [{ rightToLeft: true }];
        }

        sheet.columns = [
          { header: L.date, key: "date", width: 18 },
          { header: L.type, key: "record_type", width: 14 },
          { header: L.direction, key: "movement_type", width: 10 },
          { header: L.amount, key: "amount", width: 14 },
          { header: L.reference, key: "reference", width: 26 },
          { header: L.note, key: "note", width: 30 },
          { header: L.runningBalance, key: "running_balance", width: 16 },
        ];
        sheet.getRow(1).font = { bold: true };

        rows.forEach((r) => {
          sheet.addRow({
            date: formatExportDate(r.date),
            record_type: formatRecordType(L, r.record_type),
            movement_type:
              r.movement_type === "increase" ? L.increase : L.decrease,
            amount: r.amount,
            reference: formatReference(r),
            note: r.note || "",
            running_balance: r.running_balance,
          });
        });

        sheet.addRow({});
        sheet.addRow({
          note: L.openingBalance,
          running_balance: summary.opening_balance,
        });
        sheet.addRow({
          note: L.totalIncrease,
          running_balance: summary.total_increase,
        });
        sheet.addRow({
          note: L.totalDecrease,
          running_balance: summary.total_decrease,
        });

        const { canceled, filePath } = await dialog.showSaveDialog({
          title: L.title,
          defaultPath: `${partyName || "party"}-ledger.xlsx`,
          filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
        });

        if (canceled || !filePath) {
          return { success: false, error: "Export cancelled" };
        }

        await workbook.xlsx.writeFile(filePath);
        return { success: true, path: filePath };
      } catch (err) {
        return { success: false, error: err.message || String(err) };
      }
    }
  );

  ipcMain.handle(
    "export-party-history-pdf",
    async (
      event,
      { partyId, partyType, startDate, endDate, language, partyName }
    ) => {
      try {
        const L = getLabels(language);
        const isRtl = language === "ar";

        const { data: rows, summary } = fetchPartyHistoryLedger(db, {
          partyId,
          partyType,
          startDate,
          endDate,
          exportAll: true,
        });

        const rowsHtml = rows
          .map(
            (r) => `
          <tr>
            <td>${formatExportDate(r.date)}</td>
            <td>${formatRecordType(L, r.record_type)}</td>
            <td>${r.movement_type === "increase" ? L.increase : L.decrease}</td>
            <td class="right">${Number(r.amount).toFixed(2)}</td>
            <td>${formatReference(r) || "-"}</td>
            <td>${r.note || ""}</td>
            <td class="right">${Number(r.running_balance).toFixed(2)}</td>
          </tr>
        `
          )
          .join("");

        const html = `
        <html dir="${isRtl ? "rtl" : "ltr"}">
          <head>
            <meta charset="UTF-8" />
            <style>
              body { font-family: sans-serif; font-size: 12px; padding: 20px; }
              h1 { font-size: 18px; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; }
              th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: ${isRtl ? "right" : "left"}; }
              th { background: #f0f0f0; }
              .right { text-align: ${isRtl ? "left" : "right"}; }
              .summary { margin-top: 16px; font-weight: bold; }
            </style>
          </head>
          <body>
            <h1>${partyName || L.title} — ${L.title}</h1>
            <p>${L.period}: ${startDate || L.allTime} ${isRtl ? "←" : "→"} ${endDate || L.present}</p>
            <table>
              <thead>
                <tr>
                  <th>${L.date}</th><th>${L.type}</th><th>${L.direction}</th><th>${L.amount}</th>
                  <th>${L.reference}</th><th>${L.note}</th><th>${L.runningBalance}</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <div class="summary">
              ${L.openingBalance}: ${Number(summary.opening_balance).toFixed(2)} &nbsp;&nbsp;
              ${L.totalIncrease}: ${Number(summary.total_increase).toFixed(2)} &nbsp;&nbsp;
              ${L.totalDecrease}: ${Number(summary.total_decrease).toFixed(2)}
            </div>
          </body>
        </html>
      `;

        const win = new BrowserWindow({ show: false });
        await win.loadURL(
          "data:text/html;charset=utf-8," + encodeURIComponent(html)
        );

        const pdfBuffer = await win.webContents.printToPDF({
          printBackground: true,
          landscape: true,
        });
        win.close();

        const { canceled, filePath } = await dialog.showSaveDialog({
          title: L.title,
          defaultPath: `${partyName || "party"}-ledger.pdf`,
          filters: [{ name: "PDF Document", extensions: ["pdf"] }],
        });

        if (canceled || !filePath) {
          return { success: false, error: "Export cancelled" };
        }

        fs.writeFileSync(filePath, pdfBuffer);
        return { success: true, path: filePath };
      } catch (err) {
        return { success: false, error: err.message || String(err) };
      }
    }
  );
}
