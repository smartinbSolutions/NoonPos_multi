import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import usePrimaryCurrency from "../Global/usePrimaryCurrency";
import { formatMoney } from "../Global/FormatNumber";

import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ShoppingCart,
  ReceiptText,
  Boxes,
  Users,
  AlertTriangle,
  PlusCircle,
  HandCoins,
  ArrowRightLeft,
  Landmark,
  Package,
  Sparkles,
} from "lucide-react";

const emptyStats = {
  sales: {
    total: 0,
    today: 0,
    count: 0,
    trend: [],
    paid: 0,
    partial: 0,
    unpaid: 0,
  },
  purchase: {
    total: 0,
    today: 0,
    count: 0,
    trend: [],
    paid: 0,
    partial: 0,
    unpaid: 0,
  },
  expense: {
    total: 0,
    today: 0,
    count: 0,
    trend: [],
    paid: 0,
    partial: 0,
    unpaid: 0,
  },
  profitLoss: { cogs: 0, grossProfit: 0, netProfit: 0 },
  cashFlow: {
    operating: { income: 0, expense: 0, net: 0 },
    financing: { income: 0, expense: 0, net: 0 },
    totalIncome: 0,
    totalExpense: 0,
    net: 0,
  },
  topProducts: { byQuantity: [], byRevenue: [] },
  topExpenseCategories: [],
  fundBalances: [],
  products: 0,
  customers: 0,
  inventoryValue: 0,
  minimumStock: 0,
  isInventoryLow: false,
};

const MODULE_META = {
  sales: { icon: ShoppingCart, tone: "emerald" },
  purchase: { icon: Boxes, tone: "blue" },
  expense: { icon: ReceiptText, tone: "rose" },
};

const TONE_CLASSES = {
  emerald: {
    text: "text-emerald-700",
    bg: "bg-emerald-500",
    soft: "bg-emerald-50",
    iconBg: "bg-emerald-100",
  },
  blue: {
    text: "text-[#4663ff]",
    bg: "bg-[#4663ff]",
    soft: "bg-[#eef3ff]",
    iconBg: "bg-[#e5ebff]",
  },
  rose: {
    text: "text-rose-600",
    bg: "bg-rose-500",
    soft: "bg-rose-50",
    iconBg: "bg-rose-100",
  },
};

