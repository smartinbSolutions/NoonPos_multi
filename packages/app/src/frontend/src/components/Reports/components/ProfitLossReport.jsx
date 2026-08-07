import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  ReceiptText,
  Wallet,
  Sparkles,
  Download,
  Printer,
} from "lucide-react";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import useProfitLossReport, {
  REPORT_PRESETS,
} from "../hook/useProfitLossReport";

// Same helper as Dashboard.jsx — forces LTR digit order + monospace figures
// so money/number values never get bidi-reordered inside an RTL page.
const Num = ({ children, className = "" }) => (
  <span dir="ltr" className={`font-mono tabular-nums ${className}`}>
    {children}
  </span>
);

const ChangeBadge = ({ value, invert = false, t }) => {
  if (value === null || value === undefined) {
    return (
      <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-400">
        {t("reports.newActivity", "New")}
      </span>
    );
  }

  const isIncrease = value >= 0;
  const isFavorable = invert ? !isIncrease : isIncrease;
  const Icon = isIncrease ? TrendingUp : TrendingDown;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${
        isFavorable
          ? "bg-emerald-50 text-emerald-600"
          : "bg-rose-50 text-rose-600"
      }`}
    >
      <Icon size={12} />
      <Num>{Math.abs(value).toFixed(1)}%</Num>
    </span>
  );
};

const ComparisonCard = ({
  icon: Icon,
  label,
  currentValue,
  previousValue,
  changeValue,
  invert,
  t,
}) => (
  <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-[0_12px_40px_rgba(70,99,255,0.08)]">
    <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
      <Icon size={13} className="text-[#4663ff]" />
      {label}
    </div>
    <Num className="text-xl font-black text-slate-900">{currentValue}</Num>
    <div className="mt-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-slate-400">
        {t("reports.previous", "Previous")}:{" "}
        <Num className="text-slate-500">{previousValue}</Num>
      </span>
      <ChangeBadge value={changeValue} invert={invert} t={t} />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// TrendChart — line chart for sales / expense / net profit over time.
const TrendChart = ({ series, groupBy, formatBucketLabel, money, t }) => {
  const W = 1000;
  const H = 280;
  const padding = { top: 16, right: 24, bottom: 32, left: 64 };
  const plotWidth = W - padding.left - padding.right;
  const plotHeight = H - padding.top - padding.bottom;

  // Shared y-domain across all three series so lines are visually
  // comparable — a bigger revenue swing should look bigger than a small
  // expense swing, not be silently rescaled per-line.
  const allValues = series.flatMap((r) => [r.sales, r.expense, r.netProfit]);
  const yMax = Math.max(...allValues, 0);
  const yMin = Math.min(...allValues, 0);
  const yRange = yMax - yMin || 1;

  const scaleY = (v) =>
    padding.top + plotHeight - ((v - yMin) / yRange) * plotHeight;
  const scaleX = (i) =>
    padding.left +
    (series.length > 1 ? (i / (series.length - 1)) * plotWidth : plotWidth / 2);

  const zeroY = scaleY(0);

  const buildPath = (key) =>
    series
      .map(
        (row, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(row[key])}`
      )
      .join(" ");

  // Only label every Nth bucket on the x-axis — with 30 daily buckets,
  // printing every single date would overlap into an unreadable smear.
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));

  const lines = [
    { key: "sales", color: "#10b981" }, // emerald-500 — matches the legend dot
    { key: "expense", color: "#fb7185" }, // rose-400
    { key: "netProfit", color: "#4663ff" }, // brand blue
  ];

  return (
    // direction="ltr" here so the chart's x-axis reads chronologically
    // left-to-right regardless of the surrounding page's RTL direction —
    // the chart's own internal layout math (scaleX, textAnchor) assumes
    // LTR and shouldn't inherit the page's direction just because the
    // active locale is Arabic.
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-64 w-full"
      preserveAspectRatio="none"
      direction="ltr"
    >
      {/* Gridlines: top, zero (emphasized — this is the line that matters
              for reading whether net profit went positive or negative), bottom */}
      <line
        x1={padding.left}
        x2={W - padding.right}
        y1={padding.top}
        y2={padding.top}
        stroke="#eef3ff"
      />
      <line
        x1={padding.left}
        x2={W - padding.right}
        y1={zeroY}
        y2={zeroY}
        stroke="#cbd5e1"
        strokeDasharray="4 4"
      />
      <line
        x1={padding.left}
        x2={W - padding.right}
        y1={padding.top + plotHeight}
        y2={padding.top + plotHeight}
        stroke="#eef3ff"
      />

      {/* Y-axis labels — just three: top value, zero, bottom value. Enough
              to read scale at a glance without cluttering the chart. */}
      <text
        x={4}
        y={padding.top + 4}
        direction="ltr"
        className="fill-slate-400 text-[20px] font-semibold"
      >
        {money(yMax)}
      </text>
      <text
        x={4}
        y={zeroY + 4}
        direction="ltr"
        className="fill-slate-400 text-[20px] font-semibold"
      >
        {money(0)}
      </text>
      <text
        x={4}
        y={padding.top + plotHeight + 4}
        direction="ltr"
        className="fill-slate-400 text-[20px] font-semibold"
      >
        {money(yMin)}
      </text>

      {/* The three trend lines */}
      {lines.map(({ key, color }) => (
        <path
          key={key}
          d={buildPath(key)}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* Point markers + native tooltips on hover — same title-attribute
              pattern the old bar version used, just per-point instead of
              per-bucket-group. */}
      {series.map((row, i) => (
        <g key={row.bucket}>
          {lines.map(({ key, color }) => (
            <circle
              key={key}
              cx={scaleX(i)}
              cy={scaleY(row[key])}
              r={3}
              fill={color}
            >
              <title>
                {`${formatBucketLabel(row.bucket, groupBy)} — ${t(
                  `dashboard.${key === "sales" ? "revenue" : key === "expense" ? "expenses" : "net_profit"}`
                )}: ${money(row[key])}`}
              </title>
            </circle>
          ))}
        </g>
      ))}

      {/* X-axis labels — sparse, so dates never overlap. First/last labels
              are anchored inward (start/end instead of middle) so they don't
              extend past the viewBox edge and get clipped. */}
      {series.map((row, i) => {
        const isFirst = i === 0;
        const isLast = i === series.length - 1;
        if (!isFirst && !isLast && i % labelEvery !== 0) return null;

        return (
          <text
            key={row.bucket}
            x={scaleX(i)}
            y={H - 8}
            direction="ltr"
            textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
            className="fill-slate-400 text-[10px] font-semibold"
          >
            {formatBucketLabel(row.bucket, groupBy)}
          </text>
        );
      })}
    </svg>
  );
};

export default function ProfitLossReport() {
  const { t, i18n } = useTranslation();
  const { money } = usePrimaryCurrency();

  const {
    preset,
    setPreset,
    startDate,
    endDate,
    setCustomStartDate,
    setCustomEndDate,
    isRangeValid,
    data,
    loading,
    error,
  } = useProfitLossReport();

  // Add near the top of ProfitLossReport(), alongside other hook calls
  const [isPrinting, setIsPrinting] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);

  const printRoute = `/print-profit-loss?startDate=${startDate}&endDate=${endDate}`;

  const handlePrint = async () => {
    try {
      setIsPrinting(true);
      const res = await window.api.printDocument(printRoute);
      if (!res.success && res.error === "NO_PRINTER") {
        // reuse the same error key SalesList already relies on
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSavePdf = async () => {
    try {
      setSavingPdf(true);
      await window.api.saveDocumentPdf(
        printRoute,
        `profit-loss-${startDate}-to-${endDate}.pdf`
      );
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPdf(false);
    }
  };

  // Formats a trend bucket key ("2026-08-05" for daily, "2026-08" for
  // monthly) into a short label for the bar chart's x-axis / tooltips.
  // groupBy tells us which shape the key is in, since the backend picks
  // granularity automatically based on range length.
  const formatBucketLabel = (bucket, groupBy) => {
    if (groupBy === "month") {
      return new Intl.DateTimeFormat(i18n.language, {
        month: "short",
        year: "2-digit",
      }).format(new Date(`${bucket}-01T00:00:00`));
    }
    return new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      day: "2-digit",
    }).format(new Date(`${bucket}T00:00:00`));
  };

  const trendSeries = data?.trend?.series || [];
  const groupBy = data?.trend?.groupBy || "day";
  // Trend bars are scaled relative to whichever value is largest across the
  // whole series (sales tends to dwarf expense/cogs), so bars stay
  // comparable to each other instead of each metric using its own scale.
  const maxTrendValue = Math.max(
    1,
    ...trendSeries.map((row) => Math.max(row.sales, row.expense, row.cogs))
  );

  const expenseBreakdown = data?.expenseBreakdown || [];
  const maxExpenseCategory = Math.max(
    1,
    ...expenseBreakdown.map((row) => Number(row.total_spent || 0))
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* HEADER */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-[#4663ff]">
            {t("reports.eyebrow", "Reports")}
          </p>
          <h1 className="text-4xl font-black leading-tight text-slate-950">
            {t("reports.profitLossTitle", "Profit & loss")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t(
              "reports.profitLossSubtitle",
              "Revenue, cost, and profit for the period you choose, compared to the period before it."
            )}
          </p>
        </div>

        {/* DATE RANGE CONTROL — presets + a custom fallback, per your call */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/80 bg-white/80 p-3 shadow-[0_18px_60px_rgba(70,99,255,0.10)] backdrop-blur">
          <div className="flex">
            <div className="flex flex-wrap gap-1.5 rounded-2xl border border-[#e5ebff] bg-[#f8faff] p-1.5">
              {REPORT_PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    preset === p.key
                      ? "bg-[#4663ff] text-white shadow"
                      : "text-slate-500 hover:bg-white"
                  }`}
                >
                  {t(p.labelKey, p.key)}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm mx-2">
              <Calendar size={15} className="text-slate-400" />
              <input
                type="date"
                dir="ltr"
                value={startDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-9 rounded-xl border border-[#e9edfb] bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10"
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                dir="ltr"
                value={endDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-9 rounded-xl border border-[#e9edfb] bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center gap-2 rounded-2xl border border-[#e9edfb] bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-[#f8faff] disabled:opacity-50"
            >
              <Printer size={16} />
              {t("common.print", "Print")}
            </button>
            <button
              onClick={handleSavePdf}
              disabled={savingPdf}
              className="flex items-center gap-2 rounded-2xl border border-[#e9edfb] bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-[#f8faff] disabled:opacity-50"
            >
              <Download size={16} />
              {t("common.savePdf", "Save as PDF")}
            </button>
          </div>
        </section>

        {!isRangeValid && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            {t(
              "reports.invalidRange",
              "The end date must be on or after the start date."
            )}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {t(
              `errors.${error}`,
              t("reports.loadFailed", "Couldn't load the report.")
            )}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-slate-500">
            {t("common.loading")}
          </div>
        ) : data ? (
          <>
            <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/80 bg-white/70 px-4 py-3 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="h-2 w-2 rounded-full bg-[#4663ff]" />
                {t("reports.thisPeriod", "This period")}:{" "}
                <Num>{data.range.startDate}</Num> →{" "}
                <Num>{data.range.endDate}</Num>
              </span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                {t("reports.previousPeriod", "Previous period")}:{" "}
                <Num>{data.previousRange.startDate}</Num> →{" "}
                <Num>{data.previousRange.endDate}</Num>
              </span>
            </section>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ComparisonCard
                icon={Sparkles}
                label={t("reports.netProfit", "Net profit")}
                currentValue={money(data.current.profitLoss.netProfit)}
                previousValue={money(data.previous.profitLoss.netProfit)}
                changeValue={data.changePercent.netProfit}
                t={t}
              />
              <ComparisonCard
                icon={BarChart3}
                label={t("dashboard.revenue", "Revenue")}
                currentValue={money(data.current.sales.total)}
                previousValue={money(data.previous.sales.total)}
                changeValue={data.changePercent.salesTotal}
                t={t}
              />
              <ComparisonCard
                icon={Wallet}
                label={t("dashboard.gross_profit", "Gross profit")}
                currentValue={money(data.current.profitLoss.grossProfit)}
                previousValue={money(data.previous.profitLoss.grossProfit)}
                changeValue={data.changePercent.grossProfit}
                t={t}
              />
              <ComparisonCard
                icon={ReceiptText}
                label={t("dashboard.expenses", "Expenses")}
                currentValue={money(data.current.expense.total)}
                previousValue={money(data.previous.expense.total)}
                changeValue={data.changePercent.expenseTotal}
                invert
                t={t}
              />
            </section>

            {/* PREVIOUS-PERIOD CONTEXT — small strip stating exactly what
                "previous" means, since the comparison above is silent about
                which dates it's actually comparing against. */}
            <p className="text-xs font-medium text-slate-400">
              {t("reports.comparedTo", "Compared to")}{" "}
              <Num className="font-semibold text-slate-500">
                {data.previousRange.startDate}
              </Num>{" "}
              →{" "}
              <Num className="font-semibold text-slate-500">
                {data.previousRange.endDate}
              </Num>
            </p>

            {/* P&L BREAKDOWN + EXPENSE CATEGORIES side by side */}
            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Same layout language as Dashboard.jsx's P&L panel, but
                  scoped to the selected range instead of all-time. */}
              <div className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
                <h2 className="mb-5 text-lg font-black text-slate-900">
                  {t("dashboard.profit_loss", "Profit & loss")}
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">
                      {t("dashboard.revenue", "Revenue")}
                    </span>
                    <Num className="font-bold text-slate-900">
                      {money(data.current.sales.total)}
                    </Num>
                  </div>

                  {data.current.sales.returns > 0 && (
                    <div className="ms-3 space-y-2 border-s-2 border-slate-100 ps-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          {t("dashboard.from_sales", "From sales")}
                        </span>
                        <Num className="font-semibold text-slate-500">
                          {money(data.current.sales.gross)}
                        </Num>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          {t("dashboard.less_returns", "Less returns")}
                          <span className="ms-1 text-slate-300">
                            ({data.current.sales.returnCount})
                          </span>
                        </span>
                        <Num className="font-semibold text-rose-500">
                          -{money(data.current.sales.returns)}
                        </Num>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-500">
                      {t("dashboard.cost_of_goods_sold", "Cost of goods sold")}
                    </span>
                    <Num className="font-bold text-rose-600">
                      -{money(data.current.profitLoss.cogs)}
                    </Num>
                  </div>

                  <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
                    <span className="font-bold text-slate-700">
                      {t("dashboard.gross_profit", "Gross profit")}
                    </span>
                    <Num className="font-bold text-slate-900">
                      {money(data.current.profitLoss.grossProfit)}
                    </Num>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">
                      {t("dashboard.expenses", "Expenses")}
                    </span>
                    <Num className="font-bold text-rose-600">
                      -{money(data.current.expense.total)}
                    </Num>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl bg-[#f8faff] px-4 py-3">
                    <span className="font-black text-slate-900">
                      {t("dashboard.net_profit", "Net profit")}
                    </span>
                    <Num
                      className={`text-lg font-black ${
                        data.current.profitLoss.netProfit >= 0
                          ? "text-emerald-700"
                          : "text-rose-600"
                      }`}
                    >
                      {money(data.current.profitLoss.netProfit)}
                    </Num>
                  </div>
                </div>
              </div>

              {/* Expense categories — same bar-list style as the dashboard's
                  "Top expense categories" panel, but every category (no
                  LIMIT) since this is a report, not a glance-view widget. */}
              <div className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
                <h2 className="mb-5 text-lg font-black text-slate-900">
                  {t("reports.expenseByCategory", "Expenses by category")}
                </h2>

                {expenseBreakdown.length ? (
                  <div className="space-y-4">
                    {expenseBreakdown.map((cat) => (
                      <div key={cat.category_id ?? cat.name}>
                        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-bold text-slate-700">
                            {cat.name}
                          </span>
                          <Num className="shrink-0 text-slate-500">
                            {money(cat.total_spent)}
                          </Num>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full bg-rose-500"
                            style={{
                              width: `${
                                (Number(cat.total_spent || 0) /
                                  maxExpenseCategory) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                    {t("dashboard.noExpenseData", "No expense data yet.")}
                  </div>
                )}
              </div>
            </section>

            {/* TREND — sales vs expense vs net profit over each bucket in
                the range. Bar-chart language matches the module-trio trend
                bars on the dashboard, just with three series instead of one
                and a legend since there's now more than one color. */}
            <section className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-900">
                  {t("reports.trendOverTime", "Trend over time")}
                </h2>
                <div className="flex items-center gap-4 text-[11px] font-bold text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {t("dashboard.revenue", "Revenue")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-400" />
                    {t("dashboard.expenses", "Expenses")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#4663ff]" />
                    {t("dashboard.net_profit", "Net profit")}
                  </span>
                </div>
              </div>

              {trendSeries.length ? (
                <TrendChart
                  series={trendSeries}
                  groupBy={groupBy}
                  formatBucketLabel={formatBucketLabel}
                  money={money}
                  t={t}
                />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                  {t("reports.noTrendData", "No activity in this range.")}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
