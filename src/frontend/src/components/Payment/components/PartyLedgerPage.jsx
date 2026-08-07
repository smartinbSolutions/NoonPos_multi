import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Landmark,
  ShoppingCart,
  CreditCard,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  Download,
  CalendarDays,
  X,
  User,
  Truck,
  Handshake,
} from "lucide-react";

import usePartyLedger from "../hooks/useGetPartyPayments";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import GoTo from "../../../Global/GoTo";
import Pagination from "../../../Global/Pagination";
import ExportModal from "../../../Global/ExportModal";
import partyLedgerRowLabel from "./PartyLedgerRowLabel";

const PARTY_ICONS = {
  customer: User,
  supplier: Truck,
  partner: Handshake,
};

const PartyLedgerPage = () => {
  const { t, i18n } = useTranslation();
  const { id, type } = useParams();
  const navigate = useNavigate();
  const isRtl = i18n.dir() === "rtl";
  const BackArrowIcon = isRtl ? ArrowRight : ArrowLeft;

  const normalizedType = type === "partners" ? "partner" : type;
  const isPartnerParty = normalizedType === "partner";
  const PartyIcon = PARTY_ICONS[normalizedType] || User;

  const {
    data,
    summary,
    loading,
    refetch: fetchData,
    party,
    page,
    setPage,
    total,
    totalPages,
    limit,
    setLimit,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
  } = usePartyLedger(id, normalizedType);

  const { money } = usePrimaryCurrency();

  // Export modal state — independent date range from the on-screen filter above.
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const typeLabel = isPartnerParty
    ? t("ui.partner")
    : normalizedType === "customer"
      ? t("ui.customer")
      : t("ui.supplier");

  const partyName = party?.name || `${typeLabel} #${id}`;

  const runExport = async (apiFn, { startDate, endDate, language }) => {
    setExporting(true);
    setExportError("");
    try {
      const res = await apiFn({
        partyId: id,
        partyType: normalizedType,
        startDate,
        endDate,
        language,
        partyName,
      });

      if (res.success) {
        toast.success(t("common.exportSuccess", "Export completed"));
        setExportOpen(false);
      } else if (res.error !== "Export cancelled") {
        setExportError(res.error || t("common.exportFailed", "Export failed"));
      }
    } catch (err) {
      setExportError(err.message || String(err));
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = (range) =>
    runExport(window.api.exportPartyHistoryExcel, range);

  const handleExportPdf = (range) =>
    runExport(window.api.exportPartyHistoryPdf, range);

  const totalIncrease = Number(summary?.total_increase || 0);
  const totalDecrease = Number(summary?.total_decrease || 0);
  const totalInvoice = Number(summary?.total_invoice || 0);
  const totalReturn = Number(summary?.total_return || 0);
  const totalPayment = Number(summary?.total_payment || 0);
  const openingBalance = Number(summary?.opening_balance || 0);

  // Balance is simply the net of every increase/decrease ever recorded —
  // no more per-party-type special casing, since movement_type is now
  // uniform across customer/supplier/partner.
  const partyBalance = totalIncrease - totalDecrease;

  const hasDateFilter = Boolean(dateFrom || dateTo);

  // Outflow (money-out/red styling) is now just "did this decrease the
  // balance" — same rule for every party type.
  const isOutflow = (p) => p.movement_type === "decrease";

  const primaryLabel = (row) => {
    if (row.record_type === "opening_balance") {
      return t("screens.ledger.openingBalance", "Opening balance");
    }
    if (row.record_type === "payment") {
      return row.note || t("ui.payment");
    }
    if (row.record_type === "invoice" || row.record_type === "return") {
      const typeLabel = t(
        `screens.invoices.invoiceType.${row.invoice_type}`,
        row.invoice_type
      );
      return row.invoice_id ? `${typeLabel} #${row.invoice_id}` : typeLabel;
    }
    return t("ui.transaction", "Transaction");
  };
  // Group rows by calendar day for a lightweight timeline feel — purely a
  // display grouping, doesn't touch running_balance or pagination math.
  const groupedByDay = data.reduce((acc, row) => {
    const key =
      (row.date || "").slice(0, 10) ||
      t("screens.ledger.unknownDate", "Unknown date");
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur overflow-hidden";

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-5">
        {/* HERO / HEADER */}
        <section className={panelClass}>
          <div className="grid gap-6 p-7 lg:grid-cols-[1fr_auto]">
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#dbe4ff] bg-white text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                aria-label={t("common.back")}
              >
                <BackArrowIcon size={18} />
              </button>

              <div className="min-w-0">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase  text-[#4663ff]">
                  <PartyIcon size={13} />
                  {typeLabel}
                </p>
                <h1 className="truncate text-3xl font-black leading-tight text-slate-950">
                  {partyName}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {t("screens.ledger.partyId", { type: typeLabel, id })}
                </p>
              </div>
            </div>
          </div>

          {/* SUMMARY STRIP */}
          <div className="grid grid-cols-2 gap-3 border-t border-[#e5ebff] bg-white/60 p-6 sm:grid-cols-5">
            <div className="rounded-2xl border border-[#e5ebff] bg-[#f8faff] p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                <Landmark size={13} />
                {t("screens.ledger.openingBalance")}
              </div>
              <div className="mt-2 text-lg font-black tabular-nums text-slate-700">
                {money(openingBalance)}
              </div>
            </div>

            {isPartnerParty ? (
              <>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                    <ArrowDownCircle size={13} />
                    {t("screens.ledger.totalDeposit")}
                  </div>
                  <div className="mt-2 text-lg font-black tabular-nums text-emerald-700">
                    {money(totalIncrease)}
                  </div>
                </div>

                <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-red-600">
                    <ArrowUpCircle size={13} />
                    {t("screens.ledger.totalWithdrawal")}
                  </div>
                  <div className="mt-2 text-lg font-black tabular-nums text-red-600">
                    {money(totalDecrease)}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600">
                    <ShoppingCart size={13} />
                    {t("screens.ledger.totalInvoice")}
                  </div>
                  <div className="mt-2 text-lg font-black tabular-nums text-blue-700">
                    {money(totalInvoice)}
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
                    <RefreshCw size={13} />
                    {t("screens.ledger.totalReturn")}
                  </div>
                  <div className="mt-2 text-lg font-black tabular-nums text-amber-700">
                    {money(totalReturn)}
                  </div>
                </div>

                <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-red-600">
                    <CreditCard size={13} />
                    {t("screens.ledger.totalPayment")}
                  </div>
                  <div className="mt-2 text-lg font-black tabular-nums text-red-600">
                    {money(totalPayment)}
                  </div>
                </div>
              </>
            )}

            <div className="col-span-2 rounded-2xl bg-slate-950 p-4 text-white sm:col-span-1">
              <div className="flex items-center gap-1.5 text-xs font-bold opacity-70">
                <Wallet size={13} />
                {t("ui.balance")}
              </div>
              <div className="mt-2 text-xl font-black tabular-nums">
                {money(partyBalance)}
              </div>
            </div>
          </div>

          {/* DATE FILTER */}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#e5ebff] bg-white/60 px-6 py-4">
            <div className="flex items-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white px-3 py-2">
              <CalendarDays size={15} className="shrink-0 text-[#4663ff]" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent text-sm text-slate-700 outline-none"
              />
              <span className="text-slate-300">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent text-sm text-slate-700 outline-none"
              />
            </div>

            {hasDateFilter && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-200"
              >
                <X size={13} />
                {t("common.clear", "Clear")}
              </button>
            )}

            <span className="text-xs font-semibold text-slate-400">
              {hasDateFilter
                ? t("screens.ledger.filteredResults", { count: total })
                : t("screens.ledger.allTimeResults", { count: total })}
            </span>
          </div>
        </section>

        {/* TIMELINE / LIST */}
        <section className={panelClass}>
          {loading ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-400">
              {t("common.loading")}
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#4663ff]">
                <Wallet size={22} />
              </div>
              <p className="font-bold text-slate-600">
                {t("screens.ledger.noMovements")}
              </p>
              {hasDateFilter && (
                <p className="text-sm text-slate-400">
                  {t(
                    "screens.ledger.noMovementsInRange",
                    "Try widening or clearing the date range."
                  )}
                </p>
              )}
            </div>
          ) : (
            Object.entries(groupedByDay).map(([day, rows]) => (
              <div key={day}>
                <div className="sticky top-0 z-10 border-b border-[#e5ebff] bg-[#f8faff]/95 px-6 py-2.5 text-xs font-bold uppercase  text-slate-500 backdrop-blur">
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
                  {rows.map((p) => {
                    const outflow = isOutflow(p);
                    const rate = Number(p.exchange_rate || 1);
                    const isForeignCurrency = rate !== 1;
                    const effectiveRate = Number(p.effective_rate || rate);
                    const fundAmount = Number(
                      p.amount_fund_currency ?? Number(p.amount || 0) * rate
                    );
                    const label = partyLedgerRowLabel({
                      row: p,
                      partyName,
                      partyType: normalizedType,
                      t,
                      formattedAmount: money(p.amount),
                    });

                    return (
                      <div
                        key={`${p.record_type}-${p.id}`}
                        className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-[#f8faff]"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                              p.record_type === "return"
                                ? "bg-amber-100 text-amber-600"
                                : outflow
                                  ? "bg-red-100 text-red-600"
                                  : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {p.record_type === "return" ? (
                              <RefreshCw size={18} />
                            ) : outflow ? (
                              <ArrowUpRight size={20} />
                            ) : (
                              <ArrowDownLeft size={20} />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate font-bold text-slate-900">
                              {label}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              {p.record_type === "return" && (
                                <span className="font-bold uppercase text-amber-600">
                                  {t("screens.ledger.return")}
                                </span>
                              )}

                              {p.record_type !== "payment" &&
                                p.invoice_id &&
                                p.invoice_type && (
                                  <GoTo type={p.invoice_type} id={p.invoice_id}>
                                    {p.invoice_name || `#${p.invoice_id}`}
                                  </GoTo>
                                )}

                              {p.record_type === "payment" && p.payment_id && (
                                <GoTo type="payment" id={p.payment_id}>
                                  {t("screens.ledger.payment")} #{p.payment_id}
                                </GoTo>
                              )}

                              {p.record_type === "payment" && p.fund_name && (
                                <GoTo type="fund" id={p.payment_fund_id}>
                                  {p.fund_name}
                                </GoTo>
                              )}
                            </div>

                            {p.note && (
                              <div className="mt-1 truncate text-[11px] italic text-slate-400/80">
                                {p.note}
                              </div>
                            )}

                            {isForeignCurrency && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-[#dbe4ff] bg-[#f8faff] px-2 py-1 text-[11px] text-slate-500">
                                <span className="font-semibold text-slate-700">
                                  {money(p.amount)}
                                </span>
                                <span className="text-slate-400">
                                  × {rate.toFixed(4)}
                                </span>
                                <span className="text-slate-400">=</span>
                                <span className="font-semibold text-slate-700">
                                  {fundAmount.toFixed(2)} {p.currency_code}
                                </span>
                                {effectiveRate !== rate && (
                                  <span className="font-semibold text-[#4663ff]">
                                    ({t("screens.ledger.effectiveRate")}:{" "}
                                    {effectiveRate.toFixed(4)})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 text-end">
                          <div
                            className={`text-lg font-black tabular-nums ${
                              p.record_type === "return"
                                ? "text-amber-600"
                                : outflow
                                  ? "text-red-500"
                                  : "text-emerald-600"
                            }`}
                          >
                            {outflow ? "-" : "+"}
                            {money(p.amount)}
                          </div>

                          <div className="mt-1.5 flex items-center justify-end gap-1 text-xs font-semibold text-slate-400">
                            <Wallet size={12} />
                            {t("screens.ledger.balance", {
                              balance: money(p.running_balance),
                            })}
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
      </div>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => {
          setExportOpen(false);
          setExportError("");
        }}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        exporting={exporting}
        exportError={exportError}
        title={t("screens.ledger.exportTitle", "Export Ledger")}
      />
    </div>
  );
};

export default PartyLedgerPage;
