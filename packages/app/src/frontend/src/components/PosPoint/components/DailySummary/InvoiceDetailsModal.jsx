import { useMemo } from "react";
import { ShoppingBag, Calendar, Wallet, Receipt } from "lucide-react";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";

export default function InvoiceDetailsModal({
  selectedInvoice,
  salesInvoicesItem,
  money,
  t,
  onClose,
}) {
  const { primaryCurrency } = usePrimaryCurrency();
  const allocations = selectedInvoice.allocations || [];
  const invoiceTaxes = selectedInvoice.taxes || [];

  // These are historical facts already computed and stored at sale time
  // (per-item discount/taxValue, invoice-level discount/taxRate) — this is
  // a read-only view of a past invoice, so we display the stored snapshot
  // rather than recomputing it.
  const subtotal = useMemo(
    () =>
      selectedInvoice.subtotal ??
      salesInvoicesItem.reduce(
        (sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 0),
        0
      ),
    [selectedInvoice, salesInvoicesItem]
  );

  const itemDiscountTotal = useMemo(
    () =>
      salesInvoicesItem.reduce((sum, i) => sum + Number(i.discount || 0), 0),
    [salesInvoicesItem]
  );

  const itemTaxTotal = useMemo(
    () =>
      salesInvoicesItem.reduce((sum, i) => sum + Number(i.taxValue || 0), 0),
    [salesInvoicesItem]
  );

  const invoiceDiscount = Number(selectedInvoice.discount || 0);
  const invoiceDiscountRate = Number(selectedInvoice.discount_rate || 0);

  return (
    <div className="flex h-full flex-col bg-[#f7f3ee]">
      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="space-y-4">
            {/* SUMMARY */}
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Receipt size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-stone-950">
                  {selectedInvoice.customer?.name ||
                    selectedInvoice.customer_name ||
                    t("screens.pos.walkInCustomer", "زبون سفري")}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500">
                  <Calendar size={12} />
                  {selectedInvoice.date &&
                    new Date(selectedInvoice.date).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                </p>
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-800">
                {t("ui.sale", "مبيعات")}
              </span>
            </div>

            {/* PAYMENT BREAKDOWN */}
            {allocations.length > 0 && (
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-black uppercase text-stone-500">
                  <Wallet size={13} />
                  {t("screens.pos.paidVia", "طريقة الدفع")}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {allocations.map((alloc) => {
                    const sameCurrency =
                      alloc.currency_code === primaryCurrency?.code;
                    return (
                      <div
                        key={alloc.fund_id}
                        className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2"
                      >
                        <span className="text-sm font-bold text-stone-800">
                          {alloc.fund_name}
                        </span>
                        <span className="text-stone-300">·</span>
                        {sameCurrency ? (
                          <span className="text-sm font-black text-blue-700">
                            {money(alloc.amount)}
                          </span>
                        ) : (
                          <>
                            <span className="text-sm font-black text-blue-700">
                              {Number(
                                alloc.amount_fund_currency
                              ).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              {alloc.currency_code}
                            </span>
                            <span className="text-xs font-medium text-stone-500">
                              (= {money(alloc.amount)})
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PRODUCTS */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-black uppercase text-stone-500">
                {t("screens.pos.invoiceProducts", "منتجات الفاتورة")}
              </h4>

              <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white px-4">
                {salesInvoicesItem.map((item) => {
                  const factor = Number(item.unit_conversion_factor || 1);
                  const qtyInUnit =
                    factor > 0
                      ? Number(item.quantity || 0) / factor
                      : Number(item.quantity || 0);
                  const unitLabel = item.unit_name || item.unit_code || "";

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 py-4"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                          <ShoppingBag size={18} />
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-stone-950">
                            {item.name || item.product_name}
                          </p>

                          <p className="mt-0.5 text-xs text-stone-500">
                            {t("screens.pos.price", "السعر")}:{" "}
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

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-stone-950">
                          {qtyInUnit}
                        </span>
                        {unitLabel && (
                          <span className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-bold uppercase text-stone-600">
                            {unitLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* DISCOUNT / TAX BREAKDOWN */}
            {(itemDiscountTotal > 0 ||
              invoiceDiscount > 0 ||
              itemTaxTotal > 0 ||
              invoiceTaxes.length > 0) && (
              <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
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
                    <span>
                      {t("ui.invoiceDiscount", "خصم الفاتورة")}
                      {invoiceDiscountRate > 0 && ` (${invoiceDiscountRate}%)`}
                    </span>
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
                {invoiceTaxes.map((tax) => (
                  <div
                    key={tax.id}
                    className="flex justify-between text-stone-600"
                  >
                    <span>
                      {tax.tax_name || t("ui.tax", "الضريبة")}
                      {Number(tax.tax_rate) > 0 && ` (${tax.tax_rate}%)`}
                    </span>
                    <span className="font-semibold text-stone-800">
                      {money(tax.tax_value)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* TOTAL */}
            <div className="rounded-2xl bg-blue-600 p-4 text-white shadow-lg shadow-blue-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold opacity-90">
                  {t("screens.pos.originalInvoiceTotal", "إجمالي الفاتورة")}
                </span>
                <span className="text-2xl font-black">
                  {money(
                    selectedInvoice.net_total ||
                      selectedInvoice.netTotal ||
                      selectedInvoice.total ||
                      0
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
