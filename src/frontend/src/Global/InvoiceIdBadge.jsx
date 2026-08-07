/**
 * Displays an invoice's id and name as a single unified badge/pill.
 * Truncates long names and shows the full text on hover only in
 * that overflow case.
 *
 * Usage:
 *   <InvoiceIdBadge id={inv.id} name={inv.invoice_name} />
 */
export default function InvoiceIdBadge({ id, name, maxNameWidth = "160px" }) {
  return (
    <span className="group relative inline-flex max-w-full items-center gap-1.5 rounded-xl bg-[#eef3ff] px-3 py-1.5 text-xs font-black text-[#4663ff]">
      <span className="shrink-0">#{id}</span>
      {name && (
        <>
          <span className="shrink-0 text-[#4663ff]/40">·</span>
          <span
            className="truncate font-black"
            style={{ maxWidth: maxNameWidth }}
          >
            {name}
          </span>
          <span className="pointer-events-none absolute start-0 bottom-full z-20 mb-1.5 max-w-[220px] whitespace-normal rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            {name}
          </span>
        </>
      )}
    </span>
  );
}
