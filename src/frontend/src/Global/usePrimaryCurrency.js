import { useEffect, useMemo, useState } from "react";
import { formatMoney, getPrimaryCurrency } from "./FormatNumber";

export default function usePrimaryCurrency() {
  const [currencies, setCurrencies] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadCurrencies = async () => {
      try {
        const result = await window.api?.getCurrencies?.();
        if (!cancelled) {
          setCurrencies(result || []);
        }
      } catch (error) {
        console.error("Failed to load currencies:", error);
        if (!cancelled) {
          setCurrencies([]);
        }
      }
    };

    loadCurrencies();

    return () => {
      cancelled = true;
    };
  }, []);

  const primaryCurrency = useMemo(
    () => getPrimaryCurrency(currencies),
    [currencies]
  );

  const money = useMemo(
    () =>
      (value, currency = primaryCurrency, options) =>
        formatMoney(value, currency, { decimals: 2, ...options }),
    [primaryCurrency]
  );

  return { currencies, primaryCurrency, money };
}
