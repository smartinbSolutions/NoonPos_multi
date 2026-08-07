import { ipcMain, dialog, BrowserWindow } from "electron";
import ExcelJS from "exceljs";
import fs from "fs";
import db from "../db";
import createFundHistory from "../utils/createFundHistory";

const EXPORT_LABELS = {
  en: {
    title: "Fund History",
    date: "Date",
    type: "Type",
    direction: "Direction",
    amount: "Amount",
    partyFund: "Party/Fund",
    transaction: "Transaction",
    note: "Note",
    runningBalance: "Running Balance",
    totalIn: "Total In",
    totalOut: "Total Out",
    in: "In",
    out: "Out",
    allTime: "All time",
    present: "Present",
    period: "Period",
    recordTypes: {
      transfer: "Transfer",
      payment: "Payment",
      opening_balance: "Opening Balance",
    },
    transactionTypes: {
      transfer: "Transfer",
      payment: "Payment",
    },
  },
  ar: {
    title: "سجل الصندوق",
    date: "التاريخ",
    type: "النوع",
    direction: "الاتجاه",
    amount: "المبلغ",
    partyFund: "الطرف/الصندوق",
    transaction: "المعاملة",
    note: "ملاحظة",
    runningBalance: "الرصيد الجاري",
    totalIn: "إجمالي الوارد",
    totalOut: "إجمالي الصادر",
    in: "وارد",
    out: "صادر",
    allTime: "كل الوقت",
    present: "الحاضر",
    period: "الفترة",
    recordTypes: {
      transfer: "تحويل",
      payment: "دفعة",
      opening_balance: "رصيد افتتاحي",
    },
    transactionTypes: {
      transfer: "تحويل",
      payment: "دفعة",
    },
  },
  tr: {
    title: "Fon Geçmişi",
    date: "Tarih",
    type: "Tür",
    direction: "Yön",
    amount: "Tutar",
    partyFund: "Taraf/Fon",
    transaction: "İşlem",
    note: "Not",
    runningBalance: "Bakiye",
    totalIn: "Toplam Giriş",
    totalOut: "Toplam Çıkış",
    in: "Giriş",
    out: "Çıkış",
    allTime: "Tüm zamanlar",
    present: "Bugün",
    period: "Dönem",
    recordTypes: {
      transfer: "Transfer",
      payment: "Ödeme",
      opening_balance: "Açılış Bakiyesi",
    },
    transactionTypes: {
      transfer: "Transfer",
      payment: "Ödeme",
    },
  },
};

const getLabels = (language) => EXPORT_LABELS[language] || EXPORT_LABELS.en;

const formatRecordType = (L, recordType) =>
  L.recordTypes[recordType] || recordType;
const formatTransactionType = (L, transactionType) =>
  L.transactionTypes?.[transactionType] || transactionType;

const formatExportDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value).slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
function fetchFundHistory(
  db,
  { fundId, page = 1, limit = 50, startDate, endDate, exportAll = false }
) {
  const currentPage = Math.max(1, Number(page) || 1);
  const perPage = Math.max(1, Number(limit) || 50);
  const offset = (currentPage - 1) * perPage;

  const dateConditions = [];
  const dateValues = [];

  if (startDate) {
    dateConditions.push("date(fh.date) >= date(?)");
    dateValues.push(startDate);
  }
  if (endDate) {
    dateConditions.push("date(fh.date) <= date(?)");
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
      WITH full_history AS (
        SELECT
          h.id,
          h.fund_id,
          h.record_type,
          h.date,
          h.movement_type,
          h.amount,
          h.note,
          h.createdAt,

          CASE
            WHEN h.record_type = 'transfer' THEN 'fund'
            ELSE p.party_type
          END AS party_type,

          CASE
            WHEN h.record_type = 'transfer'
              THEN (CASE WHEN h.fund_id = ft.from_fund_id THEN ft.to_fund_id ELSE ft.from_fund_id END)
            ELSE p.party_id
          END AS party_id,

          COALESCE(
            c.name,
            s.name,
            pt.name,
            CASE WHEN h.fund_id = ft.from_fund_id THEN fTo.name ELSE fFrom.name END
          ) AS party_name,

          CASE
          WHEN h.record_type = 'transfer' THEN 'transfer'
          WHEN h.record_type = 'payment' THEN 'payment'
        END AS transaction_type,

        CASE
          WHEN h.record_type = 'transfer' THEN h.payment_id
          WHEN h.record_type = 'payment' THEN h.payment_id
        END AS transaction_id,

          COALESCE(p.exchange_rate, ft.exchange_rate)   AS exchange_rate,
          COALESCE(p.effective_rate, ft.effective_rate) AS effective_rate,

          SUM(
            CASE
              WHEN h.movement_type = 'in' THEN h.amount
              WHEN h.movement_type = 'out' THEN -h.amount
              ELSE 0
            END
          ) OVER (
            PARTITION BY h.fund_id
            ORDER BY datetime(h.date), h.id
          ) AS running_balance

        FROM fund_history h

        LEFT JOIN payments p
          ON h.record_type = 'payment' AND p.id = h.payment_id

        LEFT JOIN customers c
          ON p.party_type = 'customer' AND c.id = p.party_id

        LEFT JOIN suppliers s
          ON p.party_type = 'supplier' AND s.id = p.party_id

        LEFT JOIN partners pt
          ON p.party_type = 'partner' AND pt.id = p.party_id

        LEFT JOIN fund_transfers ft
          ON h.record_type = 'transfer' AND ft.id = h.payment_id

        LEFT JOIN funds fFrom
          ON fFrom.id = ft.from_fund_id

        LEFT JOIN funds fTo
          ON fTo.id = ft.to_fund_id

        WHERE h.fund_id = ?
      )
      SELECT * FROM full_history fh
      WHERE 1=1 ${dateFilter}
      ORDER BY datetime(date) DESC, id DESC
      ${pagingClause}
      `
    )
    .all(fundId, ...dateValues, ...pagingValues);

  const plainDateFilter = dateConditions.length
    ? `AND ${dateConditions.join(" AND ").replace(/fh\./g, "")}`
    : "";

  const { total } = db
    .prepare(
      `SELECT COUNT(*) AS total FROM fund_history WHERE fund_id = ? ${plainDateFilter}`
    )
    .get(fundId, ...dateValues);

  const totals = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN movement_type = 'in' THEN amount ELSE 0 END), 0) AS totalIn,
        COALESCE(SUM(CASE WHEN movement_type = 'out' THEN amount ELSE 0 END), 0) AS totalOut
      FROM fund_history
      WHERE fund_id = ? ${plainDateFilter}
      `
    )
    .get(fundId, ...dateValues);

  return {
    data: rows,
    page: currentPage,
    limit: perPage,
    total,
    totalPages: Math.ceil(total / perPage),
    totalIn: totals.totalIn,
    totalOut: totals.totalOut,
  };
}

