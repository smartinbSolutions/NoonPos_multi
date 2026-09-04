import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Undo2,
  AlertCircle,
  HandCoins,
  Save,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast, ToastContainer } from "react-toastify";
import useSalesReturn from "../hooks/useSalesReturn";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import FormattedDate from "../../../../Global/FormattedDate";
import { normalizeDigits } from "../../../../Global/FormatNumber";
import AddPayment from "../../../Cash/Payment/components/AddPayment";
import NumberInput from "../../../../Global/NumberInput";
import TagPickerField from "../../../Tags/components/TagPickerField";

const panelClass =
  "relative overflow-hidden rounded-2xl border border-[#e9edfb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const panelBodyClass = "p-4";

function AccentRule({ colorClass }) {
  return <div className={`absolute inset-x-0 top-0 h-[3px] ${colorClass}`} />;
}

export default function SalesReturnPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    invoice,
    items,
    note,
    setNote,
    updateQuantity,
    returnAll,
    clearAll,
    subtotal,
    itemDiscountTotal,
    itemTaxTotal,
    invoiceDiscount,
    afterInvoiceDiscount,
    invoiceTaxValue,
    netTotal,
    invoiceDiscountRate,
    invoiceTaxRate,
    invoiceTaxes,
    loading,
    saving,
    error,
    tagIds,
    setTagIds,
    submit,
  } = useSalesReturn();
  const { money } = usePrimaryCurrency();

  const [refundModalOpen, setRefundModalOpen] = useState(false);

  const hasSelection = items.some((i) => Number(i.returnUnitQuantity) > 0);

  const handleSaveWithoutRefund = async () => {
    if (!hasSelection) return;
    const res = await submit();
    if (res?.success) {
      toast.success(t("screens.salesReturn.savedWithoutRefund"));
    }
  };

  const handleOpenRefundModal = () => {
    if (!hasSelection) return;
    setRefundModalOpen(true);
  };

  // Collector mode (invoice={null} passed to AddPayment — distinct from
  // this page's own `invoice`, which is the ORIGINAL sales invoice) —
  // AddPayment hands back paymentData instead of calling createPayment
  // itself, same pattern as AddPurchase/PurchaseReturnPage.
  const handleRefundCollected = async (paymentData) => {
    const res = await submit(paymentData);
    if (res?.success) {
      toast.success(t("screens.salesReturn.savedWithRefund"));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8fd] text-sm font-bold text-slate-400">
        {t("common.loading")}
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8fd] p-6 text-sm font-bold text-red-500">
        {t("screens.invoices.notFound")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8fd] p-5 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="flex flex-col gap-3 rounded-2xl border border-[#e9edfb] bg-white px-5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500 text-white shadow-md shadow-rose-500/25">
              <Undo2 size={18} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-rose-600">
                {t("ui.createSalesReturn")}
              </p>
              <h1 className="text-lg font-black leading-tight text-slate-950">
                {t("ui.invoice")} #{invoice.id}
              </h1>
              <p className="text-xs text-slate-500">
                {invoice.customer_name || t("screens.pos.walkInCustomer")} ·{" "}
                <FormattedDate value={invoice.date} />
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
          >
            <ArrowLeft size={14} />
            {t("common.back")}
          </button>
        </section>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <main className="space-y-4">
            <section className={panelClass}>
              <AccentRule colorClass="bg-rose-500" />
              <div className="flex items-center justify-between gap-3 border-b border-[#eef1ff] px-4 py-3">
                <h2 className="text-[13px] font-black text-slate-900">
                  {t("ui.items")}
                </h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={clearAll}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
                  >
                    {t("common.clear")}
                  </button>
                  <button
                    type="button"
                    onClick={returnAll}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-500 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-rose-600"
                  >
                    {t("ui.returnAll")}
                  </button>
                </div>
              </div>

              <div className="divide-y divide-[#eef1ff]">
                {items.map((item) => {
                  const unitLabel = item.unit_name || t("ui.unit");
                  const factor = Number(item.unit_conversion_factor || 1);
                  const soldInUnit =
                    factor > 0
                      ? Number(item.quantity || 0) / factor
                      : Number(item.quantity || 0);
                  const lineBaseQty =
                    Number(item.returnUnitQuantity || 0) * factor;
                  const lineTotal = lineBaseQty * Number(item.price || 0);

                  return (
                    <div key={item.id} className="space-y-1.5 p-3.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {item.name ||
                              `${t("ui.product")} #${item.product_id}`}
                          </p>
                          {item.product_code && (
                            <p className="text-[11px] font-semibold text-slate-400">
                              #{item.product_code}
                            </p>
                          )}
                          <p className="text-[11px] font-semibold text-slate-400">
                            {t("ui.soldQty")}: {soldInUnit} {unitLabel} · ·{" "}
                            {t("ui.price")}: {money(item.price)}
                            {item.tax_rate > 0 &&
                              ` · ${t("ui.tax")} ${item.tax_rate}%`}
                            {item.discount_rate > 0 &&
                              ` · ${t("ui.discount")} ${item.discount_rate}%`}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {t("ui.available")}
                          </p>
                          <p className="text-sm font-black tabular-nums text-slate-700">
                            {item.available_unit_quantity} {unitLabel}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-32">
                          <label className="mb-1 block text-[11px] font-bold text-slate-400">
                            {t("ui.returnQty")} ({unitLabel})
                          </label>
                          <NumberInput
                            value={
                              item.returnUnitQuantity === 0
                                ? ""
                                : item.returnUnitQuantity
                            }
                            placeholder="0"
                            disabled={Number(item.available_unit_quantity) <= 0}
                            onChange={(val) => updateQuantity(item.id, val)}
                            max={Number(item.available_unit_quantity || 0)}
                            className="h-9 w-full rounded-xl border border-[#e1e7fb] bg-white px-3 text-center text-sm font-bold text-slate-900 outline-none focus:border-rose-400 focus:ring-[3px] focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
                          />
                        </div>

                        <div className="flex-1 text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {t("ui.total")}
                          </p>
                          <p className="text-sm font-black tabular-nums text-rose-600">
                            {money(lineTotal)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={panelClass}>
              <AccentRule colorClass="bg-slate-300" />
              <div className={panelBodyClass}>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                  {t("screens.salesReturn.returnNotes")}
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("screens.salesReturn.returnNotePlaceholder")}
                  className="w-full resize-none rounded-xl border border-[#e1e7fb] bg-white p-2.5 text-sm outline-none focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12"
                />
              </div>
            </section>

            <section className={panelClass}>
              <AccentRule colorClass="bg-pink-500" />
              <div className={panelBodyClass}>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                  {t("screens.tags.title")}
                </label>
                <TagPickerField
                  scope="sales_return"
                  entityType="sales_return"
                  entityId={null}
                  selectedIds={tagIds}
                  onChange={setTagIds}
                />
              </div>
            </section>
          </main>

          <aside className="space-y-4">
            <section className={panelClass}>
              <AccentRule colorClass="bg-emerald-500" />
              <div className={panelBodyClass}>
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <HandCoins size={15} />
                  </span>
                  <h3 className="text-[13px] font-black text-slate-950">
                    {t("ui.summary")}
                  </h3>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("ui.subtotal")}
                    </span>
                    <span className="text-right text-sm font-black tabular-nums">
                      {money(subtotal)}
                    </span>
                  </div>

                  {itemDiscountTotal > 0 && (
                    <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {t("screens.invoices.itemDiscount")}
                      </span>
                      <span className="text-right text-xs font-bold tabular-nums text-red-500">
                        -{money(itemDiscountTotal)}
                      </span>
                    </div>
                  )}

                  {invoiceDiscount > 0 && (
                    <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {t("screens.invoices.invoiceDiscount")}
                        {invoiceDiscountRate
                          ? ` (${invoiceDiscountRate}%)`
                          : ""}
                      </span>
                      <span className="text-right text-xs font-bold tabular-nums text-red-500">
                        -{money(invoiceDiscount)}
                      </span>
                    </div>
                  )}

                  {itemTaxTotal > 0 && (
                    <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {t("screens.invoices.itemTax")}
                      </span>
                      <span className="text-right text-xs font-bold tabular-nums text-emerald-600">
                        +{money(itemTaxTotal)}
                      </span>
                    </div>
                  )}

                  {invoiceTaxes.map((tax) => (
                    <div
                      key={tax.id}
                      className="grid grid-cols-[1fr_7.5rem] items-center gap-2"
                    >
                      <span className="text-xs text-slate-400">
                        {tax.tax_name} ({tax.tax_rate}%)
                      </span>
                      <span className="text-right text-xs font-bold tabular-nums text-emerald-600">
                        +
                        {money(
                          Math.max(
                            0,
                            (afterInvoiceDiscount * Number(tax.tax_rate || 0)) /
                              100,
                          ),
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-[1fr_7.5rem] items-center gap-2 rounded-xl bg-[#f6f8fd] px-3 py-2.5">
                  <span className="text-xs font-black text-slate-700">
                    {t("screens.salesReturn.returnTotal")}
                  </span>
                  <span className="text-right text-lg font-black tabular-nums text-rose-600">
                    {money(netTotal)}
                  </span>
                </div>
              </div>
            </section>

            {/* Payment choice — same split as AddPurchase/PurchaseReturnPage:
                save now with no refund yet (customer owes it back later),
                or refund immediately through a fund. */}
            <div className="grid gap-2">
              <button
                type="button"
                onClick={handleSaveWithoutRefund}
                disabled={saving || !hasSelection}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {t("screens.salesReturn.saveWithoutRefund")}
              </button>
              <button
                type="button"
                onClick={handleOpenRefundModal}
                disabled={saving || !hasSelection}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 py-2.5 text-sm font-black text-white shadow-md shadow-rose-500/25 transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={15} />
                {t("screens.salesReturn.saveAndRefund")}
              </button>
            </div>
          </aside>
        </div>
      </div>

      <AddPayment
        isOpen={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        invoice={null}
        totalAmount={netTotal}
        party={invoice.customer_id}
        partyName={invoice.customer_name || t("screens.pos.walkInCustomer")}
        mode="sales_return"
        onSubmit={handleRefundCollected}
        confirmLabel={t("screens.salesReturn.confirmRefund")}
      />

      <ToastContainer />
    </div>
  );
}
