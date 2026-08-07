import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import usePayment from "../hooks/usePayment";
import useDeletedPayments from "../hooks/useDeletedPayments";
import DeleteModal from "../../../../Global/DeleteModel";
import Pagination from "../../../../Global/Pagination";

import {
  Search,
  Receipt,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Filter,
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Eye,
  Archive,
  MoreVertical,
  Download,
  Printer,
  CalendarDays,
} from "lucide-react";
import { formatMoney } from "../../../../Global/FormatNumber";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { useNavigate } from "react-router-dom";
import DropdownMenu from "../../../../Global/DropdownMenu";
import GoTo from "../../../../Global/GoTo";

const AllocationBadge = ({ payment }) => {
  const { t } = useTranslation();

  if (payment.party_type === "partner") {
    return (
      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
        {t("screens.payments.partnerMovement")}
      </span>
    );
  }

  if (!payment.allocation_count || payment.allocation_count === 0) {
    return (
      <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
        {t("screens.payments.unallocated")}
      </span>
    );
  }

  if (payment.allocated_amount < payment.amount) {
    return (
      <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
        {t("screens.payments.partial")}
      </span>
    );
  }

  return (
    <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
      {t("screens.payments.fullyAllocated")}
    </span>
  );
};

const PaymentFlow = ({ payment, isRtl }) => {
  const isIncome = payment.type === "income";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  const partyNode = payment.party_id ? (
    <GoTo type={payment.party_type} id={payment.party_id} variant="light">
      {payment.party_name || "-"}
    </GoTo>
  ) : (
    <span>{payment.party_name || "-"}</span>
  );

  const fundNode = payment.fund_id ? (
    <GoTo type="fund" id={payment.fund_id} variant="light">
      {payment.fund_name || "-"}
    </GoTo>
  ) : (
    <span>{payment.fund_name || "-"}</span>
  );

  const from = isIncome ? partyNode : fundNode;
  const to = isIncome ? fundNode : partyNode;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="truncate font-semibold text-slate-500">{from}</span>
      <Arrow
        size={13}
        className={`shrink-0 ${isIncome ? "text-emerald-500" : "text-red-500"}`}
      />
      <span className="truncate font-bold text-slate-900">{to}</span>
    </div>
  );
};

