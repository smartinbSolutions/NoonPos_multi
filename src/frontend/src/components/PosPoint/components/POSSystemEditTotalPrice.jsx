import React, { useEffect, useState } from "react";
import { X, Check, Plus, Percent, Receipt, StickyNote } from "lucide-react";
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
    tone === "success"
      ? "border-emerald-100 bg-emerald-50/50"
      : "border-red-100 bg-red-50/50";

  return (
    <div className={`space-y-2 rounded-xl border p-3 ${toneClasses}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
          {icon}
          {title}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-1 text-stone-400 transition hover:bg-white hover:text-red-600"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// subtotal here is afterItemDiscounts (the PRE-TAX base the invoice
// discount rate actually multiplies against, matching the hook/backend
// cascade exactly). itemTax is a fixed additive line — already resolved
// per-item, never affected by the invoice-level discount.
const POSSystemEditTotalPrice = ({
  isTotalModalOpen,
  setIsTotalModalOpen,
  subtotal,
  itemTax,
  discountRate,
  setDiscountRate,
  posTaxMode,
  invoiceTaxes,
  addInvoiceTax,
  removeInvoiceTax,
  clearInvoiceTaxes,
  taxes,
  note,
  setNote,
  money,
  t,
}) => {
  const [discountRevealed, setDiscountRevealed] = useState(false);
  const [taxRevealed, setTaxRevealed] = useState(false);
  const [noteRevealed, setNoteRevealed] = useState(false);

  const [totalText, setTotalText] = useState("");
  const [rateText, setRateText] = useState("");
  const [amountText, setAmountText] = useState("");

  const fixedItemTax = Number(itemTax || 0);

  // Sum of all applied invoice-tax rates — used only to compute the
  // combined VALUE below; each tax still applies independently (parallel)
  // to the same afterDiscount base, matching the backend exactly.
  const invoiceTaxRateSum = (invoiceTaxes || []).reduce(
    (sum, t) => sum + Number(t.rate || 0),
    0
  );

  useEffect(() => {
    if (!isTotalModalOpen) return;

    const rate = Number(discountRate || 0);
    const discountAmount = subtotal * (rate / 100);
    const afterDiscount = subtotal - discountAmount;
    const invoiceTaxValue = afterDiscount * (invoiceTaxRateSum / 100);
    const finalTotal = afterDiscount + fixedItemTax + invoiceTaxValue;

    setTotalText(finalTotal.toFixed(2));
    setRateText(rate > 0.005 ? rate.toFixed(2) : "");
    setAmountText(discountAmount > 0.005 ? discountAmount.toFixed(2) : "");
    setDiscountRevealed(rate > 0.005);
    setTaxRevealed((invoiceTaxes || []).length > 0);
    setNoteRevealed(Boolean(note));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTotalModalOpen]);

  if (!isTotalModalOpen) return null;

  const rate = Number(discountRate || 0);
  const discountAmount = subtotal * (rate / 100);
  const afterDiscount = subtotal - discountAmount;
  const invoiceTaxValue = afterDiscount * (invoiceTaxRateSum / 100);
  const finalTotal = afterDiscount + fixedItemTax + invoiceTaxValue;
  const hasDiscount = rate > 0.005;

  // Total is master — solve backward through: total = afterDiscount +
  // fixedItemTax + (afterDiscount * invoiceTaxRateSum/100)
  const handleTotalChange = (value) => {
    setTotalText(value);

    const target = parseFloat(value);
    if (isNaN(target) || subtotal <= 0) return;

    const remainder = target - fixedItemTax;
    const impliedAfterDiscount =
      invoiceTaxRateSum > 0
        ? remainder / (1 + invoiceTaxRateSum / 100)
        : remainder;
    const raw = Math.max(
      0,
      ((subtotal - impliedAfterDiscount) / subtotal) * 100
    );
    const newRate = raw < 0.005 ? 0 : raw;
    const newAmount = subtotal * (newRate / 100);

    setDiscountRate(newRate);
    setRateText(newRate > 0 ? newRate.toFixed(2) : "");
    setAmountText(newAmount > 0 ? newAmount.toFixed(2) : "");
    if (newRate > 0 && !discountRevealed) setDiscountRevealed(true);
  };

  const handleRateChange = (value) => {
    setRateText(value);

    const raw = Math.max(0, parseFloat(value) || 0);
    const newRate = raw < 0.005 ? 0 : raw;
    const newAmount = subtotal * (newRate / 100);
    const newAfterDiscount = subtotal - newAmount;
    const newTax = newAfterDiscount * (invoiceTaxRateSum / 100);

    setDiscountRate(newRate);
    setAmountText(newAmount > 0 ? newAmount.toFixed(2) : "");
    setTotalText((newAfterDiscount + fixedItemTax + newTax).toFixed(2));
  };

  const handleAmountChange = (value) => {
    setAmountText(value);

    const amt = Math.max(0, Number(value) || 0);
    const raw = subtotal > 0 ? (amt / subtotal) * 100 : 0;
    const newRate = raw < 0.005 ? 0 : raw;
    const newAfterDiscount = subtotal - amt;
    const newTax = newAfterDiscount * (invoiceTaxRateSum / 100);

    setDiscountRate(newRate);
    setRateText(newRate > 0 ? newRate.toFixed(2) : "");
    setTotalText((newAfterDiscount + fixedItemTax + newTax).toFixed(2));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl shadow-stone-900/20">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <h3 className="text-base font-black text-stone-950">
            {t("screens.pos.changeTotal")}
          </h3>
          <button
            type="button"
            onClick={() => setIsTotalModalOpen(false)}
            className="rounded-xl p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="my-4 rounded-2xl bg-stone-50 p-4 text-center">
          <p className="text-[11px] font-bold uppercase text-stone-400">
            {t("screens.pos.finalTotal")}
          </p>
          <NumberInput
            value={totalText}
            onChange={handleTotalChange}
            className="mt-1 w-full bg-transparent text-center text-4xl font-black text-teal-700 outline-none"
          />
        </div>

        <div className="space-y-1.5 rounded-xl border border-stone-100 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-stone-500">{t("ui.subtotal")}</span>
            <span dir="ltr" className="font-bold text-stone-800">
              {money(subtotal)}
            </span>
          </div>

          {hasDiscount && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500">
                {t("screens.invoices.invoiceDiscountAmount")}
              </span>
              <span dir="ltr" className="font-bold text-red-500">
                -{money(discountAmount)}
              </span>
            </div>
          )}

          {fixedItemTax > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500">
                {t("screens.invoices.itemTaxTotal", "Item tax")}
              </span>
              <span dir="ltr" className="font-bold text-emerald-600">
                +{money(fixedItemTax)}
              </span>
            </div>
          )}

          {invoiceTaxValue > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500">
                {t("ui.tax")} ({invoiceTaxRateSum}%)
              </span>
              <span dir="ltr" className="font-bold text-emerald-600">
                +{money(invoiceTaxValue)}
              </span>
            </div>
          )}

          <div className="mt-1 flex items-center justify-between border-t border-stone-100 pt-1.5 text-sm">
            <span className="font-black text-stone-700">{t("ui.total")}</span>
            <span dir="ltr" className="font-black text-teal-700">
              {money(finalTotal)}
            </span>
          </div>
        </div>

        {discountRevealed && (
          <div className="mt-3">
            <AdjustmentBlock
              icon={<Percent size={13} className="text-red-500" />}
              tone="danger"
              title={t("screens.invoices.invoiceDiscountRate")}
              onRemove={() => {
                setDiscountRate(0);
                setRateText("");
                setAmountText("");
                setTotalText((subtotal + fixedItemTax).toFixed(2));
                setDiscountRevealed(false);
              }}
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

        {taxRevealed && (
          <div className="mt-3">
            <AdjustmentBlock
              icon={<Receipt size={13} className="text-emerald-600" />}
              tone="success"
              title={t("ui.tax")}
              onRemove={
                posTaxMode === "fixed"
                  ? null
                  : () => {
                      clearInvoiceTaxes();
                      setTaxRevealed(false);
                    }
              }
            >
              {(invoiceTaxes || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {invoiceTaxes.map((tax) => (
                    <span
                      key={tax.id}
                      className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 shadow-sm"
                    >
                      {tax.name} ({tax.rate}%)
                      {posTaxMode !== "fixed" && (
                        <button
                          type="button"
                          onClick={() => removeInvoiceTax(tax.id)}
                          className="rounded p-0.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {posTaxMode === "fixed" ? (
                <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600/80">
                  <Receipt size={11} />
                  {t(
                    "screens.pos.taxLockedByOwner",
                    "Set by the business owner — cannot be changed here"
                  )}
                </p>
              ) : (
                <select
                  className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm font-bold outline-none focus:border-emerald-400"
                  value=""
                  onChange={(e) => {
                    const selected = taxes?.find(
                      (tx) => tx.id === Number(e.target.value)
                    );
                    if (selected) addInvoiceTax(selected);
                  }}
                >
                  <option value="">
                    {t("screens.invoices.addAnotherTax", "Add another tax")}
                  </option>
                  {taxes
                    ?.filter(
                      (tx) =>
                        (tx.category === "invoice" || tx.category === "both") &&
                        !(invoiceTaxes || []).some(
                          (applied) => applied.id === tx.id
                        )
                    )
                    .map((tx) => (
                      <option key={tx.id} value={tx.id}>
                        {tx.name} ({tx.rate}%)
                      </option>
                    ))}
                </select>
              )}
            </AdjustmentBlock>
          </div>
        )}

        {noteRevealed && (
          <div className="mt-3">
            <AdjustmentBlock
              icon={<StickyNote size={13} className="text-amber-500" />}
              tone="success"
              title={t("screens.invoices.invoiceNote")}
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

        <div className="mt-3">
          <AddOptionsMenu
            options={[
              { key: "label", label: t("common.add", "Add") },
              {
                key: "discount",
                label: t("screens.invoices.addInvoiceDiscount"),
                icon: <Percent size={13} className="text-red-500" />,
                visible: !discountRevealed,
                onClick: () => setDiscountRevealed(true),
              },
              {
                key: "tax",
                label: t("screens.invoices.addInvoiceTax"),
                icon: <Receipt size={13} className="text-emerald-600" />,
                visible: !taxRevealed && posTaxMode !== "fixed",
                onClick: () => setTaxRevealed(true),
              },
              {
                key: "note",
                label: t("screens.invoices.addInvoiceNote"),
                icon: <StickyNote size={13} className="text-amber-500" />,
                visible: !noteRevealed,
                onClick: () => setNoteRevealed(true),
              },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={() => setIsTotalModalOpen(false)}
          className="mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-teal-600 text-sm font-bold text-white hover:bg-teal-700 transition"
        >
          <Check size={16} />
          {t("common.done", "Done")}
        </button>
      </div>
    </div>
  );
};

export default POSSystemEditTotalPrice;
