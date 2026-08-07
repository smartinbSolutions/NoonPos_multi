import {
  RefreshCw,
  Search,
  Scale,
  Monitor,
  ArrowBigLeft,
  ArrowBigRight,
  LogOut,
  User as UserIcon,
  Receipt,
} from "lucide-react";
import { useEffect, useState } from "react";
import usePosCheckout from "../hooks/usePosCheckout";
import { formatNumber } from "../../../Global/FormatNumber";
import useWeight from "../hooks/useWeight";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import { ToastContainer } from "react-toastify";
import POSSystemEditPriceProdcutCart from "./POSSystemEditPriceProdcutCart";
import POSSystemEditTotalPrice from "./POSSystemEditTotalPrice";
import UnifiedCheckoutModal from "./CheckoutCombinedModal";
import { useAuth } from "../../../Global/AuthContext";
import { Link } from "react-router-dom";
import DailySummaryModal from "./DailySummary/DailySummaryModal";
import POSProductTile from "./POSProductTile";
import POSCart from "./POSCart";

export default function POSSystem() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const { user, isAdmin, logout } = useAuth();

  const [currentWeight, setCurrentWeight] = useState(0);

  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [newPrice, setNewPrice] = useState("");

  const {
    weight,
    status: scaleStatus,
    isConnected: isScaleConnected,
    ports: scalePorts,
    connect: connectScale,
    close: disconnectScale,
  } = useWeight({
    setCurrentWeight,
  });

  const {
    products,
    customers,
    funds,
    taxes,
    cart,
    search,
    setSearch,
    selectedCustomerId,
    setSelectedCustomerId,
    loading,
    checkingOut,
    error,
    subtotal,
    itemDiscountTotal,
    afterItemDiscounts,
    itemTaxTotal,
    invoiceDiscountRate,
    setInvoiceDiscountRate,
    invoiceDiscount,
    afterInvoiceDiscount,
    invoiceTaxes,
    addInvoiceTax,
    removeInvoiceTax,
    clearInvoiceTaxes,
    posTaxMode,
    invoiceTaxValue,
    invoiceNote,
    setInvoiceNote,
    netTotal,
    refetch,
    addToCart,
    updateQuantity,
    updatePrice,
    updateItemDiscountRate,
    updateItemNote,
    removeFromCart,
    clearCart,
    checkout,
    currencies,
    allowNegativeStock,
    itemTaxSummary,
    itemDiscountSummary,
    itemsNetTotal,
  } = usePosCheckout({ weight });
  const { money, primaryCurrency } = usePrimaryCurrency();
  const editingItem = cart.find((item) => item.id === editingItemId) || null;
  const [isDailySummaryOpen, setIsDailySummaryOpen] = useState(false);
  const openCustomerDisplay = () => {
    window.api?.openCustomerDisplay?.();
  };

  useEffect(() => {
    window.api?.pushCartToCustomerDisplay?.({
      items: cart,
      subtotal,
      itemDiscountTotal,
      afterItemDiscounts,
      itemTaxTotal,
      itemDiscountSummary,
      itemTaxSummary,
      invoiceDiscountRate,
      invoiceDiscount,
      afterInvoiceDiscount,
      invoiceTaxes,
      invoiceTaxValue,
      itemsNetTotal,
      total: netTotal,
      currencyCode: primaryCurrency?.symbol || primaryCurrency?.code || "",
      language: i18n.language,
      isRtl,
    });
  }, [
    cart,
    subtotal,
    itemDiscountTotal,
    afterItemDiscounts,
    itemTaxTotal,
    itemDiscountSummary,
    itemTaxSummary,
    invoiceDiscountRate,
    invoiceDiscount,
    afterInvoiceDiscount,
    invoiceTaxes,
    invoiceTaxValue,
    itemsNetTotal,
    netTotal,
    primaryCurrency,
    i18n.language,
    isRtl,
  ]);

  const activeWeight = Number(currentWeight) > 0 ? Number(currentWeight) : 0;

  const [selectedScalePort, setSelectedScalePort] = useState("");
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isCheckoutMultiOpen, setIsCheckoutMultiOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [isTotalModalOpen, setIsTotalModalOpen] = useState(false);

  const openPriceModal = (item) => {
    const taxRate = Number(item.tax_rate || 0);
    const qty = Number(item.qty || 1);
    const catalogPrice = Number(item.catalog_price ?? item.price);
    const catalogInclusive =
      taxRate > 0 ? catalogPrice * (1 + taxRate / 100) : catalogPrice;
    const catalogLineTotal = catalogInclusive * qty;

    const discountRate = Number(item.discount_rate || 0);

    // Effective price right now: if a discount is active, apply it to
    // the catalog baseline; otherwise show item.price as-is (covers both
    // "no adjustment" and "a previously saved markup").
    const currentLineTotal =
      discountRate > 0
        ? catalogLineTotal * (1 - discountRate / 100)
        : (taxRate > 0 ? item.price * (1 + taxRate / 100) : item.price) * qty;

    setEditingItemId(item.id);
    setNewPrice(currentLineTotal.toFixed(2));
    setIsPriceModalOpen(true);
  };

  const handleSavePrice = () => {
    if (editingItem) {
      const qty = Number(editingItem.qty || 1);
      const target = Number(newPrice || 0);
      const taxRate = Number(editingItem.tax_rate || 0);
      const catalogPrice = Number(
        editingItem.catalog_price ?? editingItem.price
      );
      const catalogInclusive =
        taxRate > 0 ? catalogPrice * (1 + taxRate / 100) : catalogPrice;
      const catalogLineTotal = catalogInclusive * qty;

      if (target > catalogLineTotal) {
        // Genuine markup, measured against the TRUE catalog price.
        const perUnitInclusive = target / qty;
        updatePrice(editingItem.id, perUnitInclusive);
        updateItemDiscountRate(editingItem.id, 0);
      } else if (Number(editingItem.price) !== catalogPrice) {
        // A markup was saved earlier but the cashier is now choosing a
        // discount or no change — reset price back to the true catalog
        // baseline so it never stays permanently inflated.
        updatePrice(editingItem.id, catalogInclusive);
      }
      // else: no markup was ever saved, discount_rate is already
      // committed live by the modal — nothing further to persist.
    }
    setIsPriceModalOpen(false);
    setEditingItemId(null);
  };
  const openTotalModal = () => setIsTotalModalOpen(true);

  const openCheckout = () => {
    if (!cart.length) {
      setActionError(t("screens.pos.addBeforeCheckout"));
      return;
    }
    if (!funds.length) {
      setActionError(t("screens.pos.noFundsForPayment"));
      return;
    }
    setActionError("");
    setIsCheckoutOpen(true);
  };

  const completeCheckout = async (details) => {
    await checkout(details);
    setActionError("");
    setIsCheckoutOpen(false);
    setIsCheckoutMultiOpen(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-xl shadow-stone-200/70">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="mt-5 text-sm font-semibold text-stone-700">
            {t("screens.pos.loading")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f3ee] text-stone-900">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px]">
        {/* MAIN SHOPPING INTERFACE */}
        <main className="flex min-w-0 flex-col h-screen overflow-y-auto pb-28 lg:pb-0">
          {/* HEADER BAR 1 — identity & navigation */}
          <div className="sticky top-0 z-20 border-b border-stone-200/80 bg-white/95 shadow-sm shadow-stone-200/50 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-2.5">
              {isAdmin && (
                <Link
                  to="/"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-600 shadow-sm transition-all duration-200 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 focus:outline-none focus:ring-4 focus:ring-stone-100 active:scale-95"
                  aria-label="Go Back"
                >
                  {!isRtl ? (
                    <ArrowBigLeft size={22} strokeWidth={2.2} />
                  ) : (
                    <ArrowBigRight size={22} strokeWidth={2.2} />
                  )}
                </Link>
              )}

              <button
                type="button"
                onClick={() => setIsDailySummaryOpen(true)}
                className="flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 transition hover:bg-blue-100 active:scale-95"
              >
                <Receipt size={18} />
                {t("screens.pos.dailyInvoices", "today Invoices")}
              </button>

              <div className="min-w-0 shrink-0 px-1">
                <h1 className="truncate text-lg font-black leading-tight text-stone-950">
                  {t("screens.pos.title")}
                </h1>
                <p className="truncate text-[11px] font-semibold text-stone-400">
                  {t("screens.pos.subtitle")}
                </p>
              </div>

              <div className="ml-auto flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={refetch}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 active:scale-95"
                  aria-label={t("common.refresh")}
                >
                  <RefreshCw size={19} />
                </button>

                <button
                  type="button"
                  onClick={openCustomerDisplay}
                  className="flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 active:scale-95"
                >
                  <Monitor size={18} />
                  {t("screens.pos.customerDisplay")}
                </button>

                <div className="flex h-12 shrink-0 items-center gap-2.5 rounded-2xl border border-stone-200 bg-stone-50 pl-4 pr-1.5">
                  <UserIcon size={16} className="text-stone-500" />
                  <span className="max-w-[120px] truncate text-sm font-bold text-stone-800">
                    {user?.full_name || user?.username}
                  </span>
                  <button
                    type="button"
                    onClick={logout}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-400 transition hover:bg-rose-50 hover:text-rose-500 active:scale-95"
                    aria-label={t("navigation.logout")}
                  >
                    <LogOut size={17} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* HEADER BAR 2 — search & scale */}
          <div className="sticky top-[65px] z-10 border-b border-stone-200/80 bg-white shadow-sm shadow-stone-200/30">
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-2.5">
              <div className="relative min-w-[220px] flex-1">
                <Search
                  size={17}
                  className="absolute start-4 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("screens.pos.search")}
                  className="h-12 w-full rounded-2xl border border-stone-200 bg-stone-50 ps-11 pe-4 text-[15px] font-medium text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div className="flex h-12 shrink-0 items-center overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
                <div className="flex h-full items-center gap-2 border-e border-stone-200 px-3.5">
                  <Scale
                    size={16}
                    className={
                      isScaleConnected ? "text-blue-600" : "text-stone-400"
                    }
                  />
                  <span dir="ltr" className="min-w-[84px] text-sm font-bold">
                    {activeWeight ? `${formatNumber(weight)} KG` : scaleStatus}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    isScaleConnected
                      ? disconnectScale()
                      : connectScale(selectedScalePort)
                  }
                  className={`h-full px-4 text-sm font-bold transition active:scale-95 ${
                    isScaleConnected
                      ? "text-rose-600 hover:bg-rose-50"
                      : "text-blue-700 hover:bg-blue-50"
                  }`}
                >
                  {isScaleConnected
                    ? t("screens.pos.disconnect")
                    : t("screens.pos.connect")}
                </button>
              </div>

              {!isScaleConnected && scalePorts.length > 1 && (
                <select
                  value={selectedScalePort}
                  onChange={(event) => setSelectedScalePort(event.target.value)}
                  className="h-12 max-w-[170px] shrink-0 rounded-2xl border border-stone-200 bg-white px-3.5 text-sm text-stone-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="">{t("screens.pos.autoCom")}</option>
                  {scalePorts.map((port) => (
                    <option key={port.path} value={port.path}>
                      {[port.path, port.friendlyName || port.manufacturer]
                        .filter(Boolean)
                        .join(" - ")}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {(error || actionError) && (
              <div className="px-4 pb-3">
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {actionError || error}
                </div>
              </div>
            )}
          </div>

          {/* PRODUCTS LIST */}
          <div className="flex-1 p-4">
            {products.length > 0 ? (
              <div className="grid gap-3.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {products.map((product) => {
                  const outOfStock =
                    product.type !== "service" &&
                    !allowNegativeStock &&
                    Number(product.quantity) <= 0;

                  return (
                    <POSProductTile
                      key={product.id}
                      product={product}
                      outOfStock={outOfStock}
                      money={money}
                      formatNumber={formatNumber}
                      t={t}
                      onClick={() => {
                        if (outOfStock) return;
                        addToCart(
                          product,
                          activeWeight || 1,
                          Boolean(activeWeight)
                        );
                        setActionError("");
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white/70">
                <div className="text-center">
                  <Search size={34} className="mx-auto text-stone-400" />
                  <h2 className="mt-3 text-lg font-black text-stone-950">
                    {t("screens.pos.emptyProducts")}
                  </h2>
                  <p className="mt-1.5 text-sm text-stone-500">
                    {t("screens.pos.emptyProductsHint")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* SIDE CART */}
        <POSCart
          cart={cart}
          customers={customers}
          selectedCustomerId={selectedCustomerId}
          setSelectedCustomerId={setSelectedCustomerId}
          clearCart={clearCart}
          removeFromCart={removeFromCart}
          updateQuantity={updateQuantity}
          openPriceModal={openPriceModal}
          openTotalModal={openTotalModal}
          openCheckout={openCheckout}
          rawSubtotal={subtotal}
          itemDiscountSummary={itemDiscountSummary}
          itemTaxSummary={itemTaxSummary}
          invoiceDiscount={invoiceDiscount}
          invoiceTaxes={invoiceTaxes}
          afterInvoiceDiscount={afterInvoiceDiscount}
          invoiceTaxValue={invoiceTaxValue}
          netTotal={netTotal}
          money={money}
          t={t}
        />
      </div>

      {/* MOBILE LOWER BAR CONTROLS */}
      <div className="fixed inset-x-4 bottom-4 z-40 lg:hidden">
        <div className="rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-2xl shadow-stone-300/60 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-stone-500">
                {t("screens.pos.cartTotal")}
              </p>
              <h2
                dir="ltr"
                className="truncate text-2xl font-black text-stone-950"
              >
                {money(netTotal)}
              </h2>
            </div>
            <button
              type="button"
              onClick={openCheckout}
              disabled={!cart.length || checkingOut}
              className="h-14 rounded-2xl bg-blue-600 px-6 text-base font-black text-white transition hover:bg-blue-700 active:scale-95"
            >
              {t("screens.pos.checkout")} ({cart.length})
            </button>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {isTotalModalOpen && (
        <POSSystemEditTotalPrice
          isTotalModalOpen={isTotalModalOpen}
          setIsTotalModalOpen={setIsTotalModalOpen}
          subtotal={afterItemDiscounts}
          itemTax={itemTaxTotal}
          discountRate={invoiceDiscountRate}
          setDiscountRate={setInvoiceDiscountRate}
          posTaxMode={posTaxMode}
          invoiceTaxes={invoiceTaxes}
          addInvoiceTax={addInvoiceTax}
          removeInvoiceTax={removeInvoiceTax}
          clearInvoiceTaxes={clearInvoiceTaxes}
          taxes={taxes}
          note={invoiceNote}
          setNote={setInvoiceNote}
          money={money}
          t={t}
        />
      )}

      {isPriceModalOpen && (
        <POSSystemEditPriceProdcutCart
          setIsPriceModalOpen={setIsPriceModalOpen}
          t={t}
          newPrice={newPrice}
          setNewPrice={setNewPrice}
          discountRate={editingItem?.discount_rate}
          setDiscountRate={(rate) =>
            editingItem && updateItemDiscountRate(editingItem.id, rate)
          }
          note={editingItem?.description}
          setNote={(note) =>
            editingItem && updateItemNote(editingItem.id, note)
          }
          handleSavePrice={handleSavePrice}
          editingItem={editingItem}
          isPriceModalOpen={isPriceModalOpen}
          money={money}
        />
      )}

      {isCheckoutOpen && (
        <UnifiedCheckoutModal
          funds={funds}
          total={netTotal}
          checkingOut={checkingOut}
          onClose={() => setIsCheckoutOpen(false)}
          onCheckout={completeCheckout}
          t={t}
          money={money}
        />
      )}
      <DailySummaryModal
        isOpen={isDailySummaryOpen}
        onClose={() => setIsDailySummaryOpen(false)}
        t={t}
        money={money}
        funds={funds}
      />
      <ToastContainer />
    </div>
  );
}