const PaymentList = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const navigate = useNavigate();

  const [view, setView] = useState("active");

  const {
    payments = [],
    summary,
    loading: activeLoading,
    actionError: activeActionError,
    refetch: refetchActive,
    handleDeletePayment,
    page: activePage,
    setPage: setActivePage,
    limit: activeLimit,
    setLimit: setActiveLimit,
    total: activeTotal,
    totalPages: activeTotalPages,
    filters: activeFilters,
    setFilters: setActiveFilters,
  } = usePayment();

  const {
    deletedPayments = [],
    loading: deletedLoading,
    actionError: deletedActionError,
    refetch: refetchDeleted,
    page: deletedPage,
    setPage: setDeletedPage,
    limit: deletedLimit,
    setLimit: setDeletedLimit,
    total: deletedTotal,
    totalPages: deletedTotalPages,
    filters: deletedFilters,
    setFilters: setDeletedFilters,
  } = useDeletedPayments();

  const isDeletedView = view === "deleted";

  const rows = isDeletedView ? deletedPayments : payments;
  const loading = isDeletedView ? deletedLoading : activeLoading;
  const actionError = isDeletedView ? deletedActionError : activeActionError;
  const refetch = isDeletedView ? refetchDeleted : refetchActive;
  const page = isDeletedView ? deletedPage : activePage;
  const setPage = isDeletedView ? setDeletedPage : setActivePage;
  const limit = isDeletedView ? deletedLimit : activeLimit;
  const setLimit = isDeletedView ? setDeletedLimit : setActiveLimit;
  const total = isDeletedView ? deletedTotal : activeTotal;
  const totalPages = isDeletedView ? deletedTotalPages : activeTotalPages;
  const filters = isDeletedView ? deletedFilters : activeFilters;
  const setFilters = isDeletedView ? setDeletedFilters : setActiveFilters;

  const { money, primaryCurrency } = usePrimaryCurrency();

  const [deletePaymentId, setDeletePaymentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [allocationsByPayment, setAllocationsByPayment] = useState({});
  const [loadingAllocations, setLoadingAllocations] = useState({});
  const [funds, setFunds] = useState([]);
  const [savingPdfId, setSavingPdfId] = useState(null);

  const api = window.api;

  useEffect(() => {
    if (api?.getFunds) {
      api
        .getFunds()
        .then((res) => setFunds(res?.data || res || []))
        .catch(() => setFunds([]));
    }
  }, [api]);

  const filteredPayments = rows.filter((pay) => {
    const partyName = pay.party_name?.toLowerCase() || "";
    const paymentId = String(isDeletedView ? pay.payment_id : pay.id);
    const query = searchQuery.toLowerCase();
    return partyName.includes(query) || paymentId.includes(query);
  });

  const toggleExpand = async (payment) => {
    const rowId = isDeletedView ? payment.deleted_payment_id : payment.id;
    const isExpanded = expandedRows[rowId];

    setExpandedRows((prev) => ({ ...prev, [rowId]: !isExpanded }));

    if (isDeletedView) return;

    if (!isExpanded && !allocationsByPayment[rowId]) {
      setLoadingAllocations((prev) => ({ ...prev, [rowId]: true }));
      try {
        const res = await api.getPaymentAllocations(payment.id);
        setAllocationsByPayment((prev) => ({ ...prev, [rowId]: res || [] }));
      } catch (err) {
        console.error("Failed to load allocations:", err);
        setAllocationsByPayment((prev) => ({ ...prev, [rowId]: [] }));
      } finally {
        setLoadingAllocations((prev) => ({ ...prev, [rowId]: false }));
      }
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters({ [field]: value || null });
  };

  const handleViewChange = (nextView) => {
    setView(nextView);
    setSearchQuery("");
    setExpandedRows({});
  };

  const handlePrint = async (paymentId) => {
    try {
      const res = await api.printDocument(`/print-payment/${paymentId}`);
      if (!res.success && res.error === "NO_PRINTER") {
        console.error("No printer found");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSavePdf = async (paymentId) => {
    try {
      setSavingPdfId(paymentId);
      const res = await api.saveDocumentPdf(
        `/print-payment/${paymentId}`,
        `payment-${paymentId}.pdf`
      );
      if (!res.success && res.error !== "CANCELED") {
        console.error(res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPdfId(null);
    }
  };

  const hasActiveFilters = Object.values(filters).some(
    (value) => value !== null && value !== ""
  );

  const clearFilters = () => {
    setFilters({
      type: null,
      party_type: null,
      invoice_type: null,
      fund_id: null,
      dateFrom: null,
      dateTo: null,
    });
  };

  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur overflow-hidden";

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* HERO */}
        <section className={panelClass}>
          <div className="grid gap-6 p-7 lg:grid-cols-[1fr_360px]">
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-[#4663ff]">
                {t("ui.payment")}
              </p>
              <h1 className="text-4xl font-black leading-tight text-slate-950">
                {t("screens.payments.title")}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {t("screens.payments.subtitle")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                  <TrendingUp size={13} />
                  {t("screens.payments.count_income", {
                    count: summary.income_count,
                  })}
                </div>
                <div className="mt-2 text-xl font-black tabular-nums text-emerald-700">
                  {formatMoney(summary.income_total, primaryCurrency)}
                </div>
              </div>
              <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-600">
                  <TrendingDown size={13} />
                  {t("screens.payments.count_expense", {
                    count: summary.expense_count,
                  })}
                </div>
                <div className="mt-2 text-xl font-black tabular-nums text-red-600">
                  {formatMoney(summary.expense_total, primaryCurrency)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#e5ebff] bg-white/60 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={t("common.search")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#dbe4ff] bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[#4663ff] focus:ring-2 focus:ring-[#4663ff]/10"
                />
              </div>

              <div className="inline-flex h-12 items-center rounded-2xl border border-[#dbe4ff] bg-white p-1">
                <button
                  onClick={() => handleViewChange("active")}
                  className={`inline-flex h-full items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
                    !isDeletedView
                      ? "bg-[#4663ff] text-white"
                      : "text-slate-500 hover:text-[#4663ff]"
                  }`}
                >
                  <Receipt size={15} />
                  {t("screens.payments.activeTab")}
                </button>
                <button
                  onClick={() => handleViewChange("deleted")}
                  className={`inline-flex h-full items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
                    isDeletedView
                      ? "bg-[#4663ff] text-white"
                      : "text-slate-500 hover:text-[#4663ff]"
                  }`}
                >
                  <Archive size={15} />
                  {t("screens.payments.deletedTab")}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="h-11 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-600 transition hover:bg-red-100"
                >
                  {t("common.clear")}
                </button>
              )}
              <button
                onClick={() => setShowFilters((prev) => !prev)}
                className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-bold transition ${
                  showFilters
                    ? "border-[#4663ff] bg-[#eef3ff] text-[#4663ff]"
                    : "border-[#dbe4ff] bg-white text-slate-600 hover:bg-[#eef3ff] hover:text-[#4663ff]"
                }`}
              >
                <Filter size={16} />
                {t("common.filters")}
              </button>
              <button
                onClick={refetch}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
              >
                <RefreshCw size={16} />
                {t("common.refresh")}
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 gap-3 border-t border-[#e5ebff] bg-white/60 p-5 md:grid-cols-3 lg:grid-cols-6">
              <select
                value={filters.type || ""}
                onChange={(e) => handleFilterChange("type", e.target.value)}
                className="h-11 rounded-xl border border-[#dbe4ff] bg-white px-3 text-sm outline-none focus:border-[#4663ff]"
              >
                <option value="">{t("screens.payments.all_types")}</option>
                <option value="income">{t("screens.payments.income")}</option>
                <option value="expense">{t("screens.payments.expense")}</option>
              </select>

              <select
                value={filters.party_type || ""}
                onChange={(e) =>
                  handleFilterChange("party_type", e.target.value)
                }
                className="h-11 rounded-xl border border-[#dbe4ff] bg-white px-3 text-sm outline-none focus:border-[#4663ff]"
              >
                <option value="">{t("screens.payments.all_parties")}</option>
                <option value="customer">{t("ui.customer")}</option>
                <option value="supplier">{t("ui.supplier")}</option>
                <option value="partner">{t("ui.partner")}</option>
                <option value="other">{t("ui.other")}</option>
              </select>

              <select
                value={filters.invoice_type || ""}
                onChange={(e) =>
                  handleFilterChange("invoice_type", e.target.value)
                }
                className="h-11 rounded-xl border border-[#dbe4ff] bg-white px-3 text-sm outline-none focus:border-[#4663ff]"
              >
                <option value="">
                  {t("screens.payments.allInvoiceTypes")}
                </option>
                <option value="sales">{t("ui.sales")}</option>
                <option value="purchase">{t("ui.purchase")}</option>
                <option value="expense">{t("ui.expense")}</option>
              </select>

              <select
                value={filters.fund_id || ""}
                onChange={(e) => handleFilterChange("fund_id", e.target.value)}
                className="h-11 rounded-xl border border-[#dbe4ff] bg-white px-3 text-sm outline-none focus:border-[#4663ff]"
              >
                <option value="">{t("screens.payments.allFunds")}</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={filters.dateFrom || ""}
                onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
                className="h-11 rounded-xl border border-[#dbe4ff] bg-white px-3 text-sm outline-none focus:border-[#4663ff]"
              />

              <input
                type="date"
                value={filters.dateTo || ""}
                onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                className="h-11 rounded-xl border border-[#dbe4ff] bg-white px-3 text-sm outline-none focus:border-[#4663ff]"
              />
            </div>
          )}
        </section>

        {actionError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {actionError}
          </div>
        )}

        {isDeletedView && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            {t("screens.payments.deletedNotice")}
          </div>
        )}

        {/* LIST */}
        <section className={panelClass}>
          {loading ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-400">
              {t("common.loading")}
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#4663ff]">
                <Receipt size={22} />
              </div>
              <p className="font-bold text-slate-600">
                {isDeletedView
                  ? t("screens.payments.emptyDeleted")
                  : t("screens.payments.empty")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#eef1ff]">
              {filteredPayments.map((pay) => {
                const rowId = isDeletedView ? pay.deleted_payment_id : pay.id;
                const displayId = isDeletedView ? pay.payment_id : pay.id;
                const canExpand = pay.party_type !== "partner";
                const isExpanded = expandedRows[rowId];
                const allocations = isDeletedView
                  ? pay.allocations
                  : allocationsByPayment[rowId];
                const isLoadingAlloc = loadingAllocations[rowId];
                const rateDiffers = pay.exchange_rate !== pay.effective_rate;
                const isIncome = pay.type === "income";
                const hasFundCurrencyDiff =
                  pay.fund_currency_code &&
                  pay.amount_fund_currency !== pay.amount;

                return (
                  <div key={rowId}>
                    <div
                      className={`flex flex-col gap-4 px-6 py-4 transition hover:bg-[#f8faff] lg:flex-row lg:items-center lg:justify-between ${
                        isDeletedView ? "opacity-70" : ""
                      }`}
                    >
                      {/* LEFT — identity + flow */}
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {canExpand ? (
                          <button
                            onClick={() => toggleExpand(pay)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                          >
                            {isExpanded ? (
                              <ChevronDown size={16} />
                            ) : (
                              <ChevronRight size={16} />
                            )}
                          </button>
                        ) : (
                          <span className="w-8 shrink-0" />
                        )}

                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                            isIncome
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {isIncome ? (
                            <TrendingUp size={19} />
                          ) : (
                            <TrendingDown size={19} />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {isDeletedView ? (
                              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-500">
                                #{displayId}
                              </span>
                            ) : (
                              <button
                                onClick={() => navigate(`/payments/${pay.id}`)}
                                className="rounded-lg bg-[#eef3ff] px-2 py-0.5 text-xs font-black text-[#4663ff] transition hover:bg-[#dbe4ff]"
                              >
                                #{displayId}
                              </button>
                            )}
                            <span className="flex items-center gap-1 text-xs font-semibold text-slate-400">
                              <CalendarDays size={11} />
                              {pay?.date?.slice(0, 10) ||
                                pay?.createdAt?.slice(0, 10)}
                            </span>
                          </div>
                          <div className="mt-1">
                            <PaymentFlow payment={pay} isRtl={isRtl} />
                          </div>
                        </div>
                      </div>

                      {/* MIDDLE — allocation / deleted info */}
                      <div className="shrink-0 lg:w-48">
                        {isDeletedView ? (
                          <div className="text-xs font-semibold text-slate-500">
                            <div className="text-slate-700">
                              {pay.deleted_by_name || "-"}
                            </div>
                            <div className="text-slate-400">
                              {pay.deletedAt?.slice(0, 16)}
                            </div>
                          </div>
                        ) : (
                          <AllocationBadge payment={pay} />
                        )}
                      </div>

                      {/* NUMBERS — the focal point */}
                      <div className="shrink-0 text-end lg:w-44">
                        <div
                          className={`text-lg font-black tabular-nums ${
                            isIncome ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                          {formatMoney(pay.amount, primaryCurrency)}
                        </div>
                        {hasFundCurrencyDiff && (
                          <div className="mt-0.5 text-xs font-semibold text-slate-400">
                            {formatMoney(pay.amount_fund_currency, {
                              code: pay.fund_currency_code,
                              symbol: pay.fund_currency_symbol,
                            })}
                          </div>
                        )}
                        {rateDiffers && (
                          <div className="mt-0.5 text-[11px] text-slate-300">
                            {t("screens.payments.rate")}: {pay.exchange_rate} (
                            {pay.effective_rate})
                          </div>
                        )}
                      </div>

                      {/* ACTIONS */}
                      <div className="shrink-0">
                        {isDeletedView ? (
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-400">
                            {t("screens.payments.deleted")}
                          </span>
                        ) : (
                          <DropdownMenu
                            trigger={
                              <button className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]">
                                <MoreVertical size={16} />
                              </button>
                            }
                            align={isRtl ? "left" : "right"}
                            options={[
                              {
                                key: "view",
                                icon: <Eye size={14} />,
                                label: t("common.view"),
                                onClick: () => navigate(`/payments/${pay.id}`),
                              },
                              {
                                key: "savePdf",
                                icon: <Download size={14} />,
                                label: t("common.savePdf"),
                                onClick: () => handleSavePdf(pay.id),
                              },
                              {
                                key: "print",
                                icon: <Printer size={14} />,
                                label: t("common.print"),
                                onClick: () => handlePrint(pay.id),
                              },
                              {
                                key: "delete",
                                icon: (
                                  <Trash2 size={14} className="text-red-500" />
                                ),
                                label: t("common.delete"),
                                onClick: () => setDeletePaymentId(pay),
                              },
                            ]}
                          />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-[#f8faff]/60 px-6 py-4">
                        {isLoadingAlloc ? (
                          <div className="text-sm text-slate-500">
                            {t("common.loading")}
                          </div>
                        ) : allocations && allocations.length > 0 ? (
                          <div className="space-y-2">
                            {allocations.map((alloc) => (
                              <div
                                key={alloc.id}
                                className="flex items-center justify-between rounded-xl border border-[#e5ebff] bg-white px-4 py-2 text-sm"
                              >
                                <div className="flex items-center gap-2">
                                  <GoTo
                                    type={alloc.invoice_type}
                                    id={alloc.invoice_id}
                                    variant="light"
                                  >
                                    {t(
                                      `screens.invoices.invoiceType.${alloc.invoice_type}`,
                                      {
                                        defaultValue: alloc.invoice_type,
                                      }
                                    )}{" "}
                                    #{alloc.invoice_id}
                                  </GoTo>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                      alloc.settlement_status === "full"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-amber-50 text-amber-700"
                                    }`}
                                  >
                                    {alloc.settlement_status === "full"
                                      ? t("screens.payments.fullyPaid") ||
                                        "Fully paid"
                                      : t("screens.payments.partiallyPaid") ||
                                        "Partially paid"}
                                  </span>
                                </div>
                                <span className="font-black tabular-nums text-slate-900">
                                  {money(alloc.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">
                            {t("screens.payments.noAllocations")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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

      <DeleteModal
        open={Boolean(deletePaymentId)}
        onClose={() => setDeletePaymentId(null)}
        onConfirm={async () => {
          if (deletePaymentId) {
            await handleDeletePayment(deletePaymentId);
            await refetchDeleted();
            setDeletePaymentId(null);
          }
        }}
        title={t("deleteModal.paymentTitle")}
        message={t("deleteModal.paymentMessage")}
      />
    </div>
  );
};

export default PaymentList;
