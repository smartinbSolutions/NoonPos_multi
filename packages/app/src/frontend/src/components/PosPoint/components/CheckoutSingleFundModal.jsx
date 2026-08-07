import {
  CreditCard,
  Wallet,
  X,
  Check,
  AlertCircle,
  CheckCircle2,
  Banknote,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { normalizeDigits } from "../../../Global/FormatNumber";
import NumberInput from "../../../Global/NumberInput";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const cents = (value) => Math.round(toNumber(value) * 100) / 100;

export default function CheckoutSingleFundModal({
  funds,
  total,
  checkingOut,
  onClose,
  onCheckout,
}) {
  const { t } = useTranslation();

  const { money } = usePrimaryCurrency();

  const [fundId, setFundId] = useState("");

  const [amount, setAmount] = useState("");

  const [error, setError] = useState("");

  useEffect(() => {
    if (funds.length) {
      setFundId(String(funds[0].id));
      const rate = toNumber(funds[0].currency_exchangeRate || 1) || 1;
      setAmount(cents(total * rate));
    }
  }, [funds, total]);

  const selectedFund = useMemo(() => {
    return funds.find((f) => String(f.id) === String(fundId));
  }, [funds, fundId]);

  const listedRate = useMemo(() => {
    return toNumber(selectedFund?.currency_exchangeRate || 1) || 1;
  }, [selectedFund]);

  // only a foreign-currency fund can have an "effective rate" - a fund in
  // the primary currency has nothing to flex, so overpaying there is just
  // ordinary change, not a rate adjustment
  const isForeignFund = useMemo(() => {
    return listedRate !== 1;
  }, [listedRate]);

  const amountInFundCurrency = useMemo(() => {
    return toNumber(amount);
  }, [amount]);

  const effectiveRate = useMemo(() => {
    if (!isForeignFund || !total || amountInFundCurrency <= 0)
      return listedRate;
    return amountInFundCurrency / total;
  }, [isForeignFund, amountInFundCurrency, total, listedRate]);

  const rateDeviationPct = useMemo(() => {
    if (!isForeignFund || !listedRate) return 0;
    return Math.abs((effectiveRate - listedRate) / listedRate) * 100;
  }, [isForeignFund, effectiveRate, listedRate]);

  // primary-currency-only: real cash change / shortfall, since there's no
  // rate to absorb the difference
  const change = useMemo(() => {
    if (isForeignFund) return 0;
    return Math.max(0, cents(amountInFundCurrency - total));
  }, [isForeignFund, amountInFundCurrency, total]);

  const shortfall = useMemo(() => {
    if (isForeignFund) return 0;
    return Math.max(0, cents(total - amountInFundCurrency));
  }, [isForeignFund, amountInFundCurrency, total]);

  const selectFund = (fund) => {
    setFundId(String(fund.id));

    setAmount(cents(total * (toNumber(fund.currency_exchangeRate || 1) || 1)));

    setError("");
  };

  const applyAmount = (value) => {
    setAmount(cents(value));
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();

    if (!selectedFund) {
      setError(t("screens.checkout.selectFundError"));
      return;
    }

    if (amountInFundCurrency <= 0) {
      const msg = t("screens.checkout.amountRequired");
      setError(msg);
      toast.error(msg);
      return;
    }

    if (!isForeignFund && shortfall > 0) {
      const msg = t("screens.checkout.remainingMustBeZero");
      setError(msg);
      toast.error(msg);
      return;
    }

    try {
      await onCheckout({
        payments: [
          {
            fundId: Number(selectedFund.id),
            amount: total,
            // for a primary-currency fund only the invoice total is applied
            // to the fund - any excess is change handed back, not revenue.
            // for a foreign fund the full typed amount is what settled it.
            amount_fund_currency: isForeignFund ? amountInFundCurrency : total,
            currency_code: selectedFund.currency_code,
            exchange_rate: isForeignFund ? effectiveRate : 1,
          },
        ],

        received: amountInFundCurrency,
        receivedFundTotal: amountInFundCurrency,
        change,
        changeFundId: selectedFund.id,
      });

      onClose();
    } catch (err) {
      console.error("Checkout failed", err);

      setError(err?.message || t("screens.checkout.failed"));
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="min-h-0 flex-1 overflow-auto p-5 space-y-5">
        <div className="flex items-center justify-between rounded-xl bg-stone-100 px-4 py-2.5">
          <span className="text-xs font-bold uppercase  text-stone-500">
            {t("screens.checkout.totalDue")}
          </span>

          <span className="text-lg font-black text-stone-800">
            {money(total)}
          </span>
        </div>

        <div>
          <h3 className="font-black mb-2 text-sm text-stone-700">
            {t("screens.checkout.paidIntoFund")}
          </h3>

          <div className="grid grid-cols-3 gap-1.5">
            {funds.map((fund) => {
              const selected = String(fund.id) === fundId;
              const rate = toNumber(fund.currency_exchangeRate || 1) || 1;

              return (
                <button
                  key={fund.id}
                  type="button"
                  onClick={() => selectFund(fund)}
                  className={`relative flex flex-col items-center gap-0.5 rounded-lg border px-1.5 py-2 text-center transition ${selected ? "border-teal-500 bg-teal-50" : "border-stone-200 bg-white hover:border-stone-300"}`}
                >
                  {selected ? (
                    <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-teal-500 text-white">
                      <Check size={8} />
                    </span>
                  ) : (
                    <Wallet
                      size={12}
                      className="absolute right-1 top-1 text-stone-300"
                    />
                  )}

                  <h4 className="w-full truncate text-[11px] font-black">
                    {fund.name}
                  </h4>

                  <p className="text-[10px] font-bold text-stone-500">
                    {fund.currency_code}
                  </p>

                  {rate !== 1 && (
                    <p className="text-[9px] font-semibold text-stone-400">
                      1 = {rate}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="checkout-amount"
            className="mb-2 block text-sm font-black text-stone-700"
          >
            {t("ui.amount")}
          </label>

          <div className="relative">
            <NumberInput
              id="checkout-amount"
              value={amount}
              onChange={(val) => {
                setAmount(val);
                setError("");
              }}
              className="h-24 w-full rounded-2xl border-2 border-stone-200 bg-white px-5 pr-24 text-5xl font-black focus:border-teal-500 focus:outline-none"
            />

            <span className="pointer-events-none absolute right-16 top-1/2 -translate-y-1/2 text-lg font-bold text-stone-400">
              {selectedFund?.currency_code}
            </span>

            {amount !== "" && (
              <button
                type="button"
                onClick={() => applyAmount("")}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                aria-label={t("common.clear")}
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Foreign fund: effective-rate feedback, never blocks */}
          {isForeignFund && (
            <div
              className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${
                rateDeviationPct > 5
                  ? "bg-amber-50 text-amber-700"
                  : "bg-stone-100 text-stone-500"
              }`}
            >
              {rateDeviationPct > 5 ? (
                <AlertCircle size={14} className="shrink-0" />
              ) : (
                <CheckCircle2 size={14} className="shrink-0" />
              )}

              <span>
                {t("screens.ledger.effectiveRate")}: 1 {t("ui.primaryCurrency")}{" "}
                = {effectiveRate.toFixed(2)} {selectedFund?.currency_code}
              </span>

              {rateDeviationPct > 5 && (
                <span className="text-amber-600">
                  ({t("screens.checkout.fundRateShort")} {listedRate.toFixed(2)}
                  )
                </span>
              )}
            </div>
          )}

          {/* Primary-currency fund: real change / shortfall, can block */}
          {!isForeignFund && amountInFundCurrency > 0 && (
            <div
              className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${
                shortfall > 0
                  ? "bg-amber-50 text-amber-700"
                  : change > 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-stone-100 text-stone-500"
              }`}
            >
              {shortfall > 0 ? (
                <AlertCircle size={14} className="shrink-0" />
              ) : change > 0 ? (
                <Banknote size={14} className="shrink-0" />
              ) : (
                <CheckCircle2 size={14} className="shrink-0" />
              )}

              <span>
                {shortfall > 0 &&
                  `${t("screens.checkout.stillNeeds")}: ${money(shortfall)}`}
                {shortfall === 0 &&
                  change > 0 &&
                  `${t("screens.checkout.change")}: ${money(change)}`}
                {shortfall === 0 &&
                  change === 0 &&
                  t("screens.checkout.paymentComplete")}
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-stone-200 bg-white px-5 py-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-11 rounded-xl border border-stone-300 px-5 font-bold text-stone-700 transition hover:bg-stone-50"
        >
          {t("common.cancel")}
        </button>

        <button
          disabled={
            checkingOut ||
            !funds.length ||
            amountInFundCurrency <= 0 ||
            (!isForeignFund && shortfall > 0)
          }
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 font-black text-white shadow-lg shadow-teal-200 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CreditCard size={18} />

          {checkingOut
            ? t("common.saving")
            : t("screens.checkout.completeSale")}
        </button>
      </div>
    </form>
  );
}