// Wrap any numeric/money value in this — forces LTR digit order and
// monospace figures regardless of the surrounding page direction, so
// grouping separators and currency symbols never get bidi-reordered.
const Num = ({ children, className = "" }) => (
  <span dir="ltr" className={`font-mono tabular-nums ${className}`}>
    {children}
  </span>
);

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { money, primaryCurrency } = usePrimaryCurrency();

  const [data, setData] = useState(emptyStats);
  const [loading, setLoading] = useState(true);
  const [productView, setProductView] = useState("byQuantity");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await window.api.getDashboardStats();

        setData((current) => ({ ...current, ...(res || {}) }));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatDay = (value) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      day: "2-digit",
    }).format(new Date(`${value}T00:00:00`));

  const quickActions = [
    {
      key: "sale",
      label: t("dashboard.new_sale", "New Sale"),
      icon: ShoppingCart,
      tone: "emerald",
      to: "/add-sales",
    },
    {
      key: "purchase",
      label: t("dashboard.new_purchase", "New Purchase"),
      icon: Boxes,
      tone: "blue",
      to: "/add-purchase",
    },
    {
      key: "expense",
      label: t("dashboard.new_expense", "New Expense"),
      icon: ReceiptText,
      tone: "rose",
      to: "/add-expense",
    },
    {
      key: "payment",
      label: t("navigation.payment", "Payments"),
      icon: Wallet,
      tone: "blue",
      to: "/payments",
    },
    {
      key: "transfer",
      label: t("navigation.transfers", "Transfer Funds"),
      icon: ArrowRightLeft,
      tone: "blue",
      to: "/fundTransfer",
    },
  ];

  const topProductsList = data.topProducts?.[productView] || [];
  const topProductMax = Math.max(
    1,
    ...topProductsList.map((p) =>
      Number(productView === "byQuantity" ? p.quantity : p.revenue || 0)
    )
  );

  const totalFundBalancePrimary = useMemo(
    () =>
      data.fundBalances.reduce((sum, f) => {
        const rate = Number(f.exchange_rate) || 1;
        const balanceInPrimary = Number(f.balance || 0) / rate;
        return sum + balanceInPrimary;
      }, 0),
    [data.fundBalances]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6">
        <div className="text-slate-500">{t("dashboard.loading")}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* HEADER */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase  text-[#4663ff]">
            {t("dashboard.overview", "Overview")}
          </p>
          <h1 className="text-4xl font-black leading-tight text-slate-950">
            {t("dashboard.dashboard", "Dashboard")}
          </h1>
        </div>

        {/* AT A GLANCE — the four numbers that matter most, before anything else */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-[0_12px_40px_rgba(70,99,255,0.08)]">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase  text-slate-400">
              <Sparkles size={13} className="text-[#4663ff]" />
              {t("dashboard.net_profit", "Net profit")}
            </div>
            <Num
              className={`text-xl font-black ${
                data.profitLoss.netProfit >= 0
                  ? "text-emerald-700"
                  : "text-rose-600"
              }`}
            >
              {money(data.profitLoss.profitLoss.netProfit)}
            </Num>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-[0_12px_40px_rgba(70,99,255,0.08)]">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
              <ArrowRightLeft size={13} className="text-[#4663ff]" />
              {t("dashboard.net_cash_movement", "Net cash movement")}
            </div>
            <Num
              className={`text-xl font-black ${
                data.cashFlow.net >= 0 ? "text-emerald-700" : "text-rose-600"
              }`}
            >
              {money(data.cashFlow.net)}
            </Num>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-[0_12px_40px_rgba(70,99,255,0.08)]">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase  text-slate-400">
              <Landmark size={13} className="text-[#4663ff]" />
              {t("dashboard.total_fund_balance", "Total fund balance")}
            </div>
            <Num className="text-xl font-black text-slate-900">
              {money(totalFundBalancePrimary)}
            </Num>
            <div className="text-xs font-medium text-slate-400">
              {t("dashboard.approx_total", "≈ تقريبي")}
            </div>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-[0_12px_40px_rgba(70,99,255,0.08)]">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase  text-slate-400">
              <Wallet size={13} className="text-[#4663ff]" />
              {t("dashboard.inventoryValue", "Inventory Value")}
            </div>
            <Num className="text-xl font-black text-slate-900">
              {money(data.inventoryValue)}
            </Num>
            {data.isInventoryLow > 0 && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-600">
                <AlertTriangle size={11} />
                {t(
                  "dashboard.inventoryBelowThreshold",
                  "Below your {{threshold}} threshold",
                  { threshold: money(data.minimumStock) }
                )}
              </p>
            )}
          </div>
        </section>

        {/* QUICK ACTION BAR */}
        <section className="overflow-x-auto rounded-[24px] border border-white/80 bg-white/80 p-3 shadow-[0_18px_60px_rgba(70,99,255,0.10)] backdrop-blur">
          <div className="flex min-w-max gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              const tone = TONE_CLASSES[action.tone];
              return (
                <button
                  key={action.key}
                  onClick={() => navigate(action.to)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-2xl border border-[#e5ebff] ${tone.soft} px-4 py-3 text-sm font-bold ${tone.text} transition hover:brightness-95`}
                >
                  <Icon size={16} />
                  {action.label}
                  <PlusCircle size={14} className="opacity-50" />
                </button>
              );
            })}
          </div>
        </section>

        {/* MODULE TRIO: sales / purchase / expense */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {["sales", "purchase", "expense"].map((key) => {
            const stat = data[key];
            const meta = MODULE_META[key];
            const tone = TONE_CLASSES[meta.tone];
            const Icon = meta.icon;
            const statusTotal = Math.max(
              1,
              stat.paid + stat.partial + stat.unpaid
            );
            const maxTrend = Math.max(
              1,
              ...stat.trend.map((d) => Number(d.total || 0))
            );
            const displayTotal = stat.returns ? stat.netTotal : stat.total;
            const hasReturns = stat.returns && stat.returns.total > 0;

            return (
              <div
                key={key}
                className="flex flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/85 shadow-[0_18px_60px_rgba(70,99,255,0.10)]"
              >
                <div className="flex items-start justify-between p-5 pb-3">
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase  text-slate-400">
                      {t(`dashboard.${key}`, key)}
                    </p>
                    <Num className={`text-2xl font-black ${tone.text}`}>
                      {money(displayTotal)}
                    </Num>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      {t("dashboard.today", "Today")}:{" "}
                      <Num className="text-slate-600">{money(stat.today)}</Num>
                    </p>
                  </div>
                  <div className={`rounded-2xl ${tone.iconBg} p-3`}>
                    <Icon size={20} className={tone.text} />
                  </div>
                </div>

                {hasReturns && (
                  <div className="mx-5 mb-1 flex items-center justify-between rounded-xl bg-rose-50 px-3 py-2 text-xs">
                    <span className="text-rose-600">
                      {t("ui.returns", "Returns")}
                      <span className="ms-1 text-rose-400">
                        ({stat.returns.count})
                      </span>
                    </span>
                    <Num className="font-bold text-rose-600">
                      -{money(stat.returns.total)}
                    </Num>
                  </div>
                )}

                <div className="flex h-14 items-end gap-1 px-5">
                  {stat.trend.map((d) => (
                    <div key={d.day} className="flex-1">
                      <div
                        className={`w-full rounded-t ${tone.bg} opacity-80`}
                        style={{
                          height: `${Math.max(6, (Number(d.total || 0) / maxTrend) * 100)}%`,
                        }}
                        title={`${formatDay(d.day)}: ${money(d.total)}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-2 p-5 pt-3">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${(stat.paid / statusTotal) * 100}%` }}
                    />
                    <div
                      className="h-full bg-amber-400"
                      style={{
                        width: `${(stat.partial / statusTotal) * 100}%`,
                      }}
                    />
                    <div
                      className="h-full bg-slate-300"
                      style={{ width: `${(stat.unpaid / statusTotal) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                    <span>
                      {t("dashboard.paid", "Paid")} <Num>{stat.paid}</Num>
                    </span>
                    <span>
                      {t("dashboard.partial", "Partial")}{" "}
                      <Num>{stat.partial}</Num>
                    </span>
                    <span>
                      {t("dashboard.unpaid", "Unpaid")} <Num>{stat.unpaid}</Num>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* PROFIT & LOSS + CASH FLOW */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
            <h2 className="mb-5 text-lg font-black text-slate-900">
              {t("dashboard.profit_loss", "الأرباح والخسائر")}
            </h2>
            <div className="space-y-3 text-sm">
              {/* Revenue */}
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">
                  {t("dashboard.revenue", "الإيرادات")}
                </span>
                <Num className="font-bold text-slate-900">
                  {money(data.profitLoss.sales.total)}
                </Num>
              </div>

              {data.profitLoss.sales.returns > 0 && (
                <div className="ms-3 space-y-2 border-s-2 border-slate-100 ps-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {t("dashboard.from_sales", "من المبيعات")}
                    </span>
                    <Num className="font-semibold text-slate-500">
                      {money(data.profitLoss.sales.gross)}
                    </Num>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {t("dashboard.less_returns", "بعد خصم المرتجعات")}
                      <span className="ms-1 text-slate-300">
                        ({data.profitLoss.sales.returnCount})
                      </span>
                    </span>
                    <Num className="font-semibold text-rose-500">
                      -{money(data.profitLoss.sales.returns)}
                    </Num>
                  </div>
                </div>
              )}

              {/* Cost of goods */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-500">
                  {t("dashboard.cost_of_goods_sold", "تكلفة البضائع المباعة")}
                </span>
                <Num className="font-bold text-rose-600">
                  -{money(data.profitLoss.profitLoss.cogs)}
                </Num>
              </div>

              {data.profitLoss.profitLoss.cogsReturned > 0 && (
                <div className="ms-3 flex items-center justify-between border-s-2 border-slate-100 ps-3 text-xs">
                  <span className="text-slate-400">
                    {t(
                      "dashboard.cogs_note",
                      "تكلفة البضائع التي رجعت للمخزون تم خصمها تلقائيًا"
                    )}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
                <span className="font-bold text-slate-700">
                  {t("dashboard.gross_profit", "إجمالي الربح")}
                </span>
                <Num className="font-bold text-slate-900">
                  {money(data.profitLoss.profitLoss.grossProfit)}
                </Num>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500">
                  {t("dashboard.expenses", "المصروفات")}
                </span>
                <Num className="font-bold text-rose-600">
                  -{money(data.profitLoss.expense.total)}
                </Num>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-[#f8faff] px-4 py-3">
                <span className="font-black text-slate-900">
                  {t("dashboard.net_profit", "صافي الربح")}
                </span>
                <Num
                  className={`text-lg font-black ${data.profitLoss.profitLoss.netProfit >= 0 ? "text-emerald-700" : "text-rose-600"}`}
                >
                  {money(data.profitLoss.profitLoss.netProfit)}
                </Num>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
            <h2 className="mb-5 text-lg font-black text-slate-900">
              {t("dashboard.cashFlow", "Cash Flow")}
            </h2>

            <div className="mb-4">
              <p className="mb-2.5 text-xs font-bold uppercase text-slate-400">
                {t("dashboard.operating", "Operating")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3.5">
                  <TrendingUp size={16} className="mb-2 text-emerald-600" />
                  <Num className="text-base font-black text-emerald-700">
                    {money(data.cashFlow.operating.income)}
                  </Num>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {t("dashboard.income", "Income")}
                  </div>
                </div>
                <div className="rounded-2xl bg-rose-50 p-3.5">
                  <TrendingDown size={16} className="mb-2 text-rose-500" />
                  <Num className="text-base font-black text-rose-600">
                    {money(data.cashFlow.operating.expense)}
                  </Num>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {t("dashboard.expense", "Expense")}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <p className="mb-2.5 text-xs font-bold uppercase  text-slate-400">
                {t("dashboard.financing", "Financing (Partners)")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#eef3ff] p-3.5">
                  <TrendingUp size={16} className="mb-2 text-[#4663ff]" />
                  <Num className="text-base font-black text-[#4663ff]">
                    {money(data.cashFlow.financing.income)}
                  </Num>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {t("dashboard.deposits", "Deposits")}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-100 p-3.5">
                  <TrendingDown size={16} className="mb-2 text-slate-500" />
                  <Num className="text-base font-black text-slate-600">
                    {money(data.cashFlow.financing.expense)}
                  </Num>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {t("dashboard.withdrawals", "Withdrawals")}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-[#f8faff] px-4 py-3">
              <span className="text-sm font-bold text-slate-700">
                {t("dashboard.net_cash_movement", "Net cash movement")}
              </span>
              <Num
                className={`text-lg font-black ${data.cashFlow.net >= 0 ? "text-emerald-700" : "text-rose-600"}`}
              >
                {money(data.cashFlow.net)}
              </Num>
            </div>
          </div>
        </section>

        {/* FUND BALANCES */}
        <section className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-black text-slate-900">
            <Landmark size={18} className="text-[#4663ff]" />
            {t("dashboard.fund_balances", "Fund Balances")}
          </h2>
          {data.fundBalances.length ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {data.fundBalances.map((fund) => (
                <div
                  key={fund.id}
                  className="min-w-[180px] flex-1 rounded-2xl border border-[#e5ebff] bg-[#f8faff] p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-700">
                      {fund.name}
                    </span>
                    <span className="rounded-lg bg-white px-2 py-0.5 text-[10px] font-bold text-slate-400">
                      {fund.currency_code}
                    </span>
                  </div>
                  <Num
                    className={`text-xl font-black ${fund.balance >= 0 ? "text-slate-900" : "text-rose-600"}`}
                  >
                    {formatMoney(
                      fund.balance,
                      fund.currency_code,
                      fund.currency_symbol
                    )}
                  </Num>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-400">
              {t("dashboard.noFunds", "No funds yet.")}
            </div>
          )}
        </section>

        {/* TOP PRODUCTS + TOP EXPENSE CATEGORIES — equal weight, side by side */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">
                {t("dashboard.topProducts", "Top Products")}
              </h2>
              <div className="flex rounded-xl border border-[#e5ebff] bg-[#f8faff] p-1 text-xs font-bold">
                <button
                  onClick={() => setProductView("byQuantity")}
                  className={`rounded-lg px-3 py-1.5 transition ${productView === "byQuantity" ? "bg-white text-[#4663ff] shadow" : "text-slate-500"}`}
                >
                  {t("dashboard.by_quantity", "By quantity")}
                </button>
                <button
                  onClick={() => setProductView("byRevenue")}
                  className={`rounded-lg px-3 py-1.5 transition ${productView === "byRevenue" ? "bg-white text-[#4663ff] shadow" : "text-slate-500"}`}
                >
                  {t("dashboard.by_revenue", "By revenue")}
                </button>
              </div>
            </div>

            {topProductsList.length ? (
              <div className="space-y-4">
                {topProductsList.map((product) => {
                  const value =
                    productView === "byQuantity"
                      ? product.quantity
                      : product.revenue;
                  return (
                    <div key={product.product_id}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-bold text-slate-700">
                          {product.name}
                        </span>
                        <Num className="shrink-0 text-slate-500">
                          {productView === "byQuantity"
                            ? Number(value || 0)
                            : money(value)}
                        </Num>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-[#4663ff]"
                          style={{
                            width: `${(Number(value || 0) / topProductMax) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                {t("dashboard.noSalesData")}
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
            <h2 className="mb-5 text-lg font-black text-slate-900">
              {t("dashboard.topExpenseCategories", "Top Expense Categories")}
            </h2>

            {data.topExpenseCategories.length ? (
              <div className="space-y-4">
                {(() => {
                  const maxSpent = Math.max(
                    1,
                    ...data.topExpenseCategories.map((c) =>
                      Number(c.total_spent || 0)
                    )
                  );
                  return data.topExpenseCategories.map((cat) => (
                    <div key={cat.category_id}>
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
                            width: `${(Number(cat.total_spent || 0) / maxSpent) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                {t("dashboard.noExpenseData", "No expense data yet.")}
              </div>
            )}
          </div>
        </section>

        {/* CATALOG SNAPSHOT — compact horizontal strip instead of a stacked column */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/85 p-4 shadow-[0_12px_40px_rgba(70,99,255,0.08)]">
            <div>
              <p className="text-xs font-bold uppercase  text-slate-400">
                {t("dashboard.products", "Products")}
              </p>
              <Num className="text-xl font-black text-slate-900">
                {data.products}
              </Num>
            </div>
            <div className="rounded-xl bg-[#e5ebff] p-2.5">
              <Package size={18} className="text-[#4663ff]" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/85 p-4 shadow-[0_12px_40px_rgba(70,99,255,0.08)]">
            <div>
              <p className="text-xs font-bold uppercase  text-slate-400">
                {t("dashboard.customers", "Customers")}
              </p>
              <Num className="text-xl font-black text-slate-900">
                {data.customers}
              </Num>
            </div>
            <div className="rounded-xl bg-[#e5ebff] p-2.5">
              <Users size={18} className="text-[#4663ff]" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
