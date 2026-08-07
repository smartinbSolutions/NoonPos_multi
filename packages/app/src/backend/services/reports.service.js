// reports.js
//
// Single source of truth for report aggregation logic.
// Helpers here accept an optional { startDate, endDate } — omitted/undefined
// means all-time (used by the dashboard), provided means ranged (used by
// the reports module). Same function, same result shape, different filter.

// ---------------------------------------------------------------------------
function buildDateRangeFilter(column, startDate, endDate) {
  const conditions = [];
  const params = [];

  if (startDate) {
    conditions.push(`date(${column}) >= date(?)`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`date(${column}) <= date(?)`);
    params.push(endDate);
  }

  return {
    clause: conditions.length ? `AND ${conditions.join(" AND ")}` : "",
    params,
  };
}

// ---------------------------------------------------------------------------
export function getProfitLoss(db, { startDate, endDate } = {}) {
  const invoiceDate = buildDateRangeFilter("si.date", startDate, endDate);
  const returnDate = buildDateRangeFilter("sr.date", startDate, endDate);
  const expenseDate = buildDateRangeFilter("date", startDate, endDate);

  const cogs =
    db
      .prepare(
        `
          SELECT COALESCE(SUM(sii.quantity * sii.buyingPrice), 0) AS value
          FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id
          WHERE sii.buyingPrice IS NOT NULL
          ${invoiceDate.clause}
        `
      )
      .get(...invoiceDate.params)?.value || 0;

  const returnedCogs =
    db
      .prepare(
        `
          SELECT COALESCE(SUM(sri.quantity * sii.buyingPrice), 0) AS value
          FROM sales_return_items sri
          JOIN sales_invoice_items sii ON sii.id = sri.sales_invoice_item_id
          JOIN sales_returns sr ON sr.id = sri.return_id
          WHERE sii.buyingPrice IS NOT NULL
          ${returnDate.clause}
        `
      )
      .get(...returnDate.params)?.value || 0;

  const salesTotal =
    db
      .prepare(
        `
          SELECT COALESCE(SUM(net_total), 0) AS value
          FROM sales_invoices si
          WHERE 1=1 ${invoiceDate.clause}
        `
      )
      .get(...invoiceDate.params)?.value || 0;

  const salesReturnTotal =
    db
      .prepare(
        `
          SELECT COALESCE(SUM(net_total), 0) AS value
          FROM sales_returns sr
          WHERE 1=1 ${returnDate.clause}
        `
      )
      .get(...returnDate.params)?.value || 0;

  const salesCount =
    db
      .prepare(
        `
          SELECT COUNT(*) AS value
          FROM sales_invoices si
          WHERE 1=1 ${invoiceDate.clause}
        `
      )
      .get(...invoiceDate.params)?.value || 0;

  const salesReturnCount =
    db
      .prepare(
        `
          SELECT COUNT(*) AS value
          FROM sales_returns sr
          WHERE 1=1 ${returnDate.clause}
        `
      )
      .get(...returnDate.params)?.value || 0;

  const expenseTotal =
    db
      .prepare(
        `
          SELECT COALESCE(SUM(net_total), 0) AS value
          FROM expense
          WHERE 1=1 ${expenseDate.clause}
        `
      )
      .get(...expenseDate.params)?.value || 0;

  const expenseCount =
    db
      .prepare(
        `
          SELECT COUNT(*) AS value
          FROM expense
          WHERE 1=1 ${expenseDate.clause}
        `
      )
      .get(...expenseDate.params)?.value || 0;

  const netCogs = cogs - returnedCogs;
  const netSalesTotal = salesTotal - salesReturnTotal;
  const grossProfit = netSalesTotal - netCogs;
  const netProfit = grossProfit - expenseTotal;

  return {
    sales: {
      total: netSalesTotal,
      gross: salesTotal,
      returns: salesReturnTotal,
      count: salesCount,
      returnCount: salesReturnCount,
    },
    expense: {
      total: expenseTotal,
      count: expenseCount,
    },
    profitLoss: {
      cogs: netCogs,
      cogsGross: cogs,
      cogsReturned: returnedCogs,
      grossProfit,
      netProfit,
    },
  };
}

