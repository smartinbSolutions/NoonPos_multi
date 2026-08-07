import { useMemo, useState, useEffect } from "react";
import {
  Minus,
  Plus,
  Undo2,
  RotateCcw,
  AlertCircle,
  ShoppingBag,
  X,
} from "lucide-react";
import UnifiedCheckoutModal from "../CheckoutCombinedModal";

export default function InvoiceReturnModal({
  selectedInvoice,
  salesInvoicesItem,
  funds,
  money,
  t,
  onClose,
  onSuccess,
}) {
  const [items, setItems] = useState([]);
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  // available_quantity from the backend is always BASE-unit. We convert to
  // the sale unit here purely for input/display — unit_name/conversion
  // factor on each item are a permanent snapshot from time of sale, so this
  // stays correct even if the unit itself is later renamed or deleted.
  useEffect(() => {
    if (salesInvoicesItem && salesInvoicesItem.length > 0) {
      setItems(
        salesInvoicesItem.map((item) => {
          const factor = Number(item.unit_conversion_factor || 1);
          const baseAvailable = Number(
            item.available_quantity ?? item.quantity ?? 0
          );

          return {
            ...item,
            unit_conversion_factor: factor,
            available_unit_quantity:
              factor > 0 ? baseAvailable / factor : baseAvailable,
            returnUnitQuantity: 0,
          };
        })
      );
    }
  }, [salesInvoicesItem]);

  // value entered is in the ORIGINAL SALE UNIT (e.g. Box), capped at
  // however many of that unit are still available to return.
  const handleQtyChange = (itemId, delta) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const max = Number(item.available_unit_quantity || 0);
        const current = Number(item.returnUnitQuantity || 0);
        const next = Math.max(0, Math.min(max, current + delta));
        return { ...item, returnUnitQuantity: next };
      })
    );
  };

  const handleReturnAll = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        returnUnitQuantity: Number(item.available_unit_quantity || 0),
      }))
    );
  };

  // ---- Live preview of the same fractional cascade the backend applies.
  // Rates are always inherited from the original invoice/item, never
  // editable here. Quantity entered in the sale unit is converted back to
  // BASE units — that base quantity is what actually gets sent to the
  // backend and is what price/discount/tax math operates on. ----
  const preparedItems = useMemo(() => {
    return items
      .filter((item) => Number(item.returnUnitQuantity) > 0)
      .map((item) => {
        const factor = Number(item.unit_conversion_factor || 1);
        const unitQty = Number(item.returnUnitQuantity);
        const baseQty = Number((unitQty * factor).toFixed(4));

        const price = Number(item.price || 0);
        const total = Number((baseQty * price).toFixed(2));

        const discountRate = Number(item.discount_rate || 0);
        const discount = Number((total * (discountRate / 100)).toFixed(2));
        const afterDiscount = total - discount;

        const taxRate = Number(item.tax_rate || 0);
        const taxValue = Number((afterDiscount * (taxRate / 100)).toFixed(2));

        return {
          sales_invoice_item_id: item.id,
          product_id: item.product_id,
          name: item.name || item.product_name,
          unit_name: item.unit_name,
          unitQty,
          quantity: baseQty,
          price,
          total,
          discount_rate: discountRate,
          discount,
          tax_rate: taxRate,
          taxValue,
        };
      });
  }, [items]);

  const subtotal = useMemo(
    () => preparedItems.reduce((sum, i) => sum + i.total, 0),
    [preparedItems]
  );

  const itemDiscountTotal = useMemo(
    () => preparedItems.reduce((sum, i) => sum + i.discount, 0),
    [preparedItems]
  );

  const itemTaxTotal = useMemo(
    () => preparedItems.reduce((sum, i) => sum + i.taxValue, 0),
    [preparedItems]
  );

  const afterItemDiscounts = subtotal - itemDiscountTotal;

  const invoiceDiscountRate = Number(selectedInvoice?.discount_rate || 0);
  // Invoice-level tax is an array now (sales_invoice_taxes) — each tax
  // applies independently to the same afterInvoiceDiscount base, then the
  // results are summed (parallel, not compounding), matching how the
  // invoice itself was taxed at sale time.
  const invoiceTaxes = selectedInvoice?.taxes || [];

  const invoiceDiscount = useMemo(
    () => Number(((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2)),
    [afterItemDiscounts, invoiceDiscountRate]
  );

  const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

  const invoiceTaxBreakdown = useMemo(() => {
    return invoiceTaxes.map((tax) => {
      const rate = Number(tax.tax_rate || 0);
      return {
        id: tax.id,
        name: tax.tax_name,
        rate,
        value: Math.max(
          0,
          Number(((afterInvoiceDiscount * rate) / 100).toFixed(2))
        ),
      };
    });
  }, [invoiceTaxes, afterInvoiceDiscount]);

  const invoiceTaxValue = useMemo(
    () => invoiceTaxBreakdown.reduce((sum, tx) => sum + tx.value, 0),
    [invoiceTaxBreakdown]
  );

  const returnTotal = useMemo(
    () =>
      Math.max(
        0,
        Number(
          (afterInvoiceDiscount + itemTaxTotal + invoiceTaxValue).toFixed(2)
        )
      ),
    [afterInvoiceDiscount, itemTaxTotal, invoiceTaxValue]
  );

  const originalTotal =
    selectedInvoice.net_total ||
    selectedInvoice.netTotal ||
    selectedInvoice.total ||
    0;

  const openRefundModal = () => {
    if (preparedItems.length === 0) {
      setActionError(
        t(
          "screens.pos.selectAtLeastOneItem",
          "الرجاء تحديد كمية إرجاع لمنتج واحد على الأقل."
        )
      );
      return;
    }
    setActionError("");
    setIsRefundModalOpen(true);
  };

  // Called by the same fund-allocation modal used at checkout — the
  // cashier chooses which fund(s) the refund comes out of, exactly like
  // choosing which fund(s) collect a sale. No automatic split. Unlike the
  // manual return page (which just saves and lets the balance sit unpaid),
  // a POS return is paid out right away, so this step stays.
  const handleConfirmRefund = async ({ payments }) => {
    const mappedPayments = payments.map((p) => ({
      fund_id: p.fundId,
      amount: p.amount,
      amount_fund_currency: p.amount_fund_currency,
      currency_code: p.currency_code,
      exchange_rate: p.exchange_rate,
      effective_rate: p.exchange_rate,
      note: `Refund for Invoice #${selectedInvoice.id}`,
    }));

    // Only quantity (base-unit) and identifiers go to the backend — rates,
    // totals, and tax are re-derived server-side from the original invoice's
    // own stored rates, never trusted from here. Client-side subtotal/
    // discount/tax above exist purely to preview the refund total for fund
    // allocation.
    const returnData = {
      sales_invoice_id: selectedInvoice.id,
      customer_id: selectedInvoice.customer_id || null,
      description: t(
        "screens.pos.todayInvoiceReturn",
        "مرتجع سريع من فواتير اليوم"
      ),
      date: new Date().toISOString().slice(0, 10),
      created_by: selectedInvoice.created_by || 1,
      items: preparedItems.map((i) => ({
        sales_invoice_item_id: i.sales_invoice_item_id,
        product_id: i.product_id,
        quantity: i.quantity,
      })),
      payments: mappedPayments,
    };

    setLoading(true);
    try {
      const result = await window.api.createSalesReturn(returnData);
      if (!result.success) {
        throw new Error(result.error || t("errors.returnFailed"));
      }
      setIsRefundModalOpen(false);
      onSuccess();
    } catch (err) {
      setActionError(err.message || t("errors.returnFailed"));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#f7f3ee]">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {actionError && (
            <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              <AlertCircle size={16} />
              {actionError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4">
            <div>
              <span className="text-xs text-stone-500">
                {t("screens.pos.customer", "العميل")}
              </span>
              <p className="mt-0.5 text-sm font-bold text-stone-900">
                {selectedInvoice.customer?.name ||
                  selectedInvoice.customer_name ||
                  t("screens.pos.walkInCustomer", "زبون سفري")}
              </p>
            </div>
            <button
              type="button"
              onClick={handleReturnAll}
              className="h-11 rounded-2xl bg-amber-500 px-4 text-sm font-bold text-white transition hover:bg-amber-600 active:scale-95"
            >
              {t("ui.returnAll", "إرجاع الكل")}
            </button>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-xs font-black uppercase text-stone-500">
              {t("screens.pos.chooseReturnQtys", "حدد الكميات المراد إرجاعها")}
            </h4>

            <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white px-4">
              {items.map((item) => {
                const unitLabel = item.unit_name || "";
                const returnUnitQty = Number(item.returnUnitQuantity || 0);
                const maxUnitQty = Number(item.available_unit_quantity || 0);
                const lineTotal =
                  returnUnitQty *
                  Number(item.unit_conversion_factor || 1) *
                  Number(item.price || 0);

                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                        <ShoppingBag size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-stone-950">
                          {item.name || item.product_name}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {t("ui.soldQty", "الكمية المباعة")}:{" "}
                          <span className="font-bold text-stone-800">
                            {maxUnitQty} {unitLabel}
                          </span>{" "}
                          | {t("screens.pos.price", "السعر")}:{" "}
                          <span className="font-bold text-stone-800">
                            {money(item.price)}
                          </span>
                          {Number(item.tax_rate) > 0 &&
                            ` · ${t("ui.tax", "الضريبة")} ${item.tax_rate}%`}
                          {Number(item.discount_rate) > 0 &&
                            ` · ${t("ui.discount", "الخصم")} ${item.discount_rate}%`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex h-11 items-center overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
                        <button
                          type="button"
                          onClick={() => handleQtyChange(item.id, -1)}
                          className="flex h-11 w-11 items-center justify-center text-stone-700 transition hover:bg-stone-100 active:scale-90 disabled:opacity-40"
                          disabled={returnUnitQty === 0}
                        >
                          <Minus size={15} />
                        </button>
                        <span className="w-10 text-center text-sm font-black text-stone-950">
                          {returnUnitQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQtyChange(item.id, 1)}
                          className="flex h-11 w-11 items-center justify-center text-stone-700 transition hover:bg-stone-100 active:scale-90 disabled:opacity-40"
                          disabled={returnUnitQty >= maxUnitQty}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      <div className="w-20 text-left">
                        <p className="text-[10px] font-semibold uppercase text-stone-400">
                          {t("ui.subtotal", "الفرعي")}
                        </p>
                        <span className="text-sm font-black text-stone-900">
                          {money(lineTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
            <div className="flex justify-between font-medium text-stone-600">
              <span>
                {t(
                  "screens.pos.originalInvoiceTotal",
                  "إجمالي الفاتورة الأصلية"
                )}
              </span>
              <span className="font-bold text-stone-900">
                {money(originalTotal)}
              </span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>{t("ui.subtotal", "الفرعي")}</span>
              <span className="font-semibold text-stone-800">
                {money(subtotal)}
              </span>
            </div>
            {itemDiscountTotal > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>{t("ui.itemDiscount", "خصم الأصناف")}</span>
                <span className="font-semibold text-stone-800">
                  -{money(itemDiscountTotal)}
                </span>
              </div>
            )}
            {invoiceDiscount > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>{t("ui.invoiceDiscount", "خصم الفاتورة")}</span>
                <span className="font-semibold text-stone-800">
                  -{money(invoiceDiscount)}
                </span>
              </div>
            )}
            {itemTaxTotal > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>{t("ui.itemTax", "ضريبة الأصناف")}</span>
                <span className="font-semibold text-stone-800">
                  {money(itemTaxTotal)}
                </span>
              </div>
            )}
            {invoiceTaxBreakdown.map((tax) => (
              <div key={tax.id} className="flex justify-between text-stone-600">
                <span>
                  {tax.name || t("ui.tax", "الضريبة")}
                  {tax.rate > 0 && ` (${tax.rate}%)`}
                </span>
                <span className="font-semibold text-stone-800">
                  {money(tax.value)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-dashed border-stone-200 pt-2.5 text-base font-black">
              <span className="flex items-center gap-1.5 text-stone-900">
                <RotateCcw size={16} className="text-rose-600" />
                {t("screens.pos.refundTotal", "المبلغ المسترد المتوقع")}
              </span>
              <span className="text-lg text-rose-600">
                {money(returnTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-stone-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="h-12 rounded-2xl border border-stone-200 bg-white px-6 text-sm font-bold text-stone-700 transition hover:bg-stone-50 active:scale-95"
        >
          {t("common.close", "إغلاق")}
        </button>
        <button
          type="button"
          disabled={loading || returnTotal === 0}
          onClick={openRefundModal}
          className="flex h-12 items-center gap-2 rounded-2xl bg-rose-600 px-6 text-sm font-black text-white shadow-md shadow-rose-200 transition hover:bg-rose-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 size={17} />
          {t(
            "screens.pos.chooseRefundMethod",
            "متابعة واختيار طريقة الاسترجاع"
          )}
        </button>
      </div>

      {/* REFUND METHOD — same fund-allocation UI used at checkout, just
          pointed at returnTotal instead of a sale total. The cashier picks
          which fund(s) pay the refund out, same as picking which fund(s)
          collect a sale. */}
      {isRefundModalOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white">
          <div className="shrink-0 flex items-center justify-between border-b border-stone-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-black text-stone-950">
                {t(
                  "screens.pos.chooseRefundMethod",
                  "اختر طريقة استرجاع المبلغ"
                )}
              </h2>
              <p className="text-xs text-stone-500">
                {t("screens.pos.refundTotal", "المبلغ المسترد المتوقع")}:{" "}
                {money(returnTotal)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsRefundModalOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 text-stone-600 transition hover:bg-stone-200 active:scale-95"
            >
              <X size={20} />
            </button>
          </div>

          <UnifiedCheckoutModal
            funds={funds}
            total={returnTotal}
            checkingOut={loading}
            onClose={() => setIsRefundModalOpen(false)}
            onCheckout={handleConfirmRefund}
            t={t}
            money={money}
          />
        </div>
      )}
    </div>
  );
}
