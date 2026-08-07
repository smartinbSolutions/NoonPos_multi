import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Search,
  X,
  Wallet,
  Calendar,
  PlusCircle,
  MinusCircle,
} from "lucide-react";
import { normalizeDigits } from "../../../../Global/FormatNumber";
import NumberInput from "../../../../Global/NumberInput";

/**
 * Header for FundList — same visual/interaction pattern as ContactListHeader
 * (title/subtitle/search row + "New" button opening a portal-rendered modal),
 * but kept as its own component since funds have their own create-form shape
 * (name + currency select + initial balance) instead of name/phone/address.
 *
 * Opening balance is entered as a plain magnitude (always >= 0) plus a
 * separate increase/decrease direction toggle — same pattern as the
 * partner opening balance in ContactListHeader — rather than relying on
 * the user typing a negative number to signal "starts in deficit."
 *
 * Same assumption as ContactListHeader: `onSubmit` is awaited and the modal
 * closes unless it resolves to `false`.
 */

const defaultOpeningDate = () => `${new Date().getFullYear()}-01-01`;

const FundListHeader = ({
  eyebrow,
  title,
  subtitle,
  accountCount,
  accountsLabel,
  search,
  onSearchChange,
  searchPlaceholder,

  // create form fields
  createTitle,
  createSubtitle,
  draft,
  setDraft,
  currencies,
  onSubmit,
  saving,
  actionError,
  setActionError,
  submitLabel,

  t,
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const openModal = () => {
    setActionError?.("");
    setModalOpen(true);
  };

  const inputClass =
    "rounded-xl border border-[#dbe4ff] bg-white/90 px-4 py-2.5 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";
  const primaryButtonClass =
    "flex items-center justify-center gap-2 rounded-xl bg-[#4663ff] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:opacity-50";

  const initialBalance = Number(draft.initial_balance || 0);
  const hasOpeningBalance = initialBalance !== 0;
  const isIncrease = draft.balance_type !== "decrease";

  // Default the opening-balance date to Jan 1 of the current year the
  // moment the modal opens, if it isn't already set.
  useEffect(() => {
    if (modalOpen && !draft.date) {
      setDraft((prev) => ({ ...prev, date: defaultOpeningDate() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  // Default the direction to "increase" the moment the modal opens, so the
  // buttons have a sensible active state before the user touches anything.
  useEffect(() => {
    if (modalOpen && !draft.balance_type) {
      setDraft((prev) => ({ ...prev, balance_type: "increase" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await onSubmit(e);
    if (result !== false) {
      setModalOpen(false);
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4"
      // onClick={() => setModalOpen(false)}
    >
      <div
        className="relative w-full max-w-lg rounded-[28px] border border-white/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(70,99,255,0.25)] backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setModalOpen(false)}
          className="absolute -top-3 -right-3 z-10 rounded-full bg-white p-1.5 text-slate-500 shadow-md hover:bg-slate-50 hover:text-slate-700"
          title={t("common.close") || "Close"}
        >
          <X size={16} />
        </button>

        <h3 className="mb-1 text-lg font-black text-slate-950">
          {createTitle}
        </h3>
        <p className="mb-5 text-sm text-slate-500">{createSubtitle}</p>

        {actionError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {actionError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            required
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={`w-full ${inputClass}`}
            placeholder={t("screens.funds.namePlaceholder")}
          />

          <select
            required
            value={draft.currency_id || ""}
            onChange={(e) => {
              const selected = currencies.find(
                (c) => c.id === Number(e.target.value)
              );

              setDraft({
                ...draft,
                currency_id: selected?.id || "",
                currency_code: selected?.code || "",
                exchange_rate: selected?.exchangeRate || 1,
              });
            }}
            className={`w-full ${inputClass}`}
          >
            <option value="">{t("ui.selectCurrency")}</option>
            {currencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>

          {/* Opening balance card */}
          <div className="rounded-2xl border border-dashed border-[#dbe4ff] bg-[#f8faff] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#4663ff] shadow-sm">
                <Wallet size={15} />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-700">
                  {t("screens.funds.initialBalance")}
                </p>
                <p className="text-xs text-slate-400">
                  {t("screens.funds.initialBalanceHelper") ||
                    "Optional — only if this fund already has money in it"}
                </p>
              </div>
            </div>
            <NumberInput
              value={draft.initial_balance || ""}
              onChange={(val) => setDraft({ ...draft, initial_balance: val })}
              className={`w-full ${inputClass} bg-white`}
              placeholder="0.00"
            />

            {hasOpeningBalance && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, balance_type: "increase" })
                  }
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 transition ${
                    isIncrease
                      ? "border-green-400 bg-green-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <PlusCircle
                    size={26}
                    className={isIncrease ? "text-green-600" : "text-gray-400"}
                  />
                  <span
                    className={`text-xs font-bold text-center leading-tight ${
                      isIncrease ? "text-green-700" : "text-gray-500"
                    }`}
                  >
                    {t("screens.funds.startsWithMoney") || "Starts with money"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, balance_type: "decrease" })
                  }
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 transition ${
                    !isIncrease
                      ? "border-red-400 bg-red-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <MinusCircle
                    size={26}
                    className={!isIncrease ? "text-red-600" : "text-gray-400"}
                  />
                  <span
                    className={`text-xs font-bold text-center leading-tight ${
                      !isIncrease ? "text-red-700" : "text-gray-500"
                    }`}
                  >
                    {t("screens.funds.startsInDeficit") || "Starts in deficit"}
                  </span>
                </button>
              </div>
            )}

            {hasOpeningBalance && (
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Calendar size={12} />
                  {t("screens.funds.balanceAsOf") || "As of date"}
                </label>
                <input
                  type="date"
                  value={draft.date || defaultOpeningDate()}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  className={`w-full ${inputClass} bg-white`}
                />
              </div>
            )}
          </div>

          <button disabled={saving} className={`w-full ${primaryButtonClass}`}>
            <Plus size={16} />
            {submitLabel}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between gap-4 p-6 pb-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase  text-[#4663ff]">
            {eyebrow}
          </p>
          <h2 className="text-2xl font-black text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={16}
            />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className={`${inputClass} pl-9`}
            />
          </div>

          <button onClick={openModal} className={primaryButtonClass}>
            <Plus size={15} />
            {t("common.create")}
          </button>
        </div>
      </div>

      {modalOpen && createPortal(modal, document.body)}
    </>
  );
};

export default FundListHeader;
