import React, { useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  CalendarDays,
  FileSpreadsheet,
  X,
  AlertCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

import useFundHistory from "../hooks/useFundHistory";
import { formatMoney } from "../../../../Global/FormatNumber";
import { useTranslation } from "react-i18next";
import GoTo from "../../../../Global/GoTo";
import Pagination from "../../../../Global/Pagination";
import ExportModal from "../../../../Global/ExportModal";
import BackButton from "../../../../Global/BackButton";
import fundHistoryRowLabel from "./fundHistoryRowLabel";

const FundMovementsPage = () => {
  const { t } = useTranslation();
  const { id } = useParams();

  const {
    history,
    fund,
    loading,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    totalIn,
    totalOut,
    dateRange,
    updateDateRange,
    clearDateRange,
    exporting,
    exportError,
    exportExcel,
    exportPdf,
  } = useFundHistory(id);

  const fundCurrency = fund || {};
  const finalBalance = history[0]?.running_balance || 0;
  const hasDateFilter = Boolean(dateRange.startDate || dateRange.endDate);
  const [showExportModal, setShowExportModal] = useState(false);

  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur overflow-hidden";

  // Group rows by calendar day for a lightweight timeline feel — same
  // pattern as PartyLedgerPage. Purely a display grouping, doesn't touch
  // running_balance or pagination math.
  const groupedByDay = history.reduce((acc, row) => {
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
        {/* HERO / HEADER */}
        <section className={panelClass}>
          <div className="flex flex-col gap-5 p-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <BackButton size="lg" />
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase text-[#4663ff]">
                  <Wallet size={13} />
                  {t("ui.fund")}
                </p>
                <h1 className="text-3xl font-black leading-tight text-slate-950">
                  {fund?.name || t("screens.funds.title")}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {t("screens.funds.subtitle")}
                </p>
              </div>
            </div>
          </div>

          {/* NUMBERS STRIP — the focal point of the page */}
          <div className="grid grid-cols-1 gap-3 border-t border-[#e5ebff] bg-white/60 p-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <TrendingUp size={14} />
                {t("screens.fundMovements.totalIn")}
              </div>
              <div className="mt-2 text-2xl font-black tabular-nums text-emerald-700">
                {formatMoney(totalIn, fundCurrency)}
              </div>
            </div>

            <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-600">
                <TrendingDown size={14} />
                {t("screens.fundMovements.totalOut")}
              </div>
              <div className="mt-2 text-2xl font-black tabular-nums text-red-600">
                {formatMoney(totalOut, fundCurrency)}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950 p-5 text-white">
              <div className="flex items-center gap-1.5 text-xs font-bold opacity-70">
                <Wallet size={14} />
                {t("screens.fundMovements.currentBalance")}
              </div>
              <div className="mt-2 text-2xl font-black tabular-nums">
                {formatMoney(finalBalance, fundCurrency)}
              </div>
            </div>
          </div>

          {/* DATE FILTER + EXPORT */}
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

            <div className="ml-auto flex items-center gap-2">
              {exportError && (
                <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertCircle size={13} />
                  {exportError}
                </span>
              )}

              <button
                onClick={() => setShowExportModal(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dbe4ff] bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
              >
                <FileSpreadsheet size={16} />
                {t("screens.fundMovements.exportTitle", "Export")}
              </button>
            </div>

            <span className="text-xs font-semibold text-slate-400">
              {t("screens.ledger.allTimeResults", { count: total })}
            </span>
          </div>
        </section>

        {/* TIMELINE / LIST — grouped by day */}
        <section className={panelClass}>
          {loading ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-400">
              {t("screens.funds.loading")}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#4663ff]">
                <Wallet size={22} />
              </div>
              <p className="font-bold text-slate-600">
                {t("screens.funds.empty")}
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
                  {rows.map((item) => {
                    const isIn = item.movement_type === "in";
                    const rateDiffers =
                      item.exchange_rate != null &&
                      item.effective_rate != null &&
                      item.exchange_rate !== item.effective_rate;
                    const label = fundHistoryRowLabel({ row: item, t });

                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-[#f8faff]"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                              isIn
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-600"
                            }`}
                          >
                            {isIn ? (
                              <ArrowDownLeft size={20} />
                            ) : (
                              <ArrowUpRight size={20} />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate font-bold text-slate-900">
                              {label}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              {item.party_name && (
                                <GoTo type={item.party_type} id={item.party_id}>
                                  {item.party_name}
                                </GoTo>
                              )}

                              {item.transaction_type && item.transaction_id && (
                                <GoTo
                                  type={item.transaction_type}
                                  id={item.transaction_id}
                                >
                                  {t(
                                    `screens.funds.transactionType.${item.transaction_type}`,
                                    { defaultValue: item.transaction_type }
                                  )}{" "}
                                  #{item.transaction_id}
                                </GoTo>
                              )}

                              {rateDiffers && (
                                <span className="text-slate-300">
                                  {t("ui.rate")}: {item.exchange_rate} (
                                  {item.effective_rate})
                                </span>
                              )}
                            </div>

                            {item.note && (
                              <div className="mt-1 truncate text-[11px] italic text-slate-400/80">
                                {item.note}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 text-end">
                          <div
                            className={`text-lg font-black tabular-nums ${
                              isIn ? "text-emerald-600" : "text-red-500"
                            }`}
                          >
                            {isIn ? "+" : "-"}
                            {formatMoney(item.amount, fundCurrency)}
                          </div>

                          <div className="mt-1.5 flex items-center justify-end gap-1 text-xs font-semibold text-slate-400">
                            <Wallet size={12} />
                            {formatMoney(item.running_balance, fundCurrency)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExportExcel={(range) => exportExcel(range)}
        onExportPdf={(range) => exportPdf(range)}
        exporting={exporting}
        exportError={exportError}
        title={t("screens.fundMovements.exportTitle", "Export Fund Movements")}
      />
    </div>
  );
};

export default FundMovementsPage;
