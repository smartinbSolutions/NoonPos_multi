export const formatNumber = (value, maxDecimals = 4) => {
  const num = Number(value);

  if (!Number.isFinite(num)) return "0";

  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
};

export const getPrimaryCurrency = (currencies = []) =>
  currencies.find((currency) => Number(currency?.isPrimary) === 1) ||
  currencies[0] ||
  null;

export const formatMoney = (value, currency, options = {}) => {
  const num = Number(value);
  const symbol =
    currency?.symbol ||
    currency?.currency_symbol ||
    currency?.fund_currency_symbol ||
    currency ||
    "";
  const code =
    currency?.code ||
    currency?.currency_code ||
    currency?.fund_currency_code ||
    "";
  const suffix = options.showCode && code ? ` ${code}` : "";

  const formatted = Number.isFinite(num)
    ? num.toLocaleString(undefined, {
        minimumFractionDigits: options.minimumFractionDigits ?? 0,
        maximumFractionDigits: options.maximumFractionDigits ?? 4,
      })
    : "0";

  return symbol ? `${formatted}${suffix} ${symbol}` : `${formatted}${suffix}`;
};

// Converts Arabic-Indic (٠-٩) and Extended/Persian (۰-۹) digits to
// Western 0-9, so typing on an Arabic/Persian keyboard layout still
// produces a value <input type="number"> — or Number() — can parse.
// A plain <input type="number"> silently rejects these digits outright,
// even though they're numerals to the person typing them.
export function normalizeDigits(value) {
  if (!value) return value;
  return value.replace(/[٠-٩۰-۹]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660); // Arabic-Indic
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0); // Extended Arabic-Indic
    return char;
  });
}
