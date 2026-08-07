import React, { useMemo, useState } from "react";
import useFundList from "../hooks/useFundList";
import {
  Edit2,
  Trash2,
  Eye,
  CloudSync,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatMoney, normalizeDigits } from "../../../../Global/FormatNumber";
import { ToastContainer } from "react-toastify";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../../Global/DeleteModel";
import FundTransferModal from "./FundTransferModal";
import AddFundPayment from "../../Payment/components/AddFundPayment";
import FundListHeader from "./FundListHeader";
import NumberInput from "../../../../Global/NumberInput";

const ACTION_BUTTON_BASE =
  "flex h-9 w-9 items-center justify-center rounded-xl transition active:scale-95";

const FundList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    saving,
    funds,
    refetch,
    handleDeleteFund,
    submitDraft,
    startEdit,
    submitEdit,
    setEditing,
    editing,
    setEditingId,
    editingId,
    setDraft,
    draft,
    currencies,
    actionError,
    setActionError,
    setOpenTransferModal,
    openTransferModal,
  } = useFundList();

  const [search, setSearch] = useState("");
  const [deleteFund, setDeleteFund] = useState(null);

  const [openPaymentModal, setOpenPaymentModal] = useState(false);
  const [selectedFund, setSelectedFund] = useState(null);
  const [paymentMode, setPaymentMode] = useState("out");

  const pageClass =
    "min-h-screen bg-[linear-gradient(135deg,#f7f8fc_0%,#fbfbfd_50%,#f6f9f7_100%)] p-6 text-slate-900";
  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur overflow-hidden";
  const inputClass =
    "rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10 disabled:bg-slate-50 disabled:text-slate-400";

  const handleOpenPayment = (fund, mode) => {
    setSelectedFund(fund);
    setPaymentMode(mode);
    setOpenPaymentModal(true);
  };

  const filteredFunds = useMemo(() => {
    return (funds || []).filter((f) =>
      `${f.name} ${f.currency_code}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [funds, search]);

  // Summary strip — grouped by currency, since balances in different
  // currencies can't be meaningfully summed into one number. Carries the
  // first fund's symbol/code seen for that group, since formatMoney needs
  // a currency-like object (symbol/code), not just a bare code string.
  const balancesByCurrency = useMemo(() => {
    const groups = new Map();
    for (const fund of funds || []) {
      const code = fund.currency_code || "—";
      const existing = groups.get(code);
      groups.set(code, {
        code,
        symbol: existing?.symbol || fund.currency_symbol,
        total: (existing?.total || 0) + Number(fund.balance || 0),
      });
    }
    return Array.from(groups.values());
  }, [funds]);
  return (
    <div className={pageClass}>
      <div className="mx-auto max-w-6xl space-y-5">
        {/* HERO / CREATE */}
        <section className={panelClass}>
          <FundListHeader
            eyebrow={t("ui.setup")}
            title={t("screens.funds.title")}
            subtitle={t("screens.funds.subtitle")}
            accountCount={funds.length}
            accountsLabel={t("screens.funds.accounts")}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("screens.funds.searchFunds")}
            createTitle={t("screens.funds.createTitle")}
            createSubtitle={t("screens.funds.createSubtitle")}
            draft={draft}
            setDraft={setDraft}
            currencies={currencies}
            onSubmit={submitDraft}
            saving={saving}
            actionError={actionError}
            setActionError={setActionError}
            submitLabel={t("screens.funds.createButton")}
            t={t}
          />

          {/* SUMMARY STRIP */}
          {balancesByCurrency.length > 0 && (
            <div className="flex flex-wrap gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              {balancesByCurrency.map(({ code, symbol, total }) => (
                <div
                  key={code}
                  className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-[11px] text-white">
                    {code?.slice(0, 2) || "—"}
                  </span>
                  <div>
                    <p className="text-lg font-bold tabular-nums text-slate-900">
                      {formatMoney(total, { symbol, code })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* FUND CARDS */}
        {filteredFunds.length === 0 ? (
          <section className={panelClass}>
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 bg-[#4663ff]">
                <Wallet size={20} />
              </div>
              <p className="text-sm font-semibold text-slate-500">
                {t("screens.funds.noFunds")}
              </p>
            </div>
          </section>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredFunds.map((fund) => {
              const isEditing = editingId === fund.id;

              if (isEditing) {
                return (
                  <div
                    key={fund.id}
                    className="rounded-[22px] border border-[#4663ff]/30 bg-white p-4 shadow-[0_16px_40px_rgba(70,99,255,0.12)]"
                  >
                    <form onSubmit={submitEdit} className="space-y-2.5">
                      <input
                        required
                        autoFocus
                        value={editing.name}
                        onChange={(e) =>
                          setEditing({ ...editing, name: e.target.value })
                        }
                        className={`${inputClass} w-full`}
                        placeholder={t("screens.funds.namePlaceholder")}
                      />

                      <select
                        value={editing.currency_id || ""}
                        disabled
                        className={`${inputClass} w-full`}
                      >
                        <option value="">{t("ui.currency")}</option>
                        {currencies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>

                      <NumberInput
                        value={editing.balance || ""}
                        onChange={(val) =>
                          setEditing({ ...editing, balance: val })
                        }
                        disabled
                        className={`${inputClass} w-full`}
                        placeholder={t("ui.balance")}
                      />

                      <div className="flex gap-2 pt-1">
                        <button
                          type="submit"
                          className="flex-1 rounded-xl bg-[#4663ff] py-2.5 text-sm font-bold text-white transition hover:bg-[#3854e8]"
                        >
                          {t("common.save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </form>
                  </div>
                );
              }

              return (
                <div
                  key={fund.id}
                  className="group flex flex-col justify-between rounded-[22px] border border-slate-200/80 bg-white p-4 transition hover:border-slate-300 hover:shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#4663ff] text-sm font-bold text-white">
                          {fund.name?.charAt(0)?.toUpperCase() || "F"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-900">
                            {fund.name}
                          </p>
                          <p className="text-xs font-semibold text-slate-400">
                            {fund.currency_code}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => navigate(`/fund/${fund.id}`)}
                        className={`${ACTION_BUTTON_BASE} text-slate-400 hover:bg-slate-100 hover:text-slate-700`}
                        title={t("screens.funds.viewMovements")}
                      >
                        <Eye size={16} />
                      </button>
                    </div>

                    <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {t("ui.balance")}
                      </p>
                      <p
                        className={`mt-0.5 text-2xl tabular-nums ${
                          Number(fund.balance || 0) < 0
                            ? "text-red-600"
                            : "text-slate-900"
                        }`}
                      >
                        {formatMoney(fund.balance || 0, fund)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-1 border-t border-slate-100 pt-3.5">
                    <button
                      onClick={() => handleOpenPayment(fund, "out")}
                      className={`${ACTION_BUTTON_BASE} text-red-500 hover:bg-red-50`}
                      title={t("screens.payments.payment_expense")}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                    <button
                      onClick={() => handleOpenPayment(fund, "in")}
                      className={`${ACTION_BUTTON_BASE} text-emerald-600 hover:bg-emerald-50`}
                      title={t("screens.payments.receipt_deposit")}
                    >
                      <ArrowDownLeft size={16} />
                    </button>
                    <button
                      onClick={() => setOpenTransferModal(fund)}
                      className={`${ACTION_BUTTON_BASE} text-slate-400 hover:bg-slate-100 hover:text-slate-700`}
                      title={t("screens.funds.fund_transfer")}
                    >
                      <CloudSync size={16} />
                    </button>
                    <button
                      onClick={() => startEdit(fund)}
                      className={`${ACTION_BUTTON_BASE} text-slate-400 hover:bg-slate-100 hover:text-slate-700`}
                      title={t("common.edit")}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteFund(fund)}
                      className={`${ACTION_BUTTON_BASE} text-slate-400 hover:bg-red-50 hover:text-red-500`}
                      title={t("common.delete")}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DeleteModal
        open={Boolean(deleteFund)}
        onClose={() => setDeleteFund(null)}
        onConfirm={async () => {
          await handleDeleteFund(deleteFund);
          setDeleteFund(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />

      <FundTransferModal
        isOpen={Boolean(openTransferModal)}
        onClose={() => setOpenTransferModal(false)}
        refetchList={refetch}
        lockedFromFundId={openTransferModal?.id}
      />

      {openPaymentModal && (
        <AddFundPayment
          isOpen={openPaymentModal}
          onClose={() => {
            setOpenPaymentModal(false);
            setSelectedFund(null);
          }}
          mode={paymentMode}
          initialFundId={selectedFund?.id}
          refetchList={() => {
            refetch?.();
          }}
        />
      )}

      <ToastContainer />
    </div>
  );
};

export default FundList;
