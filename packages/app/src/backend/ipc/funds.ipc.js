// packages/app/src/backend/fund.ipc.js
import { ipcMain, dialog, BrowserWindow } from "electron";
import ExcelJS from "exceljs";
import fs from "fs";
import { query, getClient } from "../dbConnect.js";
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

/**
 * PORTED: async, Postgres. h.date/fh.date are TIMESTAMPTZ columns now, so
 * SQLite's datetime(...)/date(...) wrapping isn't needed for ordering —
 * only for date-only comparisons (::date casts) where the original used
 * date(?) to normalize input strings.
 */
async function fetchFundHistory(
  queryFn,
  { fundId, page = 1, limit = 50, startDate, endDate, exportAll = false },
) {
  const currentPage = Math.max(1, Number(page) || 1);
  const perPage = Math.max(1, Number(limit) || 50);
  const offset = (currentPage - 1) * perPage;

  const dateConditions = [];
  const dateValues = [];
  let paramIndex = 2;

  if (startDate) {
    dateConditions.push(`fh.date::date >= $${paramIndex}::date`);
    dateValues.push(startDate);
    paramIndex++;
  }
  if (endDate) {
    dateConditions.push(`fh.date::date <= $${paramIndex}::date`);
    dateValues.push(endDate);
    paramIndex++;
  }
  const dateFilter = dateConditions.length
    ? `AND ${dateConditions.join(" AND ")}`
    : "";

  const pagingClause = exportAll
    ? ""
    : `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  const pagingValues = exportAll ? [] : [perPage, offset];

  const { rows } = await queryFn(
    `WITH full_history AS (
      SELECT
        h.id,
        h.fund_id,
        h.record_type,
        h.date,
        h.movement_type,
        h.amount,
        h.note,
        h.created_at,

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
          ORDER BY h.date, h.id
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

      WHERE h.fund_id = $1
    )
    SELECT * FROM full_history fh
    WHERE 1=1 ${dateFilter}
    ORDER BY date DESC, id DESC
    ${pagingClause}`,
    [fundId, ...dateValues, ...pagingValues],
  );

  const { rows: totalRows } = await queryFn(
    `SELECT COUNT(*) AS total FROM fund_history WHERE fund_id = $1 ${dateFilter.replace(/fh\./g, "")}`,
    [fundId, ...dateValues],
  );
  const total = Number(totalRows[0].total);

  const { rows: totalsRows } = await queryFn(
    `SELECT
      COALESCE(SUM(CASE WHEN movement_type = 'in' THEN amount ELSE 0 END), 0) AS "totalIn",
      COALESCE(SUM(CASE WHEN movement_type = 'out' THEN amount ELSE 0 END), 0) AS "totalOut"
    FROM fund_history
    WHERE fund_id = $1 ${dateFilter.replace(/fh\./g, "")}`,
    [fundId, ...dateValues],
  );
  const totals = totalsRows[0];

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
  ipcMain.handle("create-fund", async (event, data) => {
    if (!data.name || !data.currency_id) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    const initialBalance = Math.abs(Number(data.initial_balance || 0));
    const balanceType =
      data.balance_type === "decrease" ? "decrease" : "increase";

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO funds (name, currency_id) VALUES ($1, $2) RETURNING id`,
        [data.name, data.currency_id],
      );
      const fundId = result.rows[0].id;

      if (initialBalance !== 0) {
        const openingBalanceDate = data.date
          ? `${data.date.slice(0, 10)} 00:00:00`
          : `${new Date().getFullYear()}-01-01 00:00:00`;

        await createFundHistory(client.query.bind(client), {
          fund_id: fundId,
          record_type: "opening_balance",
          movement_type: balanceType === "increase" ? "in" : "out",
          amount: initialBalance,
          date: openingBalanceDate,
          note: "Opening Balance",
        });
      }

      await client.query("COMMIT");
      return { success: true, id: fundId };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Failed to create fund:", err);
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });

  ipcMain.handle("update-fund", async (event, data) => {
    if (!data.name) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    try {
      await query(`UPDATE funds SET name = $1 WHERE id = $2`, [
        data.name,
        data.id,
      ]);

      return { success: true };
    } catch (err) {
      console.error("Failed to update fund:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("delete-fund", async (event, id) => {
    try {
      const { rows } = await query(
        `SELECT COUNT(*) AS count FROM fund_history WHERE fund_id = $1`,
        [id],
      );

      if (Number(rows[0].count) > 0) {
        return { success: false, error: "FUND_HAS_HISTORY" };
      }

      await query(`DELETE FROM funds WHERE id = $1`, [id]);

      return { success: true };
    } catch (err) {
      console.error("Failed to delete fund:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-funds", async () => {
    const { rows: funds } = await query(
      `SELECT
        f.*,
        c.name as currency_name,
        c.code as currency_code,
        c.symbol as currency_symbol,
        c.exchange_rate as "currency_exchangeRate",
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
      GROUP BY f.id, c.name, c.code, c.symbol, c.exchange_rate`,
    );

    return funds.map((f) => ({
      ...f,
      balance: f.computed_balance,
    }));
  });

  ipcMain.handle("get-fund", async (event, id) => {
    const { rows } = await query(
      `SELECT
        f.*,
        c.name as currency_name,
        c.code as currency_code,
        c.symbol as currency_symbol,
        c.exchange_rate as "currency_exchangeRate"
      FROM funds f
      LEFT JOIN currencies c ON c.id = f.currency_id
      WHERE f.id = $1`,
      [id],
    );

    return rows[0];
  });

  ipcMain.handle("get-fund-earliest-date", async (event, { fundId }) => {
    try {
      if (!fundId) {
        return { success: true, minDate: null };
      }

      const { rows } = await query(
        `SELECT MIN(date) AS "minDate" FROM fund_history WHERE fund_id = $1`,
        [fundId],
      );
      return { success: true, minDate: rows[0]?.minDate || null };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-fund-history", async (event, params) =>
    fetchFundHistory(query, params),
  );

  ipcMain.handle("transfer-fund-to-fund", async (event, transferData) => {
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
        return { success: false, message: "Invalid transfer amount." };
      }

      if (Number(receive_amount) <= 0) {
        return { success: false, message: "Invalid receive amount." };
      }

      const { rows: fromFundRows } = await query(
        `SELECT f.*, c.exchange_rate AS "currency_exchangeRate", c.code AS currency_code
         FROM funds f
         LEFT JOIN currencies c ON c.id = f.currency_id
         WHERE f.id = $1`,
        [from_fund_id],
      );
      const fromFund = fromFundRows[0];

      const { rows: toFundRows } = await query(
        `SELECT f.*, c.exchange_rate AS "currency_exchangeRate", c.code AS currency_code
         FROM funds f
         LEFT JOIN currencies c ON c.id = f.currency_id
         WHERE f.id = $1`,
        [to_fund_id],
      );
      const toFund = toFundRows[0];

      if (!fromFund || !toFund) {
        return { success: false, message: "Selected fund not found." };
      }

      const nominalRate =
        Number(toFund.currency_exchangeRate || 1) /
        Number(fromFund.currency_exchangeRate || 1);

      const effectiveRate = Number(receive_amount) / Number(deduct_amount);

      const client = await getClient();
      try {
        await client.query("BEGIN");

        const dateOnly = (date || new Date().toISOString()).slice(0, 10);
        const time = new Date().toTimeString().slice(0, 8);
        const fullDateTime = `${dateOnly} ${time}`;

        const transferResult = await client.query(
          `INSERT INTO fund_transfers
           (from_fund_id, to_fund_id, deduct_amount, receive_amount, exchange_rate,
            effective_rate, note, date, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id`,
          [
            from_fund_id,
            to_fund_id,
            Number(deduct_amount),
            Number(receive_amount),
            nominalRate,
            effectiveRate,
            note || null,
            fullDateTime,
            transferData.created_by,
          ],
        );
        const transferId = transferResult.rows[0].id;

        await createFundHistory(client.query.bind(client), {
          fund_id: from_fund_id,
          record_type: "transfer",
          movement_type: "out",
          payment_id: transferId,
          amount: Number(deduct_amount),
          note: note || `Transferred to ${toFund.name}`,
          date: fullDateTime,
        });

        await createFundHistory(client.query.bind(client), {
          fund_id: to_fund_id,
          record_type: "transfer",
          movement_type: "in",
          payment_id: transferId,
          amount: Number(receive_amount),
          note: note || `Received from ${fromFund.name}`,
          date: fullDateTime,
        });

        await client.query("COMMIT");
        return {
          success: true,
          message: "Transfer completed successfully.",
          transferId,
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Transfer Fund Error:", error);
      return { success: false, message: error.message || "Transfer failed." };
    }
  });

  ipcMain.handle("update-fund-transfer", async (event, data) => {
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

      const { rows: existingRows } = await query(
        "SELECT * FROM fund_transfers WHERE id = $1",
        [id],
      );
      const existing = existingRows[0];

      if (!existing) {
        return { success: false, message: "Transfer not found." };
      }

      const { rows: fromFundRows } = await query(
        `SELECT f.*, c.exchange_rate AS "currency_exchangeRate", c.code AS currency_code
         FROM funds f
         LEFT JOIN currencies c ON c.id = f.currency_id
         WHERE f.id = $1`,
        [from_fund_id],
      );
      const fromFund = fromFundRows[0];

      const { rows: toFundRows } = await query(
        `SELECT f.*, c.exchange_rate AS "currency_exchangeRate", c.code AS currency_code
         FROM funds f
         LEFT JOIN currencies c ON c.id = f.currency_id
         WHERE f.id = $1`,
        [to_fund_id],
      );
      const toFund = toFundRows[0];

      if (!fromFund || !toFund) {
        return { success: false, message: "Selected fund not found." };
      }

      const { rows: outRows } = await query(
        `SELECT * FROM fund_history
         WHERE payment_id = $1 AND record_type = 'transfer' AND movement_type = 'out'`,
        [id],
      );
      const outRow = outRows[0];

      const { rows: inRows } = await query(
        `SELECT * FROM fund_history
         WHERE payment_id = $1 AND record_type = 'transfer' AND movement_type = 'in'`,
        [id],
      );
      const inRow = inRows[0];

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

      const client = await getClient();
      try {
        await client.query("BEGIN");

        const dateOnly = (date || existing.date || new Date().toISOString())
          .toString()
          .slice(0, 10);
        const time = new Date().toTimeString().slice(0, 8);
        const fullDateTime = `${dateOnly} ${time}`;

        await client.query(
          `UPDATE fund_transfers
           SET from_fund_id = $1,
               to_fund_id = $2,
               deduct_amount = $3,
               receive_amount = $4,
               exchange_rate = $5,
               effective_rate = $6,
               note = $7,
               date = $8
           WHERE id = $9`,
          [
            from_fund_id,
            to_fund_id,
            Number(deduct_amount),
            Number(receive_amount),
            nominalRate,
            effectiveRate,
            note || null,
            fullDateTime,
            id,
          ],
        );

        await client.query(
          `UPDATE fund_history
           SET fund_id = $1, amount = $2, note = $3, date = $4
           WHERE id = $5`,
          [
            from_fund_id,
            Number(deduct_amount),
            note || `Transferred to ${toFund.name}`,
            fullDateTime,
            outRow.id,
          ],
        );

        await client.query(
          `UPDATE fund_history
           SET fund_id = $1, amount = $2, note = $3, date = $4
           WHERE id = $5`,
          [
            to_fund_id,
            Number(receive_amount),
            note || `Received from ${fromFund.name}`,
            fullDateTime,
            inRow.id,
          ],
        );

        await client.query("COMMIT");
        return { success: true, message: "Transfer updated successfully." };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Update Fund Transfer Error:", error);
      return {
        success: false,
        message: error.message || "Failed to update transfer.",
      };
    }
  });

  ipcMain.handle("delete-fund-transfer", async (event, id) => {
    try {
      if (!id) {
        return { success: false, message: "Transfer id is required." };
      }

      const { rows: existingRows } = await query(
        "SELECT * FROM fund_transfers WHERE id = $1",
        [id],
      );
      if (!existingRows[0]) {
        return { success: false, message: "Transfer not found." };
      }

      const client = await getClient();
      try {
        await client.query("BEGIN");

        await client.query(
          `DELETE FROM fund_history
           WHERE payment_id = $1 AND record_type = 'transfer'`,
          [id],
        );

        await client.query("DELETE FROM fund_transfers WHERE id = $1", [id]);

        await client.query("COMMIT");
        return { success: true, message: "Transfer deleted successfully." };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Delete Fund Transfer Error:", error);
      return {
        success: false,
        message: error.message || "Failed to delete transfer.",
      };
    }
  });

  ipcMain.handle("get-fund-transfers", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (params.fundId) {
      conditions.push(
        `(t.from_fund_id = $${paramIndex} OR t.to_fund_id = $${paramIndex + 1})`,
      );
      values.push(params.fundId, params.fundId);
      paramIndex += 2;
    }

    if (params.fromFundId) {
      conditions.push(`t.from_fund_id = $${paramIndex}`);
      values.push(params.fromFundId);
      paramIndex++;
    }

    if (params.toFundId) {
      conditions.push(`t.to_fund_id = $${paramIndex}`);
      values.push(params.toFundId);
      paramIndex++;
    }

    if (params.dateFrom) {
      conditions.push(`t.date::date >= $${paramIndex}::date`);
      values.push(params.dateFrom);
      paramIndex++;
    }

    if (params.dateTo) {
      conditions.push(`t.date::date <= $${paramIndex}::date`);
      values.push(params.dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const { rows: transfers } = await query(
      `SELECT
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
      LEFT JOIN users creator ON creator.id = t.created_by
      LEFT JOIN (
        SELECT f.id, f.name, c.code AS currency_code
        FROM funds f
        LEFT JOIN currencies c ON c.id = f.currency_id
      ) tf ON tf.id = t.to_fund_id
      ${whereClause}
      ORDER BY t.date DESC, t.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset],
    );

    const { rows: totalRows } = await query(
      `SELECT COUNT(*) AS total FROM fund_transfers t ${whereClause}`,
      values,
    );
    const total = Number(totalRows[0].total);

    return {
      data: transfers,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  ipcMain.handle("get-fund-transfer", async (event, id) => {
    const { rows } = await query(
      `SELECT
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
      LEFT JOIN users creator ON creator.id = t.created_by
      WHERE t.id = $1`,
      [id],
    );

    return rows[0];
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
        } = await fetchFundHistory(query, {
          fundId,
          startDate,
          endDate,
          exportAll: true,
        });

        const { rows: fundRows } = await query(
          "SELECT * FROM funds WHERE id = $1",
          [fundId],
        );
        const fund = fundRows[0];

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
    },
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
        } = await fetchFundHistory(query, {
          fundId,
          startDate,
          endDate,
          exportAll: true,
        });

        const { rows: fundRows } = await query(
          "SELECT * FROM funds WHERE id = $1",
          [fundId],
        );
        const fund = fundRows[0];

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
      `,
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
          "data:text/html;charset=utf-8," + encodeURIComponent(html),
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
    },
  );
}
