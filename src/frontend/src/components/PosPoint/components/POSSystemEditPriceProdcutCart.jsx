import { Check, X, Plus, Percent, StickyNote, Receipt } from "lucide-react";
import React, { useEffect, useState } from "react";
import { normalizeDigits } from "../../../Global/FormatNumber";
import NumberInput from "../../../Global/NumberInput";

function AddOptionsMenu({ options }) {
  const [open, setOpen] = useState(false);
  const visibleOptions = options.filter((o) => o.visible);

  if (!visibleOptions.length) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 text-xs font-bold text-stone-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
      >
        <Plus size={13} />
        {options.find((o) => o.key === "label")?.label}
      </button>

      {open && (
        <div className="absolute start-0 top-full z-10 mt-1.5 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          {visibleOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                opt.onClick();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-xs font-bold text-stone-700 transition hover:bg-stone-50"
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AdjustmentBlock({ icon, tone, title, onRemove, children }) {
  const toneClasses =
    tone === "danger"
      ? "border-red-100 bg-red-50/50"
      : tone === "note"
        ? "border-amber-100 bg-amber-50/50"
        : "border-stone-100 bg-stone-50/50";

  return (
    <div className={`space-y-2 rounded-xl border p-3 ${toneClasses}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
          {icon}
          {title}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg p-1 text-stone-400 transition hover:bg-white hover:text-red-600"
        >
          <X size={13} />
        </button>
      </div>
      {children}
    </div>
  );
}

const POSSystemEditPriceProdcutCart = ({
  setIsPriceModalOpen,
  t,
  newPrice,
  setNewPrice,
  discountRate,
  setDiscountRate,
  note,
  setNote,
  handleSavePrice,
  editingItem,
  isPriceModalOpen,
  money,
}) => {
  const [originalPrice, setOriginalPrice] = useState(0);
  const [discountRevealed, setDiscountRevealed] = useState(false);
  const [noteRevealed, setNoteRevealed] = useState(false);
  const [rateText, setRateText] = useState("");
  const [amountText, setAmountText] = useState("");

  useEffect(() => {
    if (!editingItem) return;

    const taxRate = Number(editingItem.tax_rate || 0);
    const qty = Number(editingItem.qty || 1);
    const catalogPrice = Number(editingItem.catalog_price ?? editingItem.price);
    const catalogInclusive =
      taxRate > 0 ? catalogPrice * (1 + taxRate / 100) : catalogPrice;
    const catalogLineTotal = catalogInclusive * qty;

    const rate = Number(editingItem.discount_rate || 0);
    const amount = catalogLineTotal * (rate / 100);

    setOriginalPrice(catalogLineTotal);
    setRateText(rate > 0 ? rate.toFixed(2) : "");
    setAmountText(amount > 0 ? amount.toFixed(2) : "");
    setDiscountRevealed(rate > 0);
    setNoteRevealed(Boolean(editingItem.description));
  }, [editingItem?.id]);

  if (!isPriceModalOpen) return null;

  const taxRate = Number(editingItem?.tax_rate || 0);
  const hasTax = Boolean(editingItem?.tax_id) && taxRate > 0;
  const currentPrice = Number(newPrice || 0);
  const displayRate =
    originalPrice > 0
      ? Math.max(0, ((originalPrice - currentPrice) / originalPrice) * 100)
      : 0;

  const handlePriceChange = (value) => {
    setNewPrice(value);

    const target = parseFloat(value);
    if (isNaN(target) || originalPrice <= 0) return;

    const raw = Math.max(0, ((originalPrice - target) / originalPrice) * 100);
    const impliedRate = raw < 0.005 ? 0 : raw;
    const impliedAmount = originalPrice - target;

    setDiscountRate(impliedRate);
    setRateText(impliedRate > 0 ? impliedRate.toFixed(2) : "");
    setAmountText(impliedAmount > 0.005 ? impliedAmount.toFixed(2) : "");
    if (impliedRate > 0 && !discountRevealed) setDiscountRevealed(true);
  };

  const handleRateChange = (value) => {
    setRateText(value);

    const rate = Math.max(0, parseFloat(value) || 0);
    const amount = originalPrice * (rate / 100);
    const price = originalPrice - amount;

    setDiscountRate(rate);
    setAmountText(amount > 0 ? amount.toFixed(2) : "");
    setNewPrice(price.toFixed(2));
  };

  const handleAmountChange = (value) => {
    setAmountText(value);

    const amount = Math.max(0, Number(value) || 0);
    const rate = originalPrice > 0 ? (amount / originalPrice) * 100 : 0;
    const price = originalPrice - amount;

    setDiscountRate(rate);
    setRateText(rate > 0 ? rate.toFixed(2) : "");
    setNewPrice(price.toFixed(2));
  };

  const handleRemoveDiscount = () => {
    setDiscountRate(0);
    setRateText("");
    setAmountText("");
    setNewPrice(originalPrice.toFixed(2));
    setDiscountRevealed(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl shadow-stone-900/20">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <h3 className="max-w-[80%] truncate text-base font-black text-stone-950">
            {editingItem?.name}
          </h3>
          <button
            type="button"
            onClick={() => setIsPriceModalOpen(false)}
            className="rounded-xl p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {hasTax && (
          <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700">
            <Receipt size={12} />
            {t("screens.pos.taxIncluded", "incl. {{rate}}% tax", {
              rate: taxRate,
            })}
          </div>
        )}

        {/* PRICE — big, centered, the dominant element in the modal */}
        <div className="my-5 text-center">
          <label className="mb-2 block text-xs font-bold uppercase text-stone-400">
            {t("screens.pos.editPrice", "Edit Price")}
          </label>
          <NumberInput
            value={newPrice}
            onChange={handlePriceChange}
            className="w-full bg-transparent text-center text-5xl font-black text-teal-700 outline-none placeholder:text-stone-300"
            placeholder="0.00"
            autoFocus
          />
        </div>

        {displayRate > 0 && (
          <div className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs">
            <span dir="ltr" className="text-stone-500 line-through">
              {money(originalPrice)}
            </span>
            <span dir="ltr" className="font-bold text-red-500">
              -{displayRate.toFixed(1)}%
            </span>
          </div>
        )}

        {discountRevealed && (
          <div className="mb-3">
            <AdjustmentBlock
              icon={<Percent size={13} className="text-red-500" />}
              tone="danger"
              title={t("screens.invoices.itemDiscountAt", {
                rate: displayRate.toFixed(1),
              })}
              onRemove={handleRemoveDiscount}
            >
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <NumberInput
                    value={rateText}
                    onChange={handleRateChange}
                    max={100}
                    className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2 pe-6 text-sm font-bold outline-none focus:border-red-400"
                    placeholder="0"
                  />
                  <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-stone-400">
                    %
                  </span>
                </div>
                <span className="text-xs text-stone-300">=</span>
                <NumberInput
                  value={amountText}
                  onChange={handleAmountChange}
                  className="h-9 flex-1 rounded-lg border border-stone-200 bg-white px-2 text-sm font-bold outline-none focus:border-red-400"
                  placeholder="0.00"
                />
              </div>
            </AdjustmentBlock>
          </div>
        )}

        {noteRevealed && (
          <div className="mb-3">
            <AdjustmentBlock
              icon={<StickyNote size={13} className="text-amber-500" />}
              tone="note"
              title={t("screens.invoices.notePlaceholder")}
              onRemove={() => {
                setNote("");
                setNoteRevealed(false);
              }}
            >
              <textarea
                className="min-h-[2.5rem] w-full resize-none rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                value={note || ""}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("screens.invoices.notePlaceholder")}
                rows={2}
              />
            </AdjustmentBlock>
          </div>
        )}

        <div className="flex justify-center">
          <AddOptionsMenu
            options={[
              { key: "label", label: t("common.add", "Add") },
              {
                key: "discount",
                label: t("screens.invoices.addDiscount"),
                icon: <Percent size={13} className="text-red-500" />,
                visible: !discountRevealed,
                onClick: () => setDiscountRevealed(true),
              },
              {
                key: "note",
                label: t("screens.invoices.addNote"),
                icon: <StickyNote size={13} className="text-amber-500" />,
                visible: !noteRevealed,
                onClick: () => setNoteRevealed(true),
              },
            ]}
          />
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setIsPriceModalOpen(false)}
            className="h-11 flex-1 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-700 transition hover:bg-stone-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSavePrice}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-600 text-sm font-bold text-white transition hover:bg-teal-700"
          >
            <Check size={16} />
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default POSSystemEditPriceProdcutCart;
