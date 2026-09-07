// reports.service.js

// ---------------------------------------------------------------------------
function buildDateRangeFilter(column, startDate, endDate, startIndex) {
  const conditions = [];
  const params = [];
  let idx = startIndex;

  if (startDate) {
    conditions.push(`${column}::date >= $${idx}::date`);
    params.push(startDate);
    idx++;
  }
  if (endDate) {
    conditions.push(`${column}::date <= $${idx}::date`);
    params.push(endDate);
    idx++;
  }

  return {
    clause: conditions.length ? `AND ${conditions.join(" AND ")}` : "",
    params,
    nextIndex: idx,
  };
}

// ---------------------------------------------------------------------------
export async function getProfitLoss(query, { startDate, endDate } = {}) {
  const invoiceDate = buildDateRangeFilter("si.date", startDate, endDate, 1);
  const returnDate = buildDateRangeFilter("sr.date", startDate, endDate, 1);
  const expenseDate = buildDateRangeFilter("date", startDate, endDate, 1);

  const { rows: cogsRows } = await query(
    `
    SELECT COALESCE(SUM(sii.quantity * sii.buying_price), 0) AS value
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    WHERE sii.buying_price IS NOT NULL
    ${invoiceDate.clause}
    `,
    invoiceDate.params,
  );
  const cogs = Number(cogsRows[0]?.value || 0);

  const { rows: returnedCogsRows } = await query(
    `
    SELECT COALESCE(SUM(sri.quantity * sii.buying_price), 0) AS value
    FROM sales_return_items sri
    JOIN sales_invoice_items sii ON sii.id = sri.sales_invoice_item_id
    JOIN sales_returns sr ON sr.id = sri.return_id
    WHERE sii.buying_price IS NOT NULL
    ${returnDate.clause}
    `,
    returnDate.params,
  );
  const returnedCogs = Number(returnedCogsRows[0]?.value || 0);

  const { rows: salesTotalRows } = await query(
    `SELECT COALESCE(SUM(net_total), 0) AS value FROM sales_invoices si WHERE 1=1 ${invoiceDate.clause}`,
    invoiceDate.params,
  );
  const salesTotal = Number(salesTotalRows[0]?.value || 0);

  const { rows: salesReturnTotalRows } = await query(
    `SELECT COALESCE(SUM(net_total), 0) AS value FROM sales_returns sr WHERE 1=1 ${returnDate.clause}`,
    returnDate.params,
  );
  const salesReturnTotal = Number(salesReturnTotalRows[0]?.value || 0);

  const { rows: salesCountRows } = await query(
    `SELECT COUNT(*) AS value FROM sales_invoices si WHERE 1=1 ${invoiceDate.clause}`,
    invoiceDate.params,
  );
  const salesCount = Number(salesCountRows[0]?.value || 0);

  const { rows: salesReturnCountRows } = await query(
    `SELECT COUNT(*) AS value FROM sales_returns sr WHERE 1=1 ${returnDate.clause}`,
    returnDate.params,
  );
  const salesReturnCount = Number(salesReturnCountRows[0]?.value || 0);

  const { rows: expenseTotalRows } = await query(
    `SELECT COALESCE(SUM(net_total), 0) AS value FROM expense WHERE 1=1 ${expenseDate.clause}`,
    expenseDate.params,
  );
  const expenseTotal = Number(expenseTotalRows[0]?.value || 0);

  const { rows: expenseCountRows } = await query(
    `SELECT COUNT(*) AS value FROM expense WHERE 1=1 ${expenseDate.clause}`,
    expenseDate.params,
  );
  const expenseCount = Number(expenseCountRows[0]?.value || 0);

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
// buildBucketCTE — Postgres has no need for SQLite's WITH RECURSIVE trick;
// generate_series() produces the same bucket set directly.
// Day buckets are native `date` values; month buckets are 'YYYY-MM' text,
// matching matchExpr's output type so the join comparison lines up.
// ---------------------------------------------------------------------------
function buildBucketCTE(groupBy, startDate, endDate) {
  if (groupBy === "day") {
    return {
      cte: `
        WITH buckets AS (
          SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS bucket
        )
      `,
      params: [startDate, endDate],
      matchExpr: (col) => `${col}::date`,
    };
  }

  return {
    cte: `
      WITH buckets AS (
        SELECT to_char(
          generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), '1 month'::interval),
          'YYYY-MM'
        ) AS bucket
      )
    `,
    params: [startDate, endDate],
    matchExpr: (col) => `to_char(${col}::date, 'YYYY-MM')`,
  };
}

// ---------------------------------------------------------------------------
export async function getProfitLossTrend(query, { startDate, endDate } = {}) {
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
    effectiveEnd,
  );

  const { rows: salesRows } = await query(
    `
    ${cte}
    SELECT
      buckets.bucket::text AS bucket,
      COALESCE(SUM(si.net_total), 0) AS sales
    FROM buckets
    LEFT JOIN sales_invoices si ON ${matchExpr("si.date")} = buckets.bucket
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
    `,
    params,
  );

  const { rows: returnRows } = await query(
    `
    ${cte}
    SELECT
      buckets.bucket::text AS bucket,
      COALESCE(SUM(sr.net_total), 0) AS returns
    FROM buckets
    LEFT JOIN sales_returns sr ON ${matchExpr("sr.date")} = buckets.bucket
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
    `,
    params,
  );

  const { rows: expenseRows } = await query(
    `
    ${cte}
    SELECT
      buckets.bucket::text AS bucket,
      COALESCE(SUM(e.net_total), 0) AS expense
    FROM buckets
    LEFT JOIN expense e ON ${matchExpr("e.date")} = buckets.bucket
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
    `,
    params,
  );

  const { rows: cogsRows } = await query(
    `
    ${cte}
    SELECT
      buckets.bucket::text AS bucket,
      COALESCE(SUM(sii.quantity * sii.buying_price), 0) AS cogs
    FROM buckets
    LEFT JOIN sales_invoices si ON ${matchExpr("si.date")} = buckets.bucket
    LEFT JOIN sales_invoice_items sii
      ON sii.invoice_id = si.id AND sii.buying_price IS NOT NULL
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
    `,
    params,
  );

  const returnsByBucket = new Map(
    returnRows.map((r) => [r.bucket, Number(r.returns)]),
  );
  const expenseByBucket = new Map(
    expenseRows.map((r) => [r.bucket, Number(r.expense)]),
  );
  const cogsByBucket = new Map(cogsRows.map((r) => [r.bucket, Number(r.cogs)]));

  const series = salesRows.map((row) => {
    const sales = Number(row.sales);
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
export async function getExpenseCategoryBreakdown(
  query,
  { startDate, endDate } = {},
) {
  const expenseDate = buildDateRangeFilter("e.date", startDate, endDate, 1);

  const { rows } = await query(
    `
    SELECT
      ec.id AS category_id,
      COALESCE(ec.name, 'Unknown') AS name,
      COALESCE(SUM(ei.price), 0) AS total_spent,
      COUNT(ei.id) AS items_count
    FROM expense_items ei
    JOIN expense e ON e.id = ei.expense_id
    LEFT JOIN expense_category ec ON ec.id = ei.category_id
    WHERE 1=1 ${expenseDate.clause}
    GROUP BY ec.id, ei.category_id
    ORDER BY total_spent DESC
    `,
    expenseDate.params,
  );

  return rows.map((row) => ({
    ...row,
    total_spent: Number(row.total_spent),
    items_count: Number(row.items_count),
  }));
}

// ---------------------------------------------------------------------------
export async function getSalesSummary(query, { startDate, endDate } = {}) {
  const invoiceDate = buildDateRangeFilter("date", startDate, endDate, 1);
  const returnDate = buildDateRangeFilter("date", startDate, endDate, 1);

  const { rows: grossSalesRows } = await query(
    `SELECT COALESCE(SUM(net_total), 0) AS value FROM sales_invoices WHERE 1=1 ${invoiceDate.clause}`,
    invoiceDate.params,
  );
  const grossSales = Number(grossSalesRows[0]?.value || 0);

  const { rows: invoiceCountRows } = await query(
    `SELECT COUNT(*) AS value FROM sales_invoices WHERE 1=1 ${invoiceDate.clause}`,
    invoiceDate.params,
  );
  const invoiceCount = Number(invoiceCountRows[0]?.value || 0);

  const { rows: returnsTotalRows } = await query(
    `SELECT COALESCE(SUM(net_total), 0) AS value FROM sales_returns WHERE 1=1 ${returnDate.clause}`,
    returnDate.params,
  );
  const returnsTotal = Number(returnsTotalRows[0]?.value || 0);

  const { rows: returnsCountRows } = await query(
    `SELECT COUNT(*) AS value FROM sales_returns WHERE 1=1 ${returnDate.clause}`,
    returnDate.params,
  );
  const returnsCount = Number(returnsCountRows[0]?.value || 0);

  const netSales = grossSales - returnsTotal;
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
export async function getSalesByProduct(
  query,
  { startDate, endDate, limit = 20 } = {},
) {
  const invoiceDate = buildDateRangeFilter("si.date", startDate, endDate, 1);
  // Postgres: LIMIT NULL means "no limit" (LIMIT -1 is SQLite-only syntax).
  const effectiveLimit = limit === null || limit === undefined ? null : limit;
  const limitIndex = invoiceDate.nextIndex;

  const { rows } = await query(
    `
    SELECT
      sii.product_id,
      COALESCE(p.name, sii.product_name, 'Unknown') AS name,
      COALESCE(SUM(sii.quantity), 0) AS quantity,
      COALESCE(SUM(sii.total), 0) AS revenue,
      COALESCE(SUM(sii.quantity * sii.buying_price), 0) AS cost,
      COALESCE(SUM(sii.total), 0) - COALESCE(SUM(sii.quantity * sii.buying_price), 0) AS margin
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    LEFT JOIN products p ON p.id = sii.product_id
    WHERE 1=1 ${invoiceDate.clause}
    GROUP BY sii.product_id, p.name, sii.product_name
    ORDER BY revenue DESC
    LIMIT $${limitIndex}
    `,
    [...invoiceDate.params, effectiveLimit],
  );

  return rows.map((row) => {
    const revenue = Number(row.revenue);
    const margin = Number(row.margin);
    return {
      ...row,
      quantity: Number(row.quantity),
      revenue,
      cost: Number(row.cost),
      margin,
      marginPercent: revenue > 0 ? (margin / revenue) * 100 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
export async function getSalesByCustomer(
  query,
  { startDate, endDate, limit = 20 } = {},
) {
  const invoiceDate = buildDateRangeFilter("date", startDate, endDate, 1);
  const effectiveLimit = limit === null || limit === undefined ? null : limit;
  const limitIndex = invoiceDate.nextIndex;

  const { rows } = await query(
    `
    SELECT
      si.customer_id,
      COALESCE(c.name, 'Unknown') AS name,
      COUNT(*) AS "invoiceCount",
      COALESCE(SUM(si.net_total), 0) AS "totalPurchased",
      COALESCE(SUM(si.net_total), 0) / COUNT(*) AS "averageOrderValue"
    FROM sales_invoices si
    LEFT JOIN customers c ON c.id = si.customer_id
    WHERE 1=1 ${invoiceDate.clause}
    GROUP BY si.customer_id, c.name
    ORDER BY "totalPurchased" DESC
    LIMIT $${limitIndex}
    `,
    [...invoiceDate.params, effectiveLimit],
  );

  return rows.map((row) => ({
    ...row,
    invoiceCount: Number(row.invoiceCount),
    totalPurchased: Number(row.totalPurchased),
    averageOrderValue: Number(row.averageOrderValue),
  }));
}

// ---------------------------------------------------------------------------
export async function getSalesTrend(query, { startDate, endDate } = {}) {
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
    effectiveEnd,
  );

  const { rows } = await query(
    `
    ${cte}
    SELECT
      buckets.bucket::text AS bucket,
      COALESCE(SUM(si.net_total), 0) AS sales
    FROM buckets
    LEFT JOIN sales_invoices si ON ${matchExpr("si.date")} = buckets.bucket
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
    `,
    params,
  );

  return {
    groupBy,
    series: rows.map((r) => ({ ...r, sales: Number(r.sales) })),
  };
}
