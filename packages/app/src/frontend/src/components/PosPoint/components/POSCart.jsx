import { ShoppingCart, Tag } from "lucide-react";
import SearchableSelect from "../../../Global/SearchableSelect";
import POSCartItem from "./POSCartItem";

export default function POSCart({
  cart,
  customers,
  selectedCustomerId,
  setSelectedCustomerId,
  clearCart,
  removeFromCart,
  updateQuantity,
  openPriceModal,
  openTotalModal,
  openCheckout,
  rawSubtotal,
  itemDiscountSummary,
  itemTaxSummary,
  invoiceDiscount,
  invoiceTaxes,
  afterInvoiceDiscount,
  invoiceTaxValue,
  netTotal,
  money,
  t,
}) {
  const hasInvoiceDiscount = Number(invoiceDiscount) > 0.005;
  const hasInvoiceTax =
    (invoiceTaxes || []).length > 0 && Number(invoiceTaxValue) > 0.005;

  return (
    <aside className="hidden border-l border-stone-200 bg-white lg:flex lg:flex-col h-screen sticky top-0 overflow-hidden">
      {/* CART HEADER */}
      <div className="shrink-0 border-b border-stone-200 p-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-stone-950">
              {t("screens.pos.currentCart")}
            </h2>
            <p className="text-xs text-stone-500">
              {t("screens.pos.itemCount", { count: cart.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={clearCart}
            disabled={!cart.length}
            className="h-11 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-600 transition hover:bg-rose-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("screens.pos.clear")}
          </button>
        </div>

        <div className="mt-3.5">
          <SearchableSelect
            label=""
            labelWidth="0"
            placeholder={t("screens.pos.walkInCustomer")}
            options={[
              {
                id: "",
                name: t("screens.pos.walkInCustomer"),
                phone: "",
                address: "",
              },
              ...customers,
            ]}
            selectedValue={selectedCustomerId}
            onChange={(customer) =>
              setSelectedCustomerId(customer.id ? String(customer.id) : "")
            }
            getOptionLabel={(customer) =>
              [customer.name || t("screens.pos.walkInCustomer"), customer.phone]
                .filter(Boolean)
                .join(" - ")
            }
          />
        </div>
      </div>

      {/* CART BODY */}
      <div className="flex-1 overflow-y-auto p-3.5 bg-stone-50/30">
        {cart.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50/70 text-center">
            <div>
              <ShoppingCart size={40} className="mx-auto text-stone-400" />
              <h3 className="mt-3 text-base font-black text-stone-950">
                {t("screens.pos.cartEmpty")}
              </h3>
              <p className="mt-1.5 text-sm text-stone-500">
                {t("screens.pos.cartEmptyHint")}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {cart.map((item) => (
              <POSCartItem
                key={item.id}
                item={item}
                onOpenPriceModal={openPriceModal}
                onUpdateQuantity={updateQuantity}
                onRemove={removeFromCart}
                money={money}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* CART FOOTER */}
      <div className="shrink-0 space-y-3 border-t border-stone-200 bg-white p-4 shadow-lg shadow-stone-300">
        {cart.length > 0 && (
          <>
            {/* BREAKDOWN — mirrors AddSales' summary panel */}
            <div className="rounded-2xl border border-stone-100 bg-stone-50/60 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-stone-500">{t("ui.subtotal")}</span>
                <span dir="ltr" className="font-bold text-stone-700">
                  {money(rawSubtotal)}
                </span>
              </div>

              {itemDiscountSummary.map((group) => (
                <div
                  key={`item-discount-${group.rate}`}
                  className="mt-1 flex items-center justify-between"
                >
                  <span className="text-stone-400">
                    {t("screens.invoices.itemDiscountAt", {
                      rate: Number(group.rate).toFixed(2),
                    })}
                  </span>
                  <span dir="ltr" className="font-bold text-red-500">
                    -{money(group.amount)}
                  </span>
                </div>
              ))}

              {itemTaxSummary.map((group) => (
                <div
                  key={`item-tax-${group.tax_id}`}
                  className="mt-1 flex items-center justify-between"
                >
                  <span className="text-stone-400">
                    {t("screens.invoices.itemTaxAt", { rate: group.rate })}
                  </span>
                  <span dir="ltr" className="font-bold text-emerald-600">
                    +{money(group.value)}
                  </span>
                </div>
              ))}

              {hasInvoiceDiscount && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-stone-400">
                    {t("screens.invoices.invoiceDiscountAmount")}
                  </span>
                  <span dir="ltr" className="font-bold text-red-500">
                    -{money(invoiceDiscount)}
                  </span>
                </div>
              )}
              {hasInvoiceTax &&
                invoiceTaxes.map((tax) => {
                  const rate = Number(tax.rate || 0);
                  const value =
                    Number(afterInvoiceDiscount || 0) * (rate / 100);

                  return (
                    <div
                      key={tax.id}
                      className="mt-1 flex items-center justify-between"
                    >
                      <span className="text-stone-400">
                        {tax.name} ({tax.rate}%)
                      </span>
                      <span dir="ltr" className="font-bold text-emerald-600">
                        +{money(value)}
                      </span>
                    </div>
                  );
                })}

              <div className="mt-1.5 flex items-center justify-between border-t border-stone-200 pt-1.5">
                <span className="font-black text-stone-700">
                  {t("ui.total")}
                </span>
                <span dir="ltr" className="font-black text-teal-700">
                  {money(netTotal)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={openTotalModal}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 text-sm font-bold text-stone-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              <Tag size={15} />
              {t("screens.pos.changeTotal")}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={openCheckout}
          className="w-full cursor-pointer rounded-2xl bg-blue-500 p-5 text-start text-white shadow-lg shadow-blue-200 transition hover:bg-blue-600 active:scale-[0.98]"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[20px] font-black uppercase">
              {t("screens.pos.pay")}
            </span>
            <span className="text-[11px] font-black uppercase">
              {t("screens.pos.itemCount", { count: cart.length })}
            </span>
          </div>
          <h2 dir="ltr" className="mt-0.5 truncate text-3xl font-black">
            {money(netTotal)}
          </h2>
        </button>
      </div>
    </aside>
  );
}
