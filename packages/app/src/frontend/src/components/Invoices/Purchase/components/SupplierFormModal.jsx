import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Wallet, Calendar, MinusCircle } from "lucide-react";
import NumberInput from "../../../../Global/NumberInput";

const defaultOpeningDate = () => `${new Date().getFullYear()}-01-01`;

export default function SupplierFormModal({
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
    "w-full rounded-xl border border-[#dbe4ff] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";

  const buttonClass =
    "flex w-full items-center justify-center gap-2 rounded-xl bg-[#4663ff] px-4 py-2 font-bold text-white transition hover:bg-[#3854e8] disabled:opacity-50";

  const hasOpeningBalance = Number(draft.opening_balance || 0) !== 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const res = await onSubmit(e);

    if (res !== false) {
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
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

        <h2 className="text-xl font-black">
          {t("screens.contacts.createSupplier")}
        </h2>

        <p className="mb-6 text-sm text-slate-500">
          {t("screens.contacts.addSupplierContact")}
        </p>

        {actionError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-red-600">
            {actionError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            value={draft.name}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                name: e.target.value,
              }))
            }
            className={inputClass}
            placeholder={t("ui.name")}
          />

          <input
            value={draft.phone}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                phone: e.target.value,
              }))
            }
            className={inputClass}
            placeholder={t("ui.phone")}
          />

          <input
            value={draft.address}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                address: e.target.value,
              }))
            }
            className={inputClass}
            placeholder={t("ui.address")}
          />

          <div className="space-y-3 rounded-2xl border border-dashed border-[#dbe4ff] bg-[#f8faff] p-4">
            <div className="flex items-center gap-2">
              <Wallet className="text-[#4663ff]" size={18} />
              <div>
                <div className="font-bold">{t("ui.opening_balance")}</div>
                <div className="text-xs text-slate-500">
                  {t("screens.contacts.openingBalanceHelper")}
                </div>
              </div>
            </div>

            <NumberInput
              value={draft.opening_balance}
              onChange={(val) =>
                setDraft((p) => ({ ...p, opening_balance: val }))
              }
              className={inputClass}
              placeholder="0"
            />

            {/* Direction is a fixed accounting convention (you owe the
                supplier), not a user choice — see CustomerFormModal for the
                mirrored "this customer owes you" fixed messaging. */}
            {hasOpeningBalance && (
              <>
                <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
                  <MinusCircle size={20} />
                  <p className="text-sm font-semibold">
                    {t("screens.contacts.youOweSupplier") ||
                      "You owe this supplier this amount"}
                  </p>
                </div>

                <div>
                  <label className="mb-1 flex items-center gap-2 text-xs font-semibold">
                    <Calendar size={13} />
                    {t("screens.contacts.balanceAsOf")}
                  </label>

                  <input
                    type="date"
                    value={draft.date || defaultOpeningDate()}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        date: e.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
              </>
            )}
          </div>

          <button disabled={saving} className={buttonClass}>
            <Plus size={16} />
            {t("screens.contacts.addSupplier")}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
