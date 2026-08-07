export default function CategoryTags({ names, maxVisible = 2 }) {
  const list = (names || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  if (list.length === 0) return <span className="text-slate-400">-</span>;

  const visible = list.slice(0, maxVisible);
  const hidden = list.slice(maxVisible);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((name) => (
        <span
          key={name}
          className="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600"
        >
          {name}
        </span>
      ))}

      {hidden.length > 0 && (
        <span className="group relative inline-block">
          <span className="inline-flex cursor-default items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
            +{hidden.length}
          </span>
          <span className="pointer-events-none absolute bottom-full start-0 z-20 mb-1.5 max-w-[220px] whitespace-normal rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            {hidden.join(", ")}
          </span>
        </span>
      )}
    </div>
  );
}
