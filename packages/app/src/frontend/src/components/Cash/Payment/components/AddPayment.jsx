import React from "react";
import {
  Wallet,
  Save,
  X,
  Building2,
  User,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Sparkles,
  Landmark,
  ArrowRight,
} from "lucide-react";
import { formatMoney } from "../../../../Global/FormatNumber";
import useAddPayment from "../hooks/useAddPayment";
import NumberInput from "../../../../Global/NumberInput";

export default function AddPayment({
  isOpen,
  onClose,
  onSubmit,
  invoice,
  totalAmount,
  party,
  partyName,
  mode = "purchase",
  refetchList,
  confirmLabel,
}) {
  const {
    form,
    funds,
    loading,
    message,
    effectiveRate,
    handleChange,
    handleFundChange,
    handleBaseAmountChange,
    submit,
    isPartner,
    isPurchase,
    isExpense,
    isSales,
    isCustomer,
    isSupplier,
    isCollectorMode,
    t,
    money,
    availableCredit,
    useCredit,
    toggleUseCredit,
    isPurchaseReturn,
    isSalesReturn,
    showDatePicker,
    minDate,
  } = useAddPayment({
    isOpen,
    onClose,
    onSubmit,
    invoice,
    totalAmount,
    party,
    partyName,
    mode,
    refetchList,
    confirmLabel,
  });

  if (!isOpen) return null;

  // Is money flowing IN to the business (collected) or OUT (paid)?
  const isOutflow =
    isPurchase ||
    isExpense ||
    isSupplier ||
    isSalesReturn ||
    (isPartner && form.partner_transaction_type === "expense");

  // Direction color stays semantic (red = out, green = in) — everything
  // else on the modal uses the app's neutral blue, so direction is the one
  // thing that visually stands out.
  const directionText = isOutflow ? "text-red-600" : "text-emerald-600";
  const directionBg = isOutflow ? "bg-red-50" : "bg-emerald-50";
  const directionSolid = isOutflow
    ? "bg-red-600 hover:bg-red-700"
    : "bg-emerald-600 hover:bg-emerald-700";

  const finalText = useCredit ? "text-emerald-600" : directionText;
  const finalBg = useCredit ? "bg-emerald-50" : directionBg;
  const finalSolid = useCredit
    ? "bg-emerald-600 hover:bg-emerald-700"
    : directionSolid;
  const finalRing = useCredit
    ? "border-emerald-300"
    : isOutflow
      ? "border-red-200"
      : "border-emerald-200";

  const title = (() => {
    if (isPurchase) return t("screens.payments.purchasePayment");
    if (isExpense) return t("screens.payments.expensePayment");
    if (isSales) return t("screens.payments.salesPayment");
    if (isCustomer) return t("screens.payments.customer_account_collection");
    if (isPurchaseReturn) return t("screens.payments.purchaseReturnPayment");
    if (isSalesReturn) return t("screens.payments.salesReturnPayment");
    if (isSupplier) return t("screens.payments.supplier_account_collection");
    if (isPartner) {
      return form.partner_transaction_type === "income"
        ? t("screens.payments.partner_deposit")
        : t("screens.payments.partner_withdrawal");
    }
    return "";
  })();

  const partyIcon =
    isPurchase || isExpense || isSupplier ? (
      <Building2 size={18} />
    ) : isSales || isCustomer ? (
      <User size={18} />
    ) : (
      <Users size={18} />
    );

  const partyLabel = (() => {
    if (isPurchase || isExpense || isSupplier) return t("ui.supplier");
    if (isSales || isCustomer) return t("ui.customer");
    return t("screens.payments.partner");
  })();

  const selectedFund = funds?.find((f) => f.id === Number(form.fund_id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1c2340]/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-[#e9edfb] bg-white shadow-[0_30px_90px_rgba(38,54,148,0.18)]">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-[#e9edfb] bg-[#f8faff] px-6 py-5">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ${finalText}`}
            >
              {isOutflow ? (
                <ArrowUpRight size={22} />
              ) : (
                <ArrowDownLeft size={22} />
              )}
            </span>
            <div>
              <h2 className="text-lg font-black text-[#1c2340]">{title}</h2>
              {invoice && (
                <p className="text-sm text-slate-500">
                  {t("ui.invoice")} #{invoice?.id}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          {/* Top row — party info + live amount summary, side by side */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div
              className={`flex items-center gap-3 rounded-2xl border border-[#e9edfb] ${finalBg} p-4`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white ${finalText}`}
              >
                {partyIcon}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {partyLabel}
                </p>
                <h3 className="truncate font-black text-[#1c2340]">
                  {partyName}
                </h3>
              </div>
            </div>

            {invoice ? (
              <div className="flex items-center justify-between rounded-2xl border border-[#e9edfb] bg-white p-4">
                <span className="text-xs font-bold text-slate-400">
                  {t("screens.payments.originalNetTotal")}
                </span>
                <span className="text-lg font-black text-[#1c2340]">
                  {money(invoice?.net_total)}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-2xl border border-[#e9edfb] bg-white p-4">
                <span className="text-xs font-bold text-slate-400">
                  {isOutflow
                    ? t("screens.payments.summaryPaying")
                    : t("screens.payments.summaryReceiving")}
                </span>
                <span className={`text-lg font-black ${finalText}`}>
                  {money(form.amount_in_base || 0)}
                </span>
              </div>
            )}
          </div>

          {/* PARTNER: deposit vs withdraw */}
          {isPartner && (
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#f6f8fd] p-1.5">
              <button
                type="button"
                onClick={() =>
                  handleChange("partner_transaction_type", "income")
                }
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition ${
                  form.partner_transaction_type === "income"
                    ? "bg-white text-emerald-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <ArrowDownLeft size={16} />
                {t("screens.payments.deposit")}
              </button>
              <button
                type="button"
                onClick={() =>
                  handleChange("partner_transaction_type", "expense")
                }
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition ${
                  form.partner_transaction_type === "expense"
                    ? "bg-white text-red-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <ArrowUpRight size={16} />
                {t("screens.payments.withdraw")}
              </button>
            </div>
          )}

          {/* Funding source — side by side when both options exist, so the
              choice reads as "pick one of these two", not a stacked list */}
          <div>
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-[#4663ff]">
              {t("screens.payments.paymentSource")}
            </p>

            <div
              className={`grid gap-2.5 ${!isPartner && availableCredit > 0 ? "sm:grid-cols-2" : "grid-cols-1"}`}
            >
              {/* Cash fund option */}
              <button
                type="button"
                onClick={() => useCredit && toggleUseCredit()}
                className={`rounded-2xl border-2 p-3.5 text-left transition ${
                  !useCredit
                    ? "border-[#4663ff] bg-[#eef3ff]"
                    : "border-[#e9edfb] bg-white hover:border-[#b9c6ff]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      !useCredit
                        ? "bg-white text-[#4663ff]"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <Landmark size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#1c2340]">
                      {t("screens.payments.payFromFund")}
                    </p>
                    {!useCredit && (
                      <select
                        value={form.fund_id}
                        onChange={handleFundChange}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1.5 h-9 w-full rounded-lg border border-[#e9edfb] bg-white px-2 text-sm outline-none focus:border-[#4663ff]"
                      >
                        <option value="">{t("ui.selectFund")}</option>
                        {funds?.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} ({formatMoney(f.balance, f)})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </button>

              {/* Credit option */}
              {!isPartner && availableCredit > 0 && (
                <button
                  type="button"
                  onClick={() => !useCredit && toggleUseCredit()}
                  className={`rounded-2xl border-2 p-3.5 text-left transition ${
                    useCredit
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-dashed border-emerald-200 bg-emerald-50/40 hover:border-emerald-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600">
                        <Sparkles size={16} />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-emerald-800">
                          {t("screens.payments.apply_credit")}
                        </p>
                        <p className="text-xs text-emerald-600">
                          {t("screens.payments.credit_available")}:{" "}
                          {money(availableCredit)}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        useCredit
                          ? "border-emerald-600 bg-emerald-600"
                          : "border-emerald-300"
                      }`}
                    >
                      {useCredit && (
                        <div className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </div>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Amount block — the numbers get the most visual weight and room */}
          <div className="rounded-2xl border border-[#e9edfb] bg-[#f8faff] p-4">
            <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">
              {t(
                useCredit
                  ? "screens.payments.amountFromCredit"
                  : "screens.payments.amountToReceive"
              )}
            </label>
            <NumberInput
              value={form.amount_in_base}
              onChange={handleBaseAmountChange}
              className={`mt-1.5 h-14 w-full rounded-2xl border-2 bg-white px-4 text-2xl font-black tabular-nums outline-none transition focus:ring-4 focus:ring-[#4663ff]/10 ${finalRing}`}
              placeholder="0.00"
              disabled={
                !useCredit &&
                (!form.fund_id ||
                  isPurchase ||
                  isSales ||
                  isExpense ||
                  isPurchaseReturn ||
                  isSalesReturn)
              }
              max={useCredit ? availableCredit : null}
            />
            {useCredit && (
              <p className="mt-1.5 text-xs font-semibold text-emerald-600">
                {t("screens.payments.creditCap")}: {money(availableCredit)}
              </p>
            )}

            {/* Currency conversion — horizontal, base -> collected side by
                side with the rate breakdown underneath, so the two amounts
                being compared sit on the same visual line */}
            {!useCredit && form.fund_exchangeRate !== 1 && (
              <div className="mt-4 rounded-2xl border border-dashed border-[#dbe4ff] bg-white p-3.5">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      {t("ui.total") /* base currency label context */}
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[#1c2340]">
                      {money(form.amount_in_base)}
                    </p>
                  </div>
                  <ArrowRight size={16} className="text-slate-300" />
                  <div className="text-center">
                    <label className="text-[10px] font-bold uppercase text-slate-400">
                      {t("screens.payments.collected_paid_amount")}
                    </label>
                    <div className="relative mt-0.5">
                      <NumberInput
                        value={form.collected_amount}
                        onChange={(val) =>
                          handleChange("collected_amount", val)
                        }
                        className="h-9 w-full rounded-lg border border-[#e9edfb] bg-white px-2 pr-8 text-center font-mono text-sm font-bold tabular-nums outline-none focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10 disabled:bg-slate-100"
                        disabled={!form.fund_id}
                      />
                      <Wallet
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-350"
                        size={14}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-between border-t border-[#eef1ff] pt-2 text-xs text-slate-500">
                  <span>
                    {t("screens.ledger.fundRate")}:{" "}
                    <strong className="text-[#1c2340]">
                      {form.fund_exchangeRate}
                    </strong>
                  </span>
                  <span>
                    {t("screens.ledger.effectiveRate")}:{" "}
                    <strong className="text-[#4663ff]">
                      {effectiveRate.toFixed(4)}
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Date + note side by side on wider screens */}
          <div
            className={`grid gap-3 ${showDatePicker ? "sm:grid-cols-2" : "grid-cols-1"}`}
          >
            {showDatePicker && (
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <Calendar size={13} />
                  {t("ui.date")}
                </label>
                <input
                  type="date"
                  value={form.date}
                  min={minDate || undefined}
                  onChange={(e) => handleChange("date", e.target.value)}
                  className="h-11 w-full rounded-2xl border border-[#e9edfb] bg-white px-3 outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10"
                />
                {minDate && (
                  <p className="mt-1 text-xs text-slate-400">
                    {t("screens.payments.dateNotBefore", { date: minDate })}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-500">
                {t("ui.note")}
              </label>
              <textarea
                rows={showDatePicker ? 1 : 2}
                value={form.note}
                onChange={(e) => handleChange("note", e.target.value)}
                className="w-full resize-none rounded-2xl border border-[#e9edfb] bg-white p-3 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10"
                placeholder={t("ui.note")}
              />
            </div>
          </div>

          {message && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center text-sm font-semibold text-amber-700">
              {message}
            </div>
          )}
        </div>

        {/* SUMMARY + CONFIRM */}
        <div className="space-y-3 border-t border-[#e9edfb] bg-[#f8faff] px-6 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-500">
              {isOutflow
                ? t("screens.payments.summaryPaying")
                : t("screens.payments.summaryReceiving")}
            </span>
            <span className={`text-lg font-black ${finalText}`}>
              {money(form.amount_in_base || 0)}
            </span>
          </div>
          <button
            onClick={submit}
            disabled={loading}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${finalSolid}`}
          >
            <Save size={18} />
            {loading
              ? t("common.saving")
              : confirmLabel ||
                (isCollectorMode
                  ? t("common.add")
                  : t("screens.payments.savePayment"))}
          </button>
        </div>
      </div>
    </div>
  );
}