export default function registerFundIPC() {
  ipcMain.handle("create-fund", (event, data) => {
    if (!data.name || !data.currency_id) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    const initialBalance = Math.abs(Number(data.initial_balance || 0));
    const balanceType =
      data.balance_type === "decrease" ? "decrease" : "increase";

    const createFundTxn = db.transaction((data) => {
      const result = db
        .prepare(
          `
          INSERT INTO funds (name, currency_id)
          VALUES (?, ?)
        `
        )
        .run(data.name, data.currency_id);

      const fundId = result.lastInsertRowid;

      if (initialBalance !== 0) {
        const openingBalanceDate = data.date
          ? `${data.date.slice(0, 10)} 00:00:00`
          : `${new Date().getFullYear()}-01-01 00:00:00`;

        createFundHistory(db, {
          fund_id: fundId,
          record_type: "opening_balance",
          movement_type: balanceType === "increase" ? "in" : "out",
          amount: initialBalance,
          date: openingBalanceDate,
          note: "Opening Balance",
        });
      }

      return fundId;
    });

    try {
      const fundId = createFundTxn(data);
      return { success: true, id: fundId };
    } catch (err) {
      console.error("Failed to create fund:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("update-fund", (event, data) => {
    if (!data.name) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    try {
      db.prepare(
        `
        UPDATE funds
        SET name = ?
        WHERE id = ?
      `
      ).run(data.name, data.id);

      return { success: true };
    } catch (err) {
      console.error("Failed to update fund:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("delete-fund", (event, id) => {
    try {
      const { count } = db
        .prepare(
          `
        SELECT COUNT(*) AS count FROM fund_history WHERE fund_id = ?
      `
        )
        .get(id);

      if (count > 0) {
        return { success: false, error: "FUND_HAS_HISTORY" };
      }

      db.prepare(
        `
        DELETE FROM funds WHERE id = ?
      `
      ).run(id);

      return { success: true };
    } catch (err) {
      console.error("Failed to delete fund:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-funds", () => {
    const funds = db
      .prepare(
        `
      SELECT
        f.*,
        c.name as currency_name,
        c.code as currency_code,
        c.symbol as currency_symbol,
        c.exchangeRate as currency_exchangeRate,
        COALESCE(
          SUM(
            CASE
              WHEN fh.movement_type = 'in' THEN fh.amount
              WHEN fh.movement_type = 'out' THEN -fh.amount
              ELSE 0
            END
          ),
          0
        ) AS computed_balance
      FROM funds f
      LEFT JOIN currencies c ON c.id = f.currency_id
      LEFT JOIN fund_history fh ON fh.fund_id = f.id
      GROUP BY f.id
    `
      )
      .all();

    return funds.map((f) => ({
      ...f,
      balance: f.computed_balance,
    }));
  });

  ipcMain.handle("get-fund", (event, id) => {
    const fund = db
      .prepare(
        `
      SELECT 
        f.*,
        c.name as currency_name,
        c.code as currency_code,
        c.symbol as currency_symbol,
        c.exchangeRate as currency_exchangeRate
      FROM funds f
      LEFT JOIN currencies c ON c.id = f.currency_id
      WHERE f.id = ?
    `
      )
      .get(id);

    return fund;
  });

  ipcMain.handle("get-fund-earliest-date", (event, { fundId }) => {
    try {
      if (!fundId) {
        return { success: true, minDate: null };
      }

      const row = db
        .prepare(
          `SELECT MIN(date) AS minDate FROM fund_history WHERE fund_id = ?`
        )
        .get(fundId);
      return { success: true, minDate: row?.minDate || null };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-fund-history", (event, params) =>
    fetchFundHistory(db, params)
  );

  ipcMain.handle("transfer-fund-to-fund", (event, transferData) => {
    try {
      const {
        from_fund_id,
        to_fund_id,
        deduct_amount,
        receive_amount,
        note,
        date,
      } = transferData;

      if (!from_fund_id || !to_fund_id) {
        return {
          success: false,
          message: "Source and destination funds are required.",
        };
      }

      if (from_fund_id === to_fund_id) {
        return {
          success: false,
          message: "Cannot transfer to the same fund.",
        };
      }

      if (Number(deduct_amount) <= 0) {
        return {
          success: false,
          message: "Invalid transfer amount.",
        };
      }

      if (Number(receive_amount) <= 0) {
        return {
          success: false,
          message: "Invalid receive amount.",
        };
      }

      const fromFund = db
        .prepare(
          `
          SELECT f.*, c.exchangeRate AS currency_exchangeRate, c.code AS currency_code
          FROM funds f
          LEFT JOIN currencies c ON c.id = f.currency_id
          WHERE f.id = ?
        `
        )
        .get(from_fund_id);

      const toFund = db
        .prepare(
          `
          SELECT f.*, c.exchangeRate AS currency_exchangeRate, c.code AS currency_code
          FROM funds f
          LEFT JOIN currencies c ON c.id = f.currency_id
          WHERE f.id = ?
        `
        )
        .get(to_fund_id);

      if (!fromFund || !toFund) {
        return {
          success: false,
          message: "Selected fund not found.",
        };
      }

      // Server-derived, never trusted from the client — same principle as
      // status/effective_rate elsewhere: the funds' own rates are authoritative.
      const nominalRate =
        Number(toFund.currency_exchangeRate || 1) /
        Number(fromFund.currency_exchangeRate || 1);

      const effectiveRate = Number(receive_amount) / Number(deduct_amount);

      const transaction = db.transaction(() => {
        const dateOnly = (date || new Date().toISOString()).slice(0, 10);
        const time = new Date().toTimeString().slice(0, 8);
        const fullDateTime = `${dateOnly} ${time}`;

        const transferResult = db
          .prepare(
            `
          INSERT INTO fund_transfers
          (from_fund_id, to_fund_id, deduct_amount, receive_amount, exchange_rate,
           effective_rate, note, date, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            from_fund_id,
            to_fund_id,
            Number(deduct_amount),
            Number(receive_amount),
            nominalRate,
            effectiveRate,
            note || null,
            fullDateTime,
            transferData.created_by
          );

        const transferId = transferResult.lastInsertRowid;

        createFundHistory(db, {
          fund_id: from_fund_id,
          record_type: "transfer",
          movement_type: "out",
          payment_id: transferId,
          amount: Number(deduct_amount),
          note: note || `Transferred to ${toFund.name}`,
          date: fullDateTime,
        });

        createFundHistory(db, {
          fund_id: to_fund_id,
          record_type: "transfer",
          movement_type: "in",
          payment_id: transferId,
          amount: Number(receive_amount),
          note: note || `Received from ${fromFund.name}`,
          date: fullDateTime,
        });

        return {
          success: true,
          message: "Transfer completed successfully.",
          transferId,
        };
      });

      return transaction();
    } catch (error) {
      console.error("Transfer Fund Error:", error);

      return {
        success: false,
        message: error.message || "Transfer failed.",
      };
    }
  });

  ipcMain.handle("update-fund-transfer", (event, data) => {
    try {
      const {
        id,
        from_fund_id,
        to_fund_id,
        deduct_amount,
        receive_amount,
        note,
        date,
      } = data;

      if (!id) {
        return { success: false, message: "Transfer id is required." };
      }

      if (!from_fund_id || !to_fund_id) {
        return {
          success: false,
          message: "Source and destination funds are required.",
        };
      }

      if (from_fund_id === to_fund_id) {
        return { success: false, message: "Cannot transfer to the same fund." };
      }

      if (Number(deduct_amount) <= 0 || Number(receive_amount) <= 0) {
        return { success: false, message: "Invalid transfer amounts." };
      }

      const existing = db
        .prepare("SELECT * FROM fund_transfers WHERE id = ?")
        .get(id);

      if (!existing) {
        return { success: false, message: "Transfer not found." };
      }

      const fromFund = db
        .prepare(
          `
          SELECT f.*, c.exchangeRate AS currency_exchangeRate, c.code AS currency_code
          FROM funds f
          LEFT JOIN currencies c ON c.id = f.currency_id
          WHERE f.id = ?
        `
        )
        .get(from_fund_id);

      const toFund = db
        .prepare(
          `
          SELECT f.*, c.exchangeRate AS currency_exchangeRate, c.code AS currency_code
          FROM funds f
          LEFT JOIN currencies c ON c.id = f.currency_id
          WHERE f.id = ?
        `
        )
        .get(to_fund_id);

      if (!fromFund || !toFund) {
        return { success: false, message: "Selected fund not found." };
      }

      // Verify both linked fund_history rows actually exist before touching
      // anything — if either is missing, this transfer's history is already
      // corrupted and we should fail loudly rather than silently no-op an
      // UPDATE that matches zero rows.
      const outRow = db
        .prepare(
          `
        SELECT * FROM fund_history
        WHERE payment_id = ? AND record_type = 'transfer' AND movement_type = 'out'
      `
        )
        .get(id);

      const inRow = db
        .prepare(
          `
        SELECT * FROM fund_history
        WHERE payment_id = ? AND record_type = 'transfer' AND movement_type = 'in'
      `
        )
        .get(id);

      if (!outRow || !inRow) {
        return {
          success: false,
          message:
            "This transfer's linked fund history is missing or corrupted — cannot safely update.",
        };
      }

      const nominalRate =
        Number(toFund.currency_exchangeRate || 1) /
        Number(fromFund.currency_exchangeRate || 1);

      const effectiveRate = Number(receive_amount) / Number(deduct_amount);

      const transaction = db.transaction(() => {
        const dateOnly = (
          date ||
          existing.date ||
          new Date().toISOString()
        ).slice(0, 10);
        const time = new Date().toTimeString().slice(0, 8);
        const fullDateTime = `${dateOnly} ${time}`;

        db.prepare(
          `
          UPDATE fund_transfers
          SET from_fund_id = ?,
              to_fund_id = ?,
              deduct_amount = ?,
              receive_amount = ?,
              exchange_rate = ?,
              effective_rate = ?,
              note = ?,
              date = ?
          WHERE id = ?
        `
        ).run(
          from_fund_id,
          to_fund_id,
          Number(deduct_amount),
          Number(receive_amount),
          nominalRate,
          effectiveRate,
          note || null,
          fullDateTime,
          id
        );

        db.prepare(
          `
          UPDATE fund_history
          SET fund_id = ?,
              amount = ?,
              note = ?,
              date = ?
          WHERE id = ?
        `
        ).run(
          from_fund_id,
          Number(deduct_amount),
          note || `Transferred to ${toFund.name}`,
          fullDateTime,
          outRow.id
        );

        db.prepare(
          `
          UPDATE fund_history
          SET fund_id = ?,
              amount = ?,
              note = ?,
              date = ?
          WHERE id = ?
        `
        ).run(
          to_fund_id,
          Number(receive_amount),
          note || `Received from ${fromFund.name}`,
          fullDateTime,
          inRow.id
        );

        return { success: true, message: "Transfer updated successfully." };
      });

      return transaction();
    } catch (error) {
      console.error("Update Fund Transfer Error:", error);
      return {
        success: false,
        message: error.message || "Failed to update transfer.",
      };
    }
  });

  ipcMain.handle("delete-fund-transfer", (event, id) => {
    try {
      if (!id) {
        return { success: false, message: "Transfer id is required." };
      }

      const existing = db
        .prepare("SELECT * FROM fund_transfers WHERE id = ?")
        .get(id);

      if (!existing) {
        return { success: false, message: "Transfer not found." };
      }

      const transaction = db.transaction(() => {
        db.prepare(
          `
          DELETE FROM fund_history
          WHERE payment_id = ? AND record_type IN ('transfer')
        `
        ).run(id);

        db.prepare("DELETE FROM fund_transfers WHERE id = ?").run(id);

        return { success: true, message: "Transfer deleted successfully." };
      });

      return transaction();
    } catch (error) {
      console.error("Delete Fund Transfer Error:", error);
      return {
        success: false,
        message: error.message || "Failed to delete transfer.",
      };
    }
  });

  ipcMain.handle("get-fund-transfers", (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const conditions = [];
    const values = [];

    if (params.fundId) {
      conditions.push("(t.from_fund_id = ? OR t.to_fund_id = ?)");
      values.push(params.fundId, params.fundId);
    }

    if (params.fromFundId) {
      conditions.push("t.from_fund_id = ?");
      values.push(params.fromFundId);
    }

    if (params.toFundId) {
      conditions.push("t.to_fund_id = ?");
      values.push(params.toFundId);
    }

    // Wrapped in date(...) so time-of-day doesn't push same-day rows
    // outside an inclusive range boundary.
    if (params.dateFrom) {
      conditions.push("date(t.date) >= date(?)");
      values.push(params.dateFrom);
    }

    if (params.dateTo) {
      conditions.push("date(t.date) <= date(?)");
      values.push(params.dateTo);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const transfers = db
      .prepare(
        `
      SELECT
        t.*,
        ff.name AS from_fund_name,
        ff.currency_code AS from_fund_currency,
        tf.name AS to_fund_name,
        creator.full_name AS created_by_name,
  
        tf.currency_code AS to_fund_currency
  
      FROM fund_transfers t
      LEFT JOIN (
        SELECT f.id, f.name, c.code AS currency_code
        FROM funds f
        LEFT JOIN currencies c ON c.id = f.currency_id
      ) ff ON ff.id = t.from_fund_id
      LEFT JOIN users creator
      ON creator.id = t.created_by
      LEFT JOIN (
        SELECT f.id, f.name, c.code AS currency_code
        FROM funds f
        LEFT JOIN currencies c ON c.id = f.currency_id
      ) tf ON tf.id = t.to_fund_id
      ${whereClause}
      ORDER BY t.date DESC, t.id DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(...values, limit, offset);

    const { total } = db
      .prepare(
        `
      SELECT COUNT(*) AS total FROM fund_transfers t ${whereClause}
    `
      )
      .get(...values);

    return {
      data: transfers,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  ipcMain.handle("get-fund-transfer", (event, id) => {
    return db
      .prepare(
        `
        SELECT
          t.*,
          ff.name AS from_fund_name,
          ffc.code AS from_fund_currency_code,
          ffc.symbol AS from_fund_currency_symbol,
          tf.name AS to_fund_name,
          tfc.code AS to_fund_currency_code,
          creator.full_name AS created_by_name,
          tfc.symbol AS to_fund_currency_symbol
        FROM fund_transfers t
        LEFT JOIN funds ff ON ff.id = t.from_fund_id
        LEFT JOIN currencies ffc ON ffc.id = ff.currency_id
        LEFT JOIN funds tf ON tf.id = t.to_fund_id
        LEFT JOIN currencies tfc ON tfc.id = tf.currency_id
        LEFT JOIN users creator
        ON creator.id = t.created_by
        WHERE t.id = ?
        `
      )
      .get(id);
  });

  ipcMain.handle(
    "export-fund-history-excel",
    async (event, { fundId, startDate, endDate, language }) => {
      try {
        const L = getLabels(language);
        const isRtl = language === "ar";

        const {
          data: rows,
          totalIn,
          totalOut,
        } = fetchFundHistory(db, {
          fundId,
          startDate,
          endDate,
          exportAll: true,
        });

        const fund = db.prepare(`SELECT * FROM funds WHERE id = ?`).get(fundId);

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(L.title);

        if (isRtl) {
          sheet.views = [{ rightToLeft: true }];
        }

        sheet.columns = [
          { header: L.date, key: "date", width: 18 },
          { header: L.type, key: "record_type", width: 12 },
          { header: L.direction, key: "movement_type", width: 10 },
          { header: L.amount, key: "amount", width: 14 },
          { header: L.partyFund, key: "party_name", width: 22 },
          { header: L.transaction, key: "transaction", width: 18 },
          { header: L.note, key: "note", width: 30 },
          { header: L.runningBalance, key: "running_balance", width: 16 },
        ];
        sheet.getRow(1).font = { bold: true };

        rows.forEach((r) => {
          sheet.addRow({
            date: formatExportDate(r.date),
            record_type: formatRecordType(L, r.record_type),
            movement_type: r.movement_type === "in" ? L.in : L.out,
            amount: r.amount,
            party_name: r.party_name || "",
            transaction: r.transaction_type
              ? `${formatTransactionType(L, r.transaction_type)} #${r.transaction_id}`
              : "",
            note: r.note || "",
            running_balance: r.running_balance,
          });
        });

        sheet.addRow({});
        sheet.addRow({ note: L.totalIn, running_balance: totalIn });
        sheet.addRow({ note: L.totalOut, running_balance: totalOut });

        const { canceled, filePath } = await dialog.showSaveDialog({
          title: L.title,
          defaultPath: `${fund?.name || "fund"}-history.xlsx`,
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
    "export-fund-history-pdf",
    async (event, { fundId, startDate, endDate, language }) => {
      try {
        const L = getLabels(language);
        const isRtl = language === "ar";

        const {
          data: rows,
          totalIn,
          totalOut,
        } = fetchFundHistory(db, {
          fundId,
          startDate,
          endDate,
          exportAll: true,
        });

        const fund = db.prepare(`SELECT * FROM funds WHERE id = ?`).get(fundId);

        const rowsHtml = rows
          .map(
            (r) => `
        <tr>
          <td>${formatExportDate(r.date)}</td>
          <td>${formatRecordType(L, r.record_type)}</td>
          <td>${r.movement_type === "in" ? L.in : L.out}</td>
          <td class="right">${Number(r.amount).toFixed(2)}</td>
          <td>${r.party_name || "-"}</td>
          <td>${r.transaction_type ? `${formatTransactionType(L, r.transaction_type)} #${r.transaction_id}` : "-"}</td>
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
            <h1>${fund?.name || L.title} — ${L.title}</h1>
            <p>${L.period}: ${startDate || L.allTime} ${isRtl ? "←" : "→"} ${endDate || L.present}</p>
            <table>
              <thead>
                <tr>
                  <th>${L.date}</th><th>${L.type}</th><th>${L.direction}</th><th>${L.amount}</th>
                  <th>${L.partyFund}</th><th>${L.transaction}</th><th>${L.note}</th><th>${L.runningBalance}</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <div class="summary">
              ${L.totalIn}: ${Number(totalIn).toFixed(2)} &nbsp;&nbsp;
              ${L.totalOut}: ${Number(totalOut).toFixed(2)}
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
          defaultPath: `${fund?.name || "fund"}-history.pdf`,
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
