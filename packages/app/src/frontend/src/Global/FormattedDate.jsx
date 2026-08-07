import { useTranslation } from "react-i18next";

// Maps app language codes to BCP-47 locale tags for Intl formatting.
const LOCALE_MAP = {
  ar: "ar-SY",
  en: "en-US",
  tr: "tr-TR",
};

/**
 * Renders a date-only value with a hover tooltip showing the full
 * date + time. Accepts anything `new Date()` can parse (ISO strings,
 * epoch ms, Date objects) — matches values coming from SQLite's
 * `datetime('now')` columns and JS Date objects alike.
 *
 * Usage:
 *   <FormattedDate value={inv.date} />
 *   <FormattedDate value={inv.date} dateOnly={false} />  // full date+time inline, no tooltip
 *   <FormattedDate value={inv.date} className="text-slate-500" />
 */
export default function FormattedDate({
  value,
  dateOnly = true,
  showTooltip = true,
  className = "",
  emptyFallback = "—",
}) {
  const { i18n } = useTranslation();
  const locale = LOCALE_MAP[i18n.language] || "en-US";

  if (!value) {
    return <span className={className}>{emptyFallback}</span>;
  }

  const parsed = new Date(value);
  const isValid = !Number.isNaN(parsed.getTime());

  if (!isValid) {
    return <span className={className}>{emptyFallback}</span>;
  }

  const datePart = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);

  const fullDateTime = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);

  // When dateOnly is false, just show the full date+time directly, no tooltip needed.
  if (!dateOnly) {
    return <span className={className}>{fullDateTime}</span>;
  }

  if (!showTooltip) {
    return <span className={className}>{datePart}</span>;
  }

  return (
    <span className={`group relative inline-block cursor-default ${className}`}>
      {datePart}
      <span className="pointer-events-none absolute start-1/2 bottom-full z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100">
        {fullDateTime}
      </span>
    </span>
  );
}