// ---------------------------------------------------------------------------
function buildBucketCTE(groupBy, startDate, endDate) {
  if (groupBy === "day") {
    return {
      cte: `
          WITH RECURSIVE buckets(bucket) AS (
            SELECT date(?)
            UNION ALL
            SELECT date(bucket, '+1 day') FROM buckets WHERE bucket < date(?)
          )
        `,
      params: [startDate, endDate],
      matchExpr: (col) => `date(${col})`,
    };
  }

  return {
    cte: `
        WITH RECURSIVE buckets(bucket) AS (
          SELECT strftime('%Y-%m', date(?))
          UNION ALL
          SELECT strftime('%Y-%m', date(bucket || '-01', '+1 month'))
          FROM buckets
          WHERE bucket < strftime('%Y-%m', date(?))
        )
      `,
    params: [startDate, endDate],
    matchExpr: (col) => `strftime('%Y-%m', ${col})`,
  };
}

// ---------------------------------------------------------------------------
export function getProfitLossTrend(db, { startDate, endDate } = {}) {
  const effectiveEnd = endDate || new Date().toISOString().slice(0, 10);
  const effectiveStart =
    startDate ||
    new Date(new Date(effectiveEnd).getTime() - 29 * 86400000)
      .toISOString()
      .slice(0, 10);

  const dayCount =
    Math.round((new Date(effectiveEnd) - new Date(effectiveStart)) / 86400000) +
    1;
  const groupBy = dayCount <= 31 ? "day" : "month";

  const { cte, params, matchExpr } = buildBucketCTE(
    groupBy,
    effectiveStart,
    effectiveEnd
  );

  const salesRows = db
    .prepare(
      `
          ${cte}
          SELECT
            buckets.bucket AS bucket,
            COALESCE(SUM(si.net_total), 0) AS sales
          FROM buckets
          LEFT JOIN sales_invoices si ON ${matchExpr("si.date")} = buckets.bucket
          GROUP BY buckets.bucket
          ORDER BY buckets.bucket
        `
    )
    .all(...params);

  const returnRows = db
    .prepare(
      `
          ${cte}
          SELECT
            buckets.bucket AS bucket,
            COALESCE(SUM(sr.net_total), 0) AS returns
          FROM buckets
          LEFT JOIN sales_returns sr ON ${matchExpr("sr.date")} = buckets.bucket
          GROUP BY buckets.bucket
          ORDER BY buckets.bucket
        `
    )
    .all(...params);

  const expenseRows = db
    .prepare(
      `
          ${cte}
          SELECT
            buckets.bucket AS bucket,
            COALESCE(SUM(e.net_total), 0) AS expense
          FROM buckets
          LEFT JOIN expense e ON ${matchExpr("e.date")} = buckets.bucket
          GROUP BY buckets.bucket
          ORDER BY buckets.bucket
        `
    )
    .all(...params);

  const cogsRows = db
    .prepare(
      `
          ${cte}
          SELECT
            buckets.bucket AS bucket,
            COALESCE(SUM(sii.quantity * sii.buyingPrice), 0) AS cogs
          FROM buckets
          LEFT JOIN sales_invoices si ON ${matchExpr("si.date")} = buckets.bucket
          LEFT JOIN sales_invoice_items sii
            ON sii.invoice_id = si.id AND sii.buyingPrice IS NOT NULL
          GROUP BY buckets.bucket
          ORDER BY buckets.bucket
        `
    )
    .all(...params);

  // All four queries share the exact same bucket set (from the same CTE),
  // so merging by index-aligned bucket key is safe.
  const returnsByBucket = new Map(returnRows.map((r) => [r.bucket, r.returns]));
  const expenseByBucket = new Map(
    expenseRows.map((r) => [r.bucket, r.expense])
  );
  const cogsByBucket = new Map(cogsRows.map((r) => [r.bucket, r.cogs]));

  const series = salesRows.map((row) => {
    const sales = row.sales;
    const returns = returnsByBucket.get(row.bucket) || 0;
    const expense = expenseByBucket.get(row.bucket) || 0;
    const cogs = cogsByBucket.get(row.bucket) || 0;

    const netSales = sales - returns;
    const grossProfit = netSales - cogs;
    const netProfit = grossProfit - expense;

    return {
      bucket: row.bucket,
      sales,
      returns,
      expense,
      cogs,
      netSales,
      grossProfit,
      netProfit,
    };
  });

  return { groupBy, series };
}

