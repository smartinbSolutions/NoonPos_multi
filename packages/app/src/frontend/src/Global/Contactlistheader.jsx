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
  Info,
} from "lucide-react";
import { normalizeDigits } from "./FormatNumber";
import NumberInput from "./NumberInput";
import TagPickerField from "../components/Tags/components/TagPickerField";

const defaultOpeningDate = () => `${new Date().getFullYear()}-01-01`;

const ContactListHeader = ({
  eyebrow,
  title,
  subtitle,
  search,
  onSearchChange,
  searchPlaceholder,
  createTitle,
  createSubtitle,
  draft,
  setDraft,
  onSubmit,
  saving,
  actionError,
  submitLabel,
  type,
  t,
  remainingPercentage,
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const inputClass =
    "rounded-xl border border-[#dbe4ff] bg-white/90 px-3 py-2 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";
  const primaryButtonClass =
    "flex items-center justify-center gap-2 rounded-xl bg-[#4663ff] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:opacity-50";

  const hasOpeningBalance = Number(draft.opening_balance || 0) !== 0;
  const isDebit = draft.balance_type !== "decrease";

  useEffect(() => {
    if (modalOpen && !draft.date) {
      setDraft((prev) => ({ ...prev, date: defaultOpeningDate() }));
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

  // What this balance actually MEANS, in plain language, per contact type.
  // Partner picks a direction; customer/supplier direction is fixed by the
  // backend (always "increase"), so we just explain what that means instead
  // of offering a choice that wouldn't do anything.
  const meaning = {
    customer: {
      fixed: true,
      icon: <PlusCircle size={20} />,
      color: "text-green-600 bg-green-50 border-green-200",
      text:
        t("screens.contacts.customerOwesYou") ||
        "This customer owes you this amount",
    },
    supplier: {
      fixed: true,
      icon: <MinusCircle size={20} />,
      color: "text-red-600 bg-red-50 border-red-200",
      text:
        t("screens.contacts.youOweSupplier") ||
        "You owe this supplier this amount",
    },
    partner: {
      fixed: false,
    },
  }[type] || {
    fixed: true,
    icon: <Info size={20} />,
    color: "text-slate-600 bg-slate-50 border-slate-200",
    text: "",
  };

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4">
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

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={`w-full ${inputClass}`}
            placeholder={t("ui.name")}
          />

          <input
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            className={`w-full ${inputClass}`}
            placeholder={t("ui.phone")}
          />

          <input
            value={draft.address}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            className={`w-full ${inputClass}`}
            placeholder={t("ui.address")}
          />

          {type === "partner" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">
                {t("ui.percentage")}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={draft.percentage || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    percentage: normalizeDigits(e.target.value),
                  })
                }
                className={`w-full ${inputClass}`}
                placeholder="0"
              />
              <p className="text-[11px] text-slate-400">
                {t("screens.contacts.maxPercentageAllowed", {
                  value: remainingPercentage,
                }) || `Max allowed: ${remainingPercentage}%`}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <TagPickerField
              scope={type}
              entityType={type}
              entityId={null}
              selectedIds={draft.tagIds || []}
              onChange={(ids) => setDraft({ ...draft, tagIds: ids })}
            />
          </div>

          {/* Opening balance card */}
          <div className="rounded-2xl border border-dashed border-[#dbe4ff] bg-[#f8faff] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#4663ff] shadow-sm">
                <Wallet size={15} />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-700">
                  {t("ui.opening_balance")}
                </p>
                <p className="text-xs text-slate-400">
                  {t("screens.contacts.openingBalanceHelper") ||
                    "Optional — only if this contact has a starting balance"}
                </p>
              </div>
            </div>

            <NumberInput
              value={draft.opening_balance}
              onChange={(val) => setDraft({ ...draft, opening_balance: val })}
              className={`w-full ${inputClass} bg-white`}
              placeholder="0.00"
            />

            {hasOpeningBalance && meaning.fixed && (
              <div
                className={`flex items-center gap-3 rounded-xl border p-3 ${meaning.color}`}
              >
                {meaning.icon}
                <p className="text-sm font-semibold">{meaning.text}</p>
              </div>
            )}

            {hasOpeningBalance && !meaning.fixed && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, balance_type: "increase" })
                  }
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 transition ${
                    isDebit
                      ? "border-green-400 bg-green-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <PlusCircle
                    size={26}
                    className={isDebit ? "text-green-600" : "text-gray-400"}
                  />
                  <span
                    className={`text-xs font-bold text-center leading-tight ${
                      isDebit ? "text-green-700" : "text-gray-500"
                    }`}
                  >
                    {t("screens.contacts.theyOweYou") || "They owe you"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, balance_type: "decrease" })
                  }
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 transition ${
                    !isDebit
                      ? "border-red-400 bg-red-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <MinusCircle
                    size={26}
                    className={!isDebit ? "text-red-600" : "text-gray-400"}
                  />
                  <span
                    className={`text-xs font-bold text-center leading-tight ${
                      !isDebit ? "text-red-700" : "text-gray-500"
                    }`}
                  >
                    {t("screens.contacts.youOweThem") || "You owe them"}
                  </span>
                </button>
              </div>
            )}

            {hasOpeningBalance && (
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Calendar size={12} />
                  {t("screens.contacts.balanceAsOf") || "As of date"}
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
            <Plus size={15} />
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

          <button
            onClick={() => setModalOpen(true)}
            className={primaryButtonClass}
          >
            <Plus size={15} />
            {t("common.create") || "New"}
          </button>
        </div>
      </div>

      {modalOpen && createPortal(modal, document.body)}
    </>
  );
};

export default ContactListHeader;
