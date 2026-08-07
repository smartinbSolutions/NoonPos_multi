import React from "react";
import {
  Wallet,
  Save,
  X,
  ArrowRight,
  DollarSign,
  User,
  Building2,
  Users,
} from "lucide-react";
import { formatMoney, normalizeDigits } from "../../../../Global/FormatNumber";
import useAddFundPayment from "../hooks/useAddFundPayment";
import NumberInput from "../../../../Global/NumberInput";

export default function AddFundPayment({
  isOpen,
  onClose,
  mode = "in",
  initialFundId,
  refetchList,
}) {
  const {
    form,
    funds,
    partiesList,
    partyType,
    setPartyType,
    loading,
    message,
    effectiveRate,
    isFundLocked,
    selectedFund,
    selectedParty,
    handleChange,
    handleFundChange,
    handleBaseAmountChange,
    submit,
    money,
    t,
  } = useAddFundPayment({
    isOpen,
    onClose,
    mode,
    initialFundId,
    refetchList,
  });

  if (!isOpen) return null;

  const isCashIn = mode === "in";
  const theme = isCashIn
    ? {
        chip: "bg-green-100 text-green-600",
        btn: "bg-green-600 hover:bg-green-700",
        arrow: "bg-green-100 text-green-600",
      }
    : {
        chip: "bg-red-100 text-red-600",
        btn: "bg-red-600 hover:bg-red-700",
        arrow: "bg-red-100 text-red-600",
      };

  const partyIcon =
    partyType === "customer" ? (
      <User size={16} />
    ) : partyType === "supplier" ? (
      <Building2 size={16} />
    ) : (
      <Users size={16} />
    );

  const partyCard = (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="text-[10px] uppercase  text-gray-400 font-semibold">
        {isCashIn
          ? t("screens.payments.linked_account_type")
          : t("screens.payments.linked_account_type")}
      </div>

      <div className="grid grid-cols-3 gap-1.5 p-1 bg-white rounded-xl text-xs font-semibold border">
        {mode === "in" ? (
          <button
            type="button"
            onClick={() => setPartyType("customer")}
            className={`flex items-center justify-center gap-1 py-2 rounded-lg transition ${partyType === "customer" ? "bg-green-50 text-green-600 shadow-sm" : "text-gray-500"}`}
          >
            <User size={14} />
            {t("screens.payments.customer")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPartyType("supplier")}
            className={`flex items-center justify-center gap-1 py-2 rounded-lg transition ${partyType === "supplier" ? "bg-red-50 text-red-600 shadow-sm" : "text-gray-500"}`}
          >
            <Building2 size={14} />
            {t("screens.payments.supplier")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPartyType("partner")}
          className={`col-span-2 flex items-center justify-center gap-1 py-2 rounded-lg transition ${partyType === "partner" ? "bg-orange-50 text-orange-600 shadow-sm" : "text-gray-500"}`}
        >
          <Users size={14} />
          {t("screens.payments.partner")}
        </button>
      </div>

      <select
        value={form.party_id || ""}
        onChange={(e) => handleChange("party_id", e.target.value)}
        className="w-full h-10 rounded-xl border px-3 bg-white outline-none focus:border-blue-500 text-sm"
        required
      >
        <option value="">
          -- {t("screens.payments.select_name_from_list")} --
        </option>
        {partiesList.length > 0 &&
          partiesList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.phone ? `(${p.phone})` : ""}
            </option>
          ))}
      </select>
    </div>
  );

  const fundCard = (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="text-[10px] uppercase  text-gray-400 font-semibold">
        {t("screens.payments.target_fund")}
      </div>

      {isFundLocked ? (
        <div className="w-full h-10 rounded-xl border px-3 bg-gray-100 text-sm flex items-center text-slate-700 font-medium">
          {selectedFund
            ? `${selectedFund.name} (${formatMoney(selectedFund.balance, selectedFund)})`
            : "…"}
        </div>
      ) : (
        <select
          value={form.fund_id || ""}
          onChange={handleFundChange}
          className="w-full h-10 rounded-xl border px-3 bg-white outline-none focus:border-blue-500 text-sm"
        >
          <option value="">{t("screens.payments.select_fund")}</option>
          {funds?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({formatMoney(f.balance, f)})
            </option>
          ))}
        </select>
      )}

      <div>
        <label className="text-xs font-medium text-gray-600">
          {t("screens.payments.amount_base_currency")}
        </label>
        <div className="relative mt-1">
          <NumberInput
            value={form.amount_in_base || ""}
            onChange={handleBaseAmountChange}
            className="w-full h-10 rounded-xl border px-3 pr-9 bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:bg-gray-100"
            placeholder="0.00"
            disabled={!form.fund_id}
          />
          <DollarSign
            className="absolute right-2.5 top-2.5 text-gray-400"
            size={16}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl border">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-2xl ${theme.chip}`}>{partyIcon}</div>
            <div>
              <h2 className="font-semibold text-gray-800">
                {isCashIn
                  ? t("screens.payments.cash_in_receipt")
                  : t("screens.payments.cash_out_payment")}
              </h2>
              <p className="text-xs text-gray-500">
                {t("screens.payments.free_transaction_outside_invoices")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Horizontal flow expressing the actual movement of cash:
              cash-in -> party is the source, fund is the destination.
              cash-out -> fund is the source, party is the destination. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
            {isCashIn ? partyCard : fundCard}

            <div className="flex h-full items-center justify-center pt-8">
              <div className={`rounded-full p-2 ${theme.arrow}`}>
                <ArrowRight size={18} />
              </div>
            </div>

            {isCashIn ? fundCard : partyCard}
          </div>

          {form.fund_exchangeRate !== 1 && (
            <div>
              <label className="text-sm font-medium text-gray-700">
                {t("screens.payments.actual_amount_fund_currency")}
              </label>
              <div className="relative mt-1">
                <NumberInput
                  value={form.collected_amount || ""}
                  onChange={(val) => handleChange("collected_amount", val)}
                  className="w-full h-11 rounded-xl border px-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  disabled={!form.fund_id}
                />
                <Wallet
                  className="absolute right-3 top-3 text-gray-400"
                  size={18}
                />
              </div>

              {form.fund_id && (
                <div className="mt-1 flex justify-between text-xs text-gray-500 bg-slate-50 p-2 rounded-lg border border-dashed">
                  <span>
                    {t("screens.payments.fund_exchange_rate")}:{" "}
                    <strong>{form.fund_exchangeRate}</strong>
                  </span>
                  <span>
                    {t("screens.payments.effective")}:{" "}
                    <strong className="text-blue-600">
                      {(effectiveRate || 0).toFixed(4)}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-600">
              {t("screens.payments.statement_receipt_details")}
            </label>
            <textarea
              rows={2}
              value={form.note || ""}
              onChange={(e) => handleChange("note", e.target.value)}
              className="w-full rounded-xl border p-2 mt-1 outline-none focus:border-blue-500 shadow-sm"
              placeholder={t("screens.payments.write_explanatory_statement")}
            />
          </div>

          {message && (
            <div className="text-center text-sm font-medium bg-amber-50 text-amber-700 p-2.5 rounded-xl border border-amber-200">
              {message}
            </div>
          )}
        </div>

        <div className="p-5 border-t bg-gray-50">
          <button
            onClick={submit}
            disabled={loading}
            className={`w-full h-11 rounded-xl text-white flex items-center justify-center gap-2 font-medium transition-all ${theme.btn} shadow-md disabled:opacity-50`}
          >
            <Save size={18} />
            {loading
              ? t("screens.payments.posting_and_saving")
              : t("screens.payments.save_and_post_receipt")}
          </button>
        </div>
      </div>
    </div>
  );
}
