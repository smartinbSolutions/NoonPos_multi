import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Wallet, Calendar, PlusCircle } from "lucide-react";
import NumberInput from "../../../../Global/NumberInput";

const defaultOpeningDate = () => `${new Date().getFullYear()}-01-01`;

export default function CustomerFormModal({
  open,
  onClose,
  draft,
  setDraft,
  onSubmit,
  saving,
  actionError,
  t,
}) {
  useEffect(() => {
    if (open && !draft.date) {
      setDraft((prev) => ({
        ...prev,
        date: defaultOpeningDate(),
      }));
    }
  }, [open]);

  if (!open) return null;

  const inputClass =
    "w-full rounded-xl border border-[#dbe4ff] bg-white/90 px-3 py-2 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";

  const primaryButtonClass =
    "flex w-full items-center justify-center gap-2 rounded-xl bg-[#4663ff] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:opacity-50";

  const hasOpeningBalance = Number(draft.opening_balance || 0) !== 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const result = await onSubmit(e);

    if (result !== false) {
      onClose();
    }
  };

  const meaning = hasOpeningBalance && (
    <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-3 text-green-700">
      <PlusCircle size={20} />
      <p className="text-sm font-semibold">
        {t("screens.contacts.customerOwesYou") ||
          "This customer owes you this amount"}
      </p>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4">
      <div
        className="relative w-full max-w-lg rounded-[28px] border border-white/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(70,99,255,0.25)] backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 rounded-full bg-white p-2 shadow hover:bg-slate-100"
        >
          <X size={16} />
        </button>

        <h3 className="mb-1 text-xl font-black">
          {t("screens.contacts.addCustomer")}
        </h3>

        <p className="mb-5 text-sm text-slate-500">
          {t("screens.contacts.createCustomerDescription")}
        </p>

        {actionError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {actionError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            value={draft.name}
            onChange={(e) =>
              setDraft({
                ...draft,
                name: e.target.value,
              })
            }
            className={inputClass}
            placeholder={t("ui.name")}
          />

          <input
            value={draft.phone}
            onChange={(e) =>
              setDraft({
                ...draft,
                phone: e.target.value,
              })
            }
            className={inputClass}
            placeholder={t("ui.phone")}
          />

          <input
            value={draft.address}
            onChange={(e) =>
              setDraft({
                ...draft,
                address: e.target.value,
              })
            }
            className={inputClass}
            placeholder={t("ui.address")}
          />

          <div className="space-y-3 rounded-2xl border border-dashed border-[#dbe4ff] bg-[#f8faff] p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#4663ff] shadow-sm">
                <Wallet size={15} />
              </span>

              <div>
                <p className="text-sm font-bold">{t("ui.opening_balance")}</p>

                <p className="text-xs text-slate-500">
                  {t("screens.contacts.openingBalanceHelper")}
                </p>
              </div>
            </div>

            <NumberInput
              value={draft.opening_balance}
              onChange={(val) => setDraft({ ...draft, opening_balance: val })}
              className={inputClass}
              placeholder="0.00"
            />

            {meaning}

            {hasOpeningBalance && (
              <div>
                <label className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Calendar size={12} />
                  {t("screens.contacts.balanceAsOf")}
                </label>

                <input
                  type="date"
                  value={draft.date || defaultOpeningDate()}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      date: e.target.value,
                    })
                  }
                  className={inputClass}
                />
              </div>
            )}
          </div>

          <button disabled={saving} className={primaryButtonClass}>
            <Plus size={16} />

            {saving ? t("common.saving") : t("screens.contacts.addCustomer")}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
