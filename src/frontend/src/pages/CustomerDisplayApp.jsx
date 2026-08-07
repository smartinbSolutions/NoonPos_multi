import { useEffect, useState } from "react";
import { ShoppingBag, Tag, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";

const emptyPayload = {
  items: [],
  subtotal: 0,
  itemDiscountTotal: 0,
  afterItemDiscounts: 0,
  itemTaxTotal: 0,
  itemDiscountSummary: [],
  itemTaxSummary: [],
  invoiceDiscountRate: 0,
  invoiceDiscount: 0,
  afterInvoiceDiscount: 0,
  invoiceTaxes: [],
  invoiceTaxValue: 0,
  itemsNetTotal: 0,
  total: 0,
  currencyCode: "",
};

export default function CustomerDisplayApp() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(emptyPayload);

  // Derived directly from the pushed payload's language, not i18n.language —
  // this i18next instance's reactivity is unreliable here (it's missing
  // .dir() entirely), so don't depend on it for something as visible as RTL.
  const isRtl = data.language === "ar";

  useEffect(() => {
    const unsubscribe = window.api?.onCustomerDisplayCartUpdate?.((payload) => {
      setData({ ...emptyPayload, ...(payload || {}) });

      if (payload?.language && payload.language !== i18n.language) {
        i18n.changeLanguage(payload.language);
      }
    });

    return unsubscribe;
  }, [i18n]);

  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = data.language || i18n.language;
  }, [isRtl, data.language, i18n.language]);
  const {
    items,
    subtotal,
    itemDiscountSummary,
    itemTaxSummary,
    invoiceDiscountRate,
    invoiceDiscount,
    invoiceTaxes,
    total,
    currencyCode,
  } = data;

  const money = (value) =>
    `${Number(value || 0).toFixed(2)} ${currencyCode}`.trim();

  if (!items.length) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-stone-950 text-white">
        <ShoppingBag size={56} className="text-teal-500" />
        <h1 className="text-3xl font-black">
          {t("screens.customerDisplay.welcome", "Welcome")}
        </h1>
        <p className="text-stone-400">
          {t("screens.customerDisplay.thanks", "Thanks")}
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen flex-col bg-stone-50"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex-1 space-y-2.5 overflow-auto p-6">
        {items.map((item, i) => {
          const hasDiscount = Number(item.discount_rate || 0) > 0;
          const hasTax = Number(item.tax_rate || 0) > 0;
          const lineTotal = Number(item.lineTotal ?? item.qty * item.price);

          return (
            <div
              key={i}
              className="rounded-2xl bg-white p-4 shadow-sm shadow-stone-200/60"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-lg font-black text-stone-900">
                    {item.name}
                  </h4>
                  <p className="text-sm font-semibold text-stone-500">
                    {item.qty} × {money(item.price)}
                  </p>
                </div>
                <span className="shrink-0 text-xl font-black text-stone-900">
                  {money(lineTotal)}
                </span>
              </div>

              {(hasDiscount || hasTax) && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-stone-100 pt-2">
                  {hasDiscount && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600">
                      <Tag size={11} />-{item.discount_rate}% (
                      {money(item.discount)})
                    </span>
                  )}
                  {hasTax && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-600">
                      <Receipt size={11} />+{item.tax_rate}% (
                      {money(item.taxValue)})
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2 bg-stone-950 px-6 pb-6 pt-5 text-white">
        <div className="space-y-1.5 border-b border-white/10 pb-3 text-sm">
          <div className="flex items-center justify-between text-stone-300">
            <span>{t("ui.subtotal")}</span>
            <span className="font-bold tabular-nums text-white">
              {money(subtotal)}
            </span>
          </div>

          {(itemDiscountSummary || []).map((group) => (
            <div
              key={`item-discount-${group.rate}`}
              className="flex items-center justify-between text-rose-400"
            >
              <span>
                {t("screens.invoices.itemDiscountAt", {
                  rate: Number(group.rate).toFixed(2),
                })}
              </span>
              <span className="font-bold tabular-nums">
                -{money(group.amount)}
              </span>
            </div>
          ))}

          {(itemTaxSummary || []).map((group) => (
            <div
              key={`item-tax-${group.tax_id}`}
              className="flex items-center justify-between text-emerald-400"
            >
              <span>
                {t("screens.invoices.itemTaxAt", { rate: group.rate })}
              </span>
              <span className="font-bold tabular-nums">
                +{money(group.value)}
              </span>
            </div>
          ))}

          {invoiceDiscount > 0 && (
            <div className="flex items-center justify-between text-rose-400">
              <span>
                {t("screens.invoices.invoiceDiscountAmount")}
                {invoiceDiscountRate ? ` (${invoiceDiscountRate}%)` : ""}
              </span>
              <span className="font-bold tabular-nums">
                -{money(invoiceDiscount)}
              </span>
            </div>
          )}

          {(invoiceTaxes || []).map((tax) => {
            const rate = Number(tax.rate || 0);
            const value = Number(data.afterInvoiceDiscount || 0) * (rate / 100);

            return (
              <div
                key={tax.id}
                className="flex items-center justify-between text-emerald-400"
              >
                <span>
                  {tax.name} ({tax.rate}%)
                </span>
                <span className="font-bold tabular-nums">+{money(value)}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-lg font-bold text-stone-300">
            {t("ui.total")}
          </span>
          <span className="text-4xl font-black tabular-nums">
            {money(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
