import React from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Wallet, Receipt, CalendarDays, X } from "lucide-react";

import useExpenseCategoryItems from "../hooks/useExpenseCategoryItems";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import GoTo from "../../../Global/GoTo";
import Pagination from "../../../Global/Pagination";
import BackButton from "../../../Global/BackButton";

const ExpenseCategoryDetailPage = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const { money } = usePrimaryCurrency();

  const {
    items,
    category,
    loading,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    totalSpent,
    dateRange,
    updateDateRange,
    clearDateRange,
  } = useExpenseCategoryItems(id);

  const hasDateFilter = Boolean(dateRange.startDate || dateRange.endDate);

  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur overflow-hidden";

  // Group by calendar day — same convention as the other ledger pages
  const groupedByDay = items.reduce((acc, row) => {
    const key =
      (row.date || "").slice(0, 10) ||
      t("screens.ledger.unknownDate", "Unknown date");
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <main className="mx-auto max-w-6xl space-y-5">
        {/* HERO */}
        <section className={panelClass}>
          <div className="flex flex-col gap-5 p-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <BackButton size="lg" />
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase text-[#4663ff]">
                  <Receipt size={13} />
                  {t("screens.expensesCategory.categoryTitle")}
                </p>
                <h1 className="text-3xl font-black leading-tight text-slate-950">
                  {category?.name || t("ui.category")}
                </h1>
                {category?.latinName && (
                  <p className="mt-1 text-sm text-slate-500">
                    {category.latinName}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* NUMBERS STRIP */}
          <div className="grid grid-cols-1 gap-3 border-t border-[#e5ebff] bg-white/60 p-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#e5ebff] bg-[#f8faff] p-5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                <Receipt size={14} />
                {t("screens.expensesCategory.itemsCount")}
              </div>
              <div className="mt-2 text-2xl font-black tabular-nums text-slate-700">
                {total}
              </div>
            </div>

            <div className="rounded-2xl bg-[#1c2340] p-5 text-white">
              <div className="flex items-center gap-1.5 text-xs font-bold opacity-70">
                <Wallet size={14} />
                {t("screens.expensesCategory.totalSpent")}
              </div>
              <div className="mt-2 text-2xl font-black tabular-nums">
                {money(totalSpent)}
              </div>
            </div>
          </div>

          {/* DATE FILTER */}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#e5ebff] bg-white/60 px-6 py-4">
            <div className="flex items-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white px-3 py-2">
              <CalendarDays size={15} className="shrink-0 text-[#4663ff]" />
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => updateDateRange({ startDate: e.target.value })}
                className="bg-transparent text-sm text-slate-700 outline-none"
              />
              <span className="text-slate-300">–</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => updateDateRange({ endDate: e.target.value })}
                className="bg-transparent text-sm text-slate-700 outline-none"
              />
              {hasDateFilter && (
                <button
                  onClick={clearDateRange}
                  className="ml-1 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <span className="text-xs font-semibold text-slate-400">
              {t("screens.ledger.allTimeResults", { count: total })}
            </span>
          </div>
        </section>

        {/* ITEMS — grouped by day */}
        <section className={panelClass}>
          {loading ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-400">
              {t("common.loading")}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#4663ff]">
                <Receipt size={22} />
              </div>
              <p className="font-bold text-slate-600">
                {t(
                  "screens.expensesCategory.emptyItems",
                  "No expenses in this category yet"
                )}
              </p>
            </div>
          ) : (
            Object.entries(groupedByDay).map(([day, rows]) => (
              <div key={day}>
                <div className="sticky top-0 z-10 border-b border-[#e5ebff] bg-[#f8faff]/95 px-6 py-2.5 text-xs font-bold uppercase text-slate-500 backdrop-blur">
                  {day === "Unknown date"
                    ? day
                    : new Date(day).toLocaleDateString(undefined, {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                </div>

                <div className="divide-y divide-[#eef1ff]">
                  {rows.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-[#f8faff]"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-bold text-slate-900">
                          {item.description || t("ui.expense")}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <GoTo
                            type="expense"
                            id={item.expense_id}
                            variant="light"
                          >
                            {item.invoice_name || `#${item.expense_id}`}
                          </GoTo>
                          {item.supplier_name && (
                            <GoTo
                              type="supplier"
                              id={item.supplier_id}
                              variant="light"
                            >
                              {item.supplier_name}
                            </GoTo>
                          )}
                          {item.tax_name && Number(item.tax_rate) > 0 && (
                            <span>
                              {item.tax_name} ({item.tax_rate}%)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-end">
                        <div className="text-lg font-black tabular-nums text-slate-900">
                          {money(item.total)}
                        </div>
                        {Number(item.discount) > 0 && (
                          <div className="mt-0.5 text-xs font-semibold text-red-400">
                            -{money(item.discount)} {t("ui.discount")}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(newLimit) => {
              setLimit(newLimit);
              setPage(1);
            }}
          />
        </section>
      </main>
    </div>
  );
};

export default ExpenseCategoryDetailPage;
