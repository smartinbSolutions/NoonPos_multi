import { Wallet, CreditCard, AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { normalizeDigits } from "../../../Global/FormatNumber";
import NumberInput from "../../../Global/NumberInput";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const cents = (value) => Math.round(toNumber(value) * 100) / 100;

export default function CheckoutModal({
  funds,
  total,
  checkingOut,
  onClose,
  onCheckout,
  t,
  money,
}) {
  // per fund: how much of the total this fund covers (primary currency),
  // and how much actually lands in the fund (fund currency). fundAmtEdited
  // tracks whether the second field has been hand-edited, so we know
  // whether to keep auto-filling it from the system rate or leave it alone.
  const [allocations, setAllocations] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!funds.length) {
      setAllocations({});
      return;
    }

    setAllocations((current) => {
      const fundIds = new Set(funds.map((fund) => String(fund.id)));
      return Object.fromEntries(
        Object.entries(current).filter(([fundId]) => fundIds.has(fundId))
      );
    });
  }, [funds]);

  const getRate = (fund) => toNumber(fund.currency_exchangeRate || 1) || 1;

  const updatePortion = (fund, value) => {
    const rate = getRate(fund);
    const key = String(fund.id);

    setAllocations((current) => {
      const existing = current[key] || {};
      const sameCurrency = rate === 1;

      return {
        ...current,
        [key]: {
          portion: value,
          // same-currency fund: fund amount always mirrors the portion.
          // foreign fund: keep the hand-edited fund amount if the user set
          // one, otherwise default it from the system rate.
          fundAmt: sameCurrency
            ? value
            : existing.fundAmtEdited
              ? existing.fundAmt
              : cents(toNumber(value) * rate),
          fundAmtEdited: sameCurrency ? false : existing.fundAmtEdited || false,
        },
      };
    });

    setError("");
  };

  const updateFundAmt = (fund, value) => {
    const key = String(fund.id);

    setAllocations((current) => ({
      ...current,
      [key]: {
        ...current[key],
        fundAmt: value,
        fundAmtEdited: true,
      },
    }));

    setError("");
  };

  const rows = useMemo(() => {
    return funds.map((fund) => {
      const key = String(fund.id);
      const rate = getRate(fund);
      const entry = allocations[key] || {};

      // Raw values for display — preserve exactly what was typed, including
      // an in-progress "5." or "0.5", so NumberInput doesn't collapse it
      // (same bug class as recalcItem in useAddPurchase/useAddSales).
      const rawPortion = entry.portion ?? "";
      const rawFundAmt = entry.fundAmt ?? "";

      // Numeric values for math only — never fed back into an input's value.
      const portion = toNumber(rawPortion);
      const fundAmt = toNumber(rawFundAmt);
      const sameCurrency = rate === 1;

      // for a foreign fund, the effective rate is whatever the two typed
      // numbers imply - not necessarily the fund's listed rate
      const effectiveRate =
        !sameCurrency && portion > 0 ? fundAmt / portion : rate;

      const rateDeviationPct =
        !sameCurrency && rate
          ? Math.abs((effectiveRate - rate) / rate) * 100
          : 0;

      return {
        fund,
        rate,
        sameCurrency,
        rawPortion,
        rawFundAmt,
        portion,
        fundAmt,
        effectiveRate,
        rateDeviationPct,
      };
    });
  }, [funds, allocations]);

  const allocatedTotal = useMemo(
    () => cents(rows.reduce((sum, row) => sum + row.portion, 0)),
    [rows]
  );

  // positive = still unallocated, negative = over-allocated, 0 = exact
  const allocationDiff = useMemo(
    () => cents(total - allocatedTotal),
    [total, allocatedTotal]
  );

  const isFullyAllocated = Math.abs(allocationDiff) < 0.01;

  const submit = async (event) => {
    event.preventDefault();

    const payments = rows
      .filter((row) => row.portion > 0)
      .map((row) => ({
        fundId: Number(row.fund.id),
        amount: row.portion,
        amount_fund_currency: row.sameCurrency ? row.portion : row.fundAmt,
        currency_code: row.fund.currency_code,
        exchange_rate: row.sameCurrency ? 1 : row.effectiveRate,
      }));

    if (!payments.length) {
      setError(t("screens.checkout.selectFundError"));
      return;
    }

    if (!isFullyAllocated) {
      const message =
        allocationDiff > 0
          ? t("screens.checkout.remainingToAllocate", {
              amount: money(allocationDiff),
            })
          : t("screens.payments.overAllocatedBy", {
              amount: money(-allocationDiff),
            });
      setError(message);
      toast.error(message);
      return;
    }

    try {
      await onCheckout({
        payments,
        received: allocatedTotal,
      });
      onClose();
    } catch (err) {
      console.error("Checkout failed:", err);
      setError(err?.message || t("screens.checkout.failed"));
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-stone-950">
                  {t("screens.checkout.paidIntoFund")}
                </h3>
                <p className="text-xs text-stone-500">
                  {t("screens.checkout.fundHint")}
                </p>
              </div>

              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-600 shadow-sm ring-1 ring-stone-200">
                {t("screens.checkout.fundCount", { count: funds.length })}
              </span>
            </div>

            <div className="space-y-2.5">
              {rows.map(
                ({
                  fund,
                  rate,
                  sameCurrency,
                  rawPortion,
                  rawFundAmt,
                  portion,
                  fundAmt,
                  effectiveRate,
                  rateDeviationPct,
                }) => (
                  <div
                    key={fund.id}
                    className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm shadow-stone-200/60"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                        <Wallet size={19} />
                      </div>

                      <div className="min-w-0">
                        <h4 className="truncate font-black text-stone-950">
                          {fund.name}
                        </h4>
                        <p className="mt-0.5 truncate text-xs font-semibold text-stone-500">
                          {fund.currency_code ||
                            fund.currency_name ||
                            t("screens.checkout.noCurrency")}
                        </p>
                      </div>

                      {!sameCurrency && (
                        <span className="ml-auto shrink-0 text-[11px] font-semibold text-stone-400">
                          1 = {rate}
                        </span>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-black text-stone-600">
                        <span>{t("screens.checkout.portionOfTotal")}</span>

                        <div className="flex h-11 overflow-hidden rounded-xl border border-stone-200 bg-white focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100">
                          <NumberInput
                            value={rawPortion}
                            allowDecimal
                            onChange={(val) => updatePortion(fund, val)}
                            className="min-w-0 flex-1 bg-transparent px-3 text-base font-black text-stone-950 outline-none placeholder:text-stone-400"
                            placeholder="0"
                          />

                          <span className="flex items-center border-l border-stone-200 bg-stone-50 px-3 text-xs font-black text-stone-500">
                            {t("ui.primaryCurrency")}
                          </span>
                        </div>
                      </label>

                      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-black text-stone-600">
                        <span>
                          {t("ui.amount")} · {fund.currency_code}
                        </span>

                        <div
                          className={`flex h-11 overflow-hidden rounded-xl border ${
                            sameCurrency
                              ? "border-stone-100 bg-stone-50"
                              : "border-stone-200 bg-white focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100"
                          }`}
                        >
                          <NumberInput
                            value={sameCurrency ? rawPortion : rawFundAmt}
                            disabled={sameCurrency}
                            allowDecimal
                            onChange={(val) => updateFundAmt(fund, val)}
                            className="min-w-0 flex-1 bg-transparent px-3 text-base font-black text-stone-950 outline-none placeholder:text-stone-400 disabled:text-stone-400"
                            placeholder="0"
                          />
                          <span className="flex items-center border-l border-stone-200 bg-stone-50 px-3 text-xs font-black text-stone-500">
                            {fund.currency_code || fund.currency_symbol || ""}
                          </span>
                        </div>
                      </label>
                    </div>

                    {!sameCurrency && portion > 0 && (
                      <div
                        className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold ${
                          rateDeviationPct > 5
                            ? "bg-amber-50 text-amber-700"
                            : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {rateDeviationPct > 5 ? (
                          <AlertCircle size={13} className="shrink-0" />
                        ) : (
                          <CheckCircle2 size={13} className="shrink-0" />
                        )}
                        <span>
                          {t("screens.ledger.effectiveRate")}: 1{" "}
                          {t("ui.primaryCurrency")} = {effectiveRate.toFixed(2)}{" "}
                          {fund.currency_code}
                        </span>
                        {rateDeviationPct > 5 && (
                          <span className="text-amber-600">
                            ({t("screens.checkout.fundRateShort")}{" "}
                            {rate.toFixed(2)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </section>

          <aside className="lg:sticky lg:top-0 lg:self-start">
            <div className="rounded-2xl bg-stone-950 p-5 text-white shadow-xl shadow-stone-300/60">
              <div className="flex items-center justify-between gap-3 text-sm text-stone-300">
                <span>{t("screens.checkout.totalDue")}</span>
                <span>{t("screens.checkout.currentSale")}</span>
              </div>
              <div className="mt-3 truncate text-3xl font-black">
                {money(total)}
              </div>
            </div>

            <div className="mt-3 grid gap-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm shadow-stone-200/60">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2.5">
                <span className="text-xs font-bold text-stone-500">
                  {t("screens.checkout.allocated")}
                </span>
                <span className="truncate text-sm font-black text-stone-950">
                  {money(allocatedTotal)}
                </span>
              </div>

              <div
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${
                  isFullyAllocated
                    ? "bg-emerald-50 text-emerald-700"
                    : allocationDiff > 0
                      ? "bg-amber-50 text-amber-700"
                      : "bg-red-50 text-red-700"
                }`}
              >
                {isFullyAllocated ? (
                  <CheckCircle2 size={15} className="shrink-0" />
                ) : (
                  <AlertCircle size={15} className="shrink-0" />
                )}
                <span>
                  {isFullyAllocated
                    ? t("screens.checkout.fullyAllocated")
                    : allocationDiff > 0
                      ? `${t("screens.checkout.remainingToAllocate")}: ${money(allocationDiff)}`
                      : `${t("screens.checkout.overAllocatedBy")}: ${money(-allocationDiff)}`}
                </span>
              </div>
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            )}
          </aside>
        </div>
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
          type="submit"
          disabled={checkingOut || !funds.length || !isFullyAllocated}
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