// ---------------------------------------------------------------------------
export function getExpenseCategoryBreakdown(db, { startDate, endDate } = {}) {
  const expenseDate = buildDateRangeFilter("e.date", startDate, endDate);

  return db
    .prepare(
      `
          SELECT
            ec.id AS category_id,
            COALESCE(ec.name, 'Unknown') AS name,
            COALESCE(SUM(ei.price), 0) AS total_spent,
            COUNT(ei.id) AS items_count
          FROM expense_items ei
          JOIN expense e ON e.id = ei.expense_id
          LEFT JOIN expence_category ec ON ec.id = ei.category_id
          WHERE 1=1 ${expenseDate.clause}
          GROUP BY ei.category_id
          ORDER BY total_spent DESC
        `
    )
    .all(...expenseDate.params);
}

// ---------------------------------------------------------------------------
// getSalesSummary — headline totals for the sales report: gross, returns,
// net, invoice count, and average invoice value. Same shape family as
// getProfitLoss's `sales` block, but standalone since the sales report
// doesn't need cogs/expense/profit — just the sales side.
// ---------------------------------------------------------------------------
export function getSalesSummary(db, { startDate, endDate } = {}) {
  const invoiceDate = buildDateRangeFilter("date", startDate, endDate);
  const returnDate = buildDateRangeFilter("date", startDate, endDate);

  const grossSales =
    db
      .prepare(
        `
            SELECT COALESCE(SUM(net_total), 0) AS value
            FROM sales_invoices
            WHERE 1=1 ${invoiceDate.clause}
          `
      )
      .get(...invoiceDate.params)?.value || 0;

  const invoiceCount =
    db
      .prepare(
        `
            SELECT COUNT(*) AS value
            FROM sales_invoices
            WHERE 1=1 ${invoiceDate.clause}
          `
      )
      .get(...invoiceDate.params)?.value || 0;

  const returnsTotal =
    db
      .prepare(
        `
            SELECT COALESCE(SUM(net_total), 0) AS value
            FROM sales_returns
            WHERE 1=1 ${returnDate.clause}
          `
      )
      .get(...returnDate.params)?.value || 0;

  const returnsCount =
    db
      .prepare(
        `
            SELECT COUNT(*) AS value
            FROM sales_returns
            WHERE 1=1 ${returnDate.clause}
          `
      )
      .get(...returnDate.params)?.value || 0;

  const netSales = grossSales - returnsTotal;
  // Average invoice value uses gross sales / invoice count — not net —
  // since an invoice's own value is fixed at creation, returns are a
  // separate later event and shouldn't retroactively shrink "average sale".
  const averageInvoiceValue = invoiceCount > 0 ? grossSales / invoiceCount : 0;

  return {
    grossSales,
    invoiceCount,
    returnsTotal,
    returnsCount,
    netSales,
    averageInvoiceValue,
  };
}

