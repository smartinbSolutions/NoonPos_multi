import { CreditCard, Layers, LayoutGrid, X } from "lucide-react";
import { useState } from "react";
import CheckoutModal from "./CheckoutModal";
import CheckoutSingleFundModal from "./CheckoutSingleFundModal";

export default function UnifiedCheckoutModal({
  funds = [],
  total,
  checkingOut,
  onClose,
  onCheckout,
  t,
  money,
}) {
  const isMultiFundDefault = funds.length > 1;
  const [isMultiMode, setIsMultiMode] = useState();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm">
      <div
        className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-[#f8fafc] shadow-2xl transition-all duration-300 ${
          isMultiMode ? "max-w-4xl" : "max-w-xl"
        }`}
      >
        <div className="border-b border-stone-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500 text-white shadow-lg shadow-teal-100">
                <CreditCard size={21} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-black text-stone-950">
                  {t("screens.checkout.title")}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {isMultiMode
                    ? t("screens.checkout.splitPayment")
                    : t("screens.checkout.singleFund")}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
                aria-label={t("screens.checkout.close")}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
        {funds.length > 1 && (
          <div className="border-b border-stone-200 bg-white px-5 py-4">
            <div className="mx-auto flex w-fit rounded-2xl bg-stone-100 p-1.5 shadow-inner">
              <button
                type="button"
                onClick={() => setIsMultiMode(false)}
                className={`flex min-w-[150px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200 ${
                  !isMultiMode
                    ? "bg-white text-teal-700 shadow-md"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <LayoutGrid size={18} />
                <span>{t("screens.checkout.singleFund")}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMultiMode(true)}
                className={`flex min-w-[150px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200 ${
                  isMultiMode
                    ? "bg-white text-teal-700 shadow-md"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <Layers size={18} />
                <span>{t("screens.checkout.splitPayment")}</span>
              </button>
            </div>
          </div>
        )}

        {funds.length > 0 ? (
          isMultiMode ? (
            <CheckoutModal
              funds={funds}
              total={total}
              checkingOut={checkingOut}
              onClose={onClose}
              onCheckout={onCheckout}
              t={t}
              money={money}
            />
          ) : (
            <CheckoutSingleFundModal
              funds={funds}
              total={total}
              checkingOut={checkingOut}
              onClose={onClose}
              onCheckout={onCheckout}
              t={t}
              money={money}
            />
          )
        ) : (
          <div className="p-8 text-center min-h-[200px] flex flex-col items-center justify-center">
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 max-w-md w-full">
              <p className="font-bold text-slate-800">
                {t("screens.checkout.noFunds")}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {t("screens.checkout.noFundsHint")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
