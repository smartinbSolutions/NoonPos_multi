import React from "react";
import { useTranslation } from "react-i18next";
import {
  Calendar,
  ShoppingCart,
  ReceiptText,
  Users,
  TrendingUp,
  Printer,
} from "lucide-react";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import GoTo from "../../../Global/GoTo";
import useSalesReport, { SALES_REPORT_PRESETS } from "../hook/useSalesReport";

// Same LTR-figure helper used across Dashboard.jsx / ProfitLossReport.jsx —
// keeps numbers from getting bidi-reordered inside the RTL page.
const Num = ({ children, className = "" }) => (
  <span dir="ltr" className={`font-mono tabular-nums ${className}`}>
    {children}
  </span>
);

const SummaryTile = ({ icon: Icon, label, value }) => (
  <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-[0_12px_40px_rgba(70,99,255,0.08)]">
    <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
      <Icon size={13} className="text-[#4663ff]" />
      {label}
    </div>
    <Num className="text-xl font-black text-slate-900">{value}</Num>
  </div>
);

const SingleLineTrendChart = ({
  series,
  groupBy,
  formatBucketLabel,
  money,
}) => {
  const W = 1000;
  const H = 220;
  const padding = { top: 16, right: 24, bottom: 32, left: 64 };
  const plotWidth = W - padding.left - padding.right;
  const plotHeight = H - padding.top - padding.bottom;

  const values = series.map((r) => r.sales);
  const yMax = Math.max(...values, 0);
  const yMin = 0; // sales revenue never goes negative — no need for a zero line

  const scaleY = (v) =>
    padding.top + plotHeight - ((v - yMin) / (yMax - yMin || 1)) * plotHeight;
  const scaleX = (i) =>
    padding.left +
    (series.length > 1 ? (i / (series.length - 1)) * plotWidth : plotWidth / 2);

  const path = series
    .map((row, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(row.sales)}`)
    .join(" ");

  const labelEvery = Math.max(1, Math.ceil(series.length / 7));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-56 w-full"
      preserveAspectRatio="none"
      direction="ltr"
    >
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
        y1={padding.top + plotHeight}
        y2={padding.top + plotHeight}
        stroke="#eef3ff"
      />

      <text
        x={4}
        y={padding.top + 4}
        direction="ltr"
        className="fill-slate-400 text-[10px] font-semibold"
      >
        {money(yMax)}
      </text>
      <text
        x={4}
        y={padding.top + plotHeight + 4}
        direction="ltr"
        className="fill-slate-400 text-[10px] font-semibold"
      >
        {money(0)}
      </text>

      <path
        d={path}
        fill="none"
        stroke="#10b981"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {series.map((row, i) => (
        <circle
          key={row.bucket}
          cx={scaleX(i)}
          cy={scaleY(row.sales)}
          r={4}
          fill="#10b981"
        >
          <title>{`${formatBucketLabel(row.bucket, groupBy)}: ${money(row.sales)}`}</title>
        </circle>
      ))}

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

export default function SalesReport() {
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
    showAllProducts,
    setShowAllProducts,
    showAllCustomers,
    setShowAllCustomers,
    data,
    loading,
    error,
  } = useSalesReport();

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

  const byProduct = data?.byProduct || [];
  const byCustomer = data?.byCustomer || [];
  const trendSeries = data?.trend?.series || [];
  const groupBy = data?.trend?.groupBy || "day";

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* HEADER */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-[#4663ff]">
            {t("reports.eyebrow", "Reports")}
          </p>
          <h1 className="text-4xl font-black leading-tight text-slate-950">
            {t("reports.salesTitle", "Sales report")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t(
              "reports.salesSubtitle",
              "What sold, who bought it, and how much you made — for the period you choose."
            )}
          </p>
        </div>

        {/* DATE RANGE CONTROL — identical pattern to ProfitLossReport */}
        <section className="flex flex-wrap items-center gap-3 rounded-[24px] border border-white/80 bg-white/80 p-3 shadow-[0_18px_60px_rgba(70,99,255,0.10)] backdrop-blur">
          <div className="flex flex-wrap gap-1.5 rounded-2xl border border-[#e5ebff] bg-[#f8faff] p-1.5">
            {SALES_REPORT_PRESETS.map((p) => (
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

          <div className="flex flex-wrap items-center gap-2 text-sm">
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
              `screens.errors.${error}`,
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
            {/* SUMMARY STRIP */}
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryTile
                icon={ShoppingCart}
                label={t("reports.netSales", "Net sales")}
                value={money(data.summary.netSales)}
              />
              <SummaryTile
                icon={ReceiptText}
                label={t("reports.invoiceCount", "Invoices")}
                value={data.summary.invoiceCount}
              />
              <SummaryTile
                icon={TrendingUp}
                label={t("reports.avgInvoiceValue", "Avg invoice value")}
                value={money(data.summary.averageInvoiceValue)}
              />
              <SummaryTile
                icon={ReceiptText}
                label={t("reports.returnsTotal", "Returns")}
                value={money(data.summary.returnsTotal)}
              />
            </section>

            {/* TREND */}
            <section className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
              <h2 className="mb-5 text-lg font-black text-slate-900">
                {t("reports.salesTrend", "Sales over time")}
              </h2>
              {trendSeries.length ? (
                <SingleLineTrendChart
                  series={trendSeries}
                  groupBy={groupBy}
                  formatBucketLabel={formatBucketLabel}
                  money={money}
                />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                  {t("reports.noTrendData", "No activity in this range.")}
                </div>
              )}
            </section>

            {/* BY PRODUCT — margin included, "Show all" toggle */}
            <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/85 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
              <div className="flex items-center justify-between p-6 pb-4">
                <h2 className="text-lg font-black text-slate-900">
                  {t("reports.salesByProduct", "Sales by product")}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAllProducts((v) => !v)}
                    className="rounded-xl border border-[#e5ebff] bg-[#f8faff] px-3 py-1.5 text-xs font-bold text-[#4663ff] transition hover:bg-[#eef3ff]"
                  >
                    {showAllProducts
                      ? t("reports.showTop20", "Show top 20")
                      : t("reports.showAll", "Show all")}
                  </button>
                  <button
                    onClick={() =>
                      window.api.printDocument(
                        `/print-sales-by-product?startDate=${startDate}&endDate=${endDate}&showAll=${showAllProducts}`
                      )
                    }
                    className="rounded-xl border border-[#e5ebff] bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-[#f8faff]"
                  >
                    <Printer size={14} className="inline -mt-0.5 me-1" />
                    {t("common.print", "Print")}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-[#f8faff] text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">
                        {t("ui.product", "Product")}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {t("ui.quantity", "Qty")}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {t("dashboard.revenue", "Revenue")}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {t("reports.cost", "Cost")}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {t("reports.margin", "Margin")}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {t("reports.marginPercent", "Margin %")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5ebff]">
                    {byProduct.length === 0 ? (
                      <tr>
                        <td
                          colSpan="6"
                          className="p-8 text-center text-slate-400"
                        >
                          {t(
                            "reports.noProductData",
                            "No sales in this range."
                          )}
                        </td>
                      </tr>
                    ) : (
                      byProduct.map((row) => (
                        <tr key={row.product_id} className="hover:bg-[#f8faff]">
                          <td className="px-4 py-3 font-bold text-slate-700">
                            {row.name}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Num>{row.quantity}</Num>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Num className="font-semibold text-slate-700">
                              {money(row.revenue)}
                            </Num>
                          </td>
                          <td className="px-4 py-3 text-center text-rose-500">
                            <Num>{money(row.cost)}</Num>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-emerald-700">
                            <Num>{money(row.margin)}</Num>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`rounded-lg px-2 py-1 text-xs font-bold ${
                                row.marginPercent >= 30
                                  ? "bg-emerald-50 text-emerald-600"
                                  : row.marginPercent >= 10
                                    ? "bg-amber-50 text-amber-600"
                                    : "bg-rose-50 text-rose-600"
                              }`}
                            >
                              <Num>{row.marginPercent.toFixed(1)}%</Num>
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* BY CUSTOMER — same "Show all" pattern */}
            <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/85 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
              <div className="flex items-center justify-between p-6 pb-4">
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <Users size={18} className="text-[#4663ff]" />
                  {t("reports.salesByCustomer", "Sales by customer")}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAllCustomers((v) => !v)}
                    className="rounded-xl border border-[#e5ebff] bg-[#f8faff] px-3 py-1.5 text-xs font-bold text-[#4663ff] transition hover:bg-[#eef3ff]"
                  >
                    {showAllCustomers
                      ? t("reports.showTop20", "Show top 20")
                      : t("reports.showAll", "Show all")}
                  </button>
                  <button
                    onClick={() =>
                      window.api.printDocument(
                        `/print-sales-by-customer?startDate=${startDate}&endDate=${endDate}&showAll=${showAllCustomers}`
                      )
                    }
                    className="rounded-xl border border-[#e5ebff] bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-[#f8faff]"
                  >
                    <Printer size={14} className="inline -mt-0.5 me-1" />
                    {t("common.print", "Print")}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="bg-[#f8faff] text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">
                        {t("ui.customer", "Customer")}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {t("ui.invoices", "Invoices")}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {t("reports.totalPurchased", "Total purchased")}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {t("reports.avgOrderValue", "Avg order value")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5ebff]">
                    {byCustomer.length === 0 ? (
                      <tr>
                        <td
                          colSpan="4"
                          className="p-8 text-center text-slate-400"
                        >
                          {t(
                            "reports.noCustomerData",
                            "No sales in this range."
                          )}
                        </td>
                      </tr>
                    ) : (
                      byCustomer.map((row) => (
                        <tr
                          key={row.customer_id ?? row.name}
                          className="hover:bg-[#f8faff]"
                        >
                          <td className="px-4 py-3">
                            {row.customer_id ? (
                              <GoTo type="customer" id={row.customer_id}>
                                {row.name}
                              </GoTo>
                            ) : (
                              <span className="font-bold text-slate-700">
                                {row.name}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Num>{row.invoiceCount}</Num>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-900">
                            <Num>{money(row.totalPurchased)}</Num>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-500">
                            <Num>{money(row.averageOrderValue)}</Num>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