// ---------------------------------------------------------------------------
// getSalesByProduct — per-product quantity, revenue, cost, and margin.
// `limit` defaults to 20 (top N by revenue) — pass limit: null explicitly to
// get every product with no cap, which is how the "Show all" UI action
// re-queries this same function.
// ---------------------------------------------------------------------------
export function getSalesByProduct(db, { startDate, endDate, limit = 20 } = {}) {
  const invoiceDate = buildDateRangeFilter("si.date", startDate, endDate);
  // LIMIT -1 in SQLite means "no limit" — used when the caller passes
  // limit: null/undefined for the "show everything" case.
  const effectiveLimit = limit === null || limit === undefined ? -1 : limit;

  return (
    db
      .prepare(
        `
          SELECT
            sii.product_id,
            COALESCE(p.name, sii.product_name, 'Unknown') AS name,
            COALESCE(SUM(sii.quantity), 0) AS quantity,
            COALESCE(SUM(sii.total), 0) AS revenue,
            COALESCE(SUM(sii.quantity * sii.buyingPrice), 0) AS cost,
            COALESCE(SUM(sii.total), 0) - COALESCE(SUM(sii.quantity * sii.buyingPrice), 0) AS margin
          FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id
          LEFT JOIN products p ON p.id = sii.product_id
          WHERE 1=1 ${invoiceDate.clause}
          GROUP BY sii.product_id
          ORDER BY revenue DESC
          LIMIT ?
        `
      )
      .all(...invoiceDate.params, effectiveLimit)
      // marginPercent computed in JS rather than SQL — avoids a division-by-zero
      // CASE expression in every row for a product with zero revenue (shouldn't
      // happen given the GROUP BY, but cheap insurance).
      .map((row) => ({
        ...row,
        marginPercent: row.revenue > 0 ? (row.margin / row.revenue) * 100 : 0,
      }))
  );
}

// ---------------------------------------------------------------------------
// getSalesByCustomer — per-customer invoice count, total purchased, and
// average order value. Same limit/null-for-all convention as getSalesByProduct.
// ---------------------------------------------------------------------------
export function getSalesByCustomer(
  db,
  { startDate, endDate, limit = 20 } = {}
) {
  const invoiceDate = buildDateRangeFilter("date", startDate, endDate);
  const effectiveLimit = limit === null || limit === undefined ? -1 : limit;

  return db
    .prepare(
      `
          SELECT
            si.customer_id,
            COALESCE(c.name, 'Unknown') AS name,
            COUNT(*) AS invoiceCount,
            COALESCE(SUM(si.net_total), 0) AS totalPurchased,
            COALESCE(SUM(si.net_total), 0) / COUNT(*) AS averageOrderValue
          FROM sales_invoices si
          LEFT JOIN customers c ON c.id = si.customer_id
          WHERE 1=1 ${invoiceDate.clause}
          GROUP BY si.customer_id
          ORDER BY totalPurchased DESC
          LIMIT ?
        `
    )
    .all(...invoiceDate.params, effectiveLimit);
}

// ---------------------------------------------------------------------------
// getSalesTrend — sales revenue per bucket (day/month), zero-filled the same
// way as getProfitLossTrend. Kept single-purpose (sales only, no
// expense/cogs series) since this report's trend question is just
// "how did sales move day to day", not the fuller P&L picture.
// ---------------------------------------------------------------------------
export function getSalesTrend(db, { startDate, endDate } = {}) {
  const effectiveEnd = endDate || new Date().toISOString().slice(0, 10);
  const effectiveStart =
    startDate ||
    new Date(new Date(effectiveEnd).getTime() - 29 * 86400000)
      .toISOString()
      .slice(0, 10);

  const dayCount =
    Math.round((new Date(effectiveEnd) - new Date(effectiveStart)) / 86400000) +
    1;
  const groupBy = dayCount <= 31 ? "day" : "month";

  const { cte, params, matchExpr } = buildBucketCTE(
    groupBy,
    effectiveStart,
    effectiveEnd
  );

  const rows = db
    .prepare(
      `
          ${cte}
          SELECT
            buckets.bucket AS bucket,
            COALESCE(SUM(si.net_total), 0) AS sales
          FROM buckets
          LEFT JOIN sales_invoices si ON ${matchExpr("si.date")} = buckets.bucket
          GROUP BY buckets.bucket
          ORDER BY buckets.bucket
        `
    )
    .all(...params);

  return { groupBy, series: rows };
}
