import React, { useState } from "react";
import { RefreshCw, Search, Filter, X, SlidersHorizontal } from "lucide-react";
import NumberInput from "./NumberInput";

const VARIANTS = {
  blue: {
    border: "border-[#e5ebff]",
    bg: "bg-[#f8faff]",
    icon: "text-[#4663ff]",
    value: "text-slate-950",
  },
  amber: {
    border: "border-amber-100",
    bg: "bg-amber-50/50",
    icon: "text-amber-600",
    value: "text-slate-950",
  },
  violet: {
    border: "border-violet-100",
    bg: "bg-violet-50/50",
    icon: "text-violet-600",
    value: "text-slate-950",
  },
  brand: {
    border: "border-[#4663ff]/20",
    bg: "bg-[#4663ff]/[0.06]",
    icon: "text-[#4663ff]",
    value: "text-[#4663ff]",
  },
};

// Normalizes "is this field currently filtering anything" across both
// scalar filters (date/number/select — active when non-empty) and
// multiselect filters (an array — active when non-empty array).
function isFieldActive(rawValue) {
  if (Array.isArray(rawValue)) return rawValue.length > 0;
  return rawValue !== null && rawValue !== undefined && rawValue !== "";
}

export default function InvoiceListHeader({
  badgeLabel,
  badgeIcon: BadgeIcon,
  title,
  subtitle,
  stats = [],
  search,
  onSearchChange,
  searchPlaceholder,
  onRefresh,
  addLabel,
  addIcon: AddIcon,
  onAdd,
  filters,
  onFilterChange,
  onClearFilters,
  filterFields = [],
  clearLabel = "Clear",
}) {
  const [showFilters, setShowFilters] = useState(false);

  const gridColsClass =
    stats.length >= 4
      ? "grid-cols-4"
      : stats.length === 3
        ? "grid-cols-3"
        : "grid-cols-2";

  const activeEntries = filterFields
    .map((field) => {
      const rawValue = filters?.[field.name];
      if (!isFieldActive(rawValue)) return null;

      let displayValue = rawValue;

      if (field.type === "select") {
        const match = field.options.find(
          (opt) => String(opt.value) === String(rawValue)
        );
        displayValue = match?.label ?? rawValue;
      }

      if (field.type === "multiselect") {
        const selectedLabels = (rawValue || []).map((v) => {
          const match = field.options.find(
            (opt) => String(opt.value) === String(v)
          );
          return match?.label ?? v;
        });
        displayValue =
          selectedLabels.length > 2
            ? `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2}`
            : selectedLabels.join(", ");
      }

      return {
        name: field.name,
        label: field.label,
        value: displayValue,
        isMultiselect: field.type === "multiselect",
      };
    })
    .filter(Boolean);

  const hasActiveFilters = activeEntries.length > 0;

  const filterGridColsClass =
    filterFields.length >= 5
      ? "md:grid-cols-3 lg:grid-cols-5"
      : filterFields.length === 4
        ? "md:grid-cols-2 lg:grid-cols-4"
        : "md:grid-cols-2 lg:grid-cols-3";

  return (
    <section className="overflow-hidden rounded-2xl border border-white/80 bg-white/80 shadow-[0_12px_40px_rgba(70,99,255,0.10)] backdrop-blur">
      <div className="grid gap-4 p-4 lg:grid-cols-2 lg:items-center">
        <div>
          {badgeLabel && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#eef3ff] px-2.5 py-0.5">
              {BadgeIcon && <BadgeIcon size={11} className="text-[#4663ff]" />}
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#4663ff]">
                {badgeLabel}
              </span>
            </div>
          )}
          <h1 className="text-2xl font-black leading-tight text-slate-950">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 max-w-md text-xs leading-5 text-slate-500">
              {subtitle}
            </p>
          )}
        </div>

        <div className={`grid gap-2 ${gridColsClass}`}>
          {stats.map((stat, i) => {
            const variant = VARIANTS[stat.variant || "blue"];
            const StatIcon = stat.icon;
            return (
              <div
                key={i}
                className={`rounded-xl border ${variant.border} ${variant.bg} px-2.5 py-2.5`}
              >
                {StatIcon ? (
                  <StatIcon size={13} className={`mb-1.5 ${variant.icon}`} />
                ) : (
                  <div
                    className={`mb-1.5 text-[10px] font-black ${variant.icon}`}
                  >
                    {stat.eyebrow}
                  </div>
                )}
                <div
                  className={`text-base font-black tabular-nums ${variant.value}`}
                >
                  {stat.value}
                </div>
                <div className="text-[10px] font-semibold text-slate-500">
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-[#e5ebff] bg-white/60 p-3.5 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-full rounded-xl border border-[#dbe4ff] bg-white/90 pl-9 pr-3 text-xs outline-none transition focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12"
            placeholder={searchPlaceholder}
          />
        </div>

        {filterFields.length > 0 && (
          <button
            onClick={() => setShowFilters((prev) => !prev)}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
              showFilters || hasActiveFilters
                ? "border-[#4663ff] bg-[#eef3ff] text-[#4663ff]"
                : "border-[#dbe4ff] bg-white text-slate-600 hover:bg-[#eef3ff] hover:text-[#4663ff]"
            }`}
          >
            <SlidersHorizontal size={14} />
            {hasActiveFilters && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#4663ff] text-[9px] font-black text-white">
                {activeEntries.length}
              </span>
            )}
          </button>
        )}

        <button
          onClick={onRefresh}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#dbe4ff] bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-[#cbd7ff] hover:bg-[#eef3ff] hover:text-[#4663ff]"
        >
          <RefreshCw size={14} />
        </button>

        {onAdd && (
          <button
            onClick={onAdd}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#4663ff] px-3.5 text-xs font-bold text-white shadow-md shadow-[#4663ff]/25 transition hover:bg-[#3854e8]"
          >
            {AddIcon && <AddIcon size={14} />}
            {addLabel}
          </button>
        )}
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#e5ebff] bg-white/40 px-3.5 py-2.5">
          <Filter size={12} className="shrink-0 text-slate-400" />
          {activeEntries.map((entry) => (
            <span
              key={entry.name}
              className="inline-flex items-center gap-1 rounded-full border border-[#dbe4ff] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm"
            >
              <span className="text-slate-400">{entry.label}:</span>
              <span className="font-bold text-[#4663ff]">{entry.value}</span>
              <button
                onClick={() =>
                  onFilterChange(entry.name, entry.isMultiselect ? [] : "")
                }
                className="ms-0.5 rounded-full p-0.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
              >
                <X size={11} />
              </button>
            </span>
          ))}

          {onClearFilters && (
            <button
              onClick={onClearFilters}
              className="ms-1 inline-flex items-center gap-1 text-[11px] font-bold text-red-500 transition hover:text-red-600"
            >
              <X size={11} />
              {clearLabel}
            </button>
          )}
        </div>
      )}

      {showFilters && filterFields.length > 0 && (
        <div
          className={`grid grid-cols-2 gap-3 border-t border-[#e5ebff] bg-white/60 p-3.5 ${filterGridColsClass}`}
        >
          {filterFields.map((field) => {
            const isActive = isFieldActive(filters?.[field.name]);

            const fieldWrapperClass = "flex flex-col gap-1";
            const labelClass = `text-[10px] font-bold uppercase tracking-wide ${
              isActive ? "text-[#4663ff]" : "text-slate-400"
            }`;
            const inputBaseClass = `h-9 rounded-lg border bg-white px-2.5 text-xs outline-none transition focus:ring-[3px] focus:ring-[#4663ff]/12 ${
              isActive
                ? "border-[#4663ff]/40 bg-[#f8faff]"
                : "border-[#dbe4ff] focus:border-[#4663ff]"
            }`;

            if (field.type === "date") {
              return (
                <div key={field.name} className={fieldWrapperClass}>
                  <label className={labelClass}>{field.label}</label>
                  <input
                    type="date"
                    value={filters?.[field.name] || ""}
                    onChange={(e) => onFilterChange(field.name, e.target.value)}
                    className={inputBaseClass}
                  />
                </div>
              );
            }

            if (field.type === "number") {
              return (
                <div key={field.name} className={fieldWrapperClass}>
                  <label className={labelClass}>{field.label}</label>
                  <NumberInput
                    value={filters?.[field.name] ?? ""}
                    onChange={(val) => onFilterChange(field.name, val)}
                    placeholder="0"
                    className={inputBaseClass}
                  />
                </div>
              );
            }

            if (field.type === "multiselect") {
              const selectedValues = filters?.[field.name] || [];

              const selectedOptions = selectedValues
                .map((v) =>
                  field.options.find((opt) => String(opt.value) === String(v))
                )
                .filter(Boolean);

              const addOption = (optionValue) => {
                if (!optionValue) return;
                const exists = selectedValues.some(
                  (v) => String(v) === String(optionValue)
                );
                if (exists) return;
                onFilterChange(field.name, [...selectedValues, optionValue]);
              };

              const removeOption = (optionValue) => {
                onFilterChange(
                  field.name,
                  selectedValues.filter(
                    (v) => String(v) !== String(optionValue)
                  )
                );
              };

              return (
                <div key={field.name} className={fieldWrapperClass}>
                  <label className={labelClass}>{field.label}</label>
                  <div
                    className={`flex min-h-9 flex-wrap items-center gap-1 rounded-lg border bg-white px-1.5 py-1 ${
                      isActive
                        ? "border-[#4663ff]/40 bg-[#f8faff]"
                        : "border-[#dbe4ff]"
                    }`}
                  >
                    {selectedOptions.map((opt) => (
                      <span
                        key={opt.value}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#4663ff]/20 bg-[#eef3ff] px-1.5 py-0.5 text-[11px] font-bold text-[#4663ff]"
                      >
                        {opt.label}
                        <button
                          type="button"
                          onClick={() => removeOption(opt.value)}
                          className="rounded p-0.5 text-[#4663ff]/60 transition hover:bg-white hover:text-red-600"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}

                    <select
                      value=""
                      onChange={(e) => addOption(e.target.value)}
                      className="h-7 min-w-[5.5rem] flex-1 rounded-md border-none bg-transparent px-1 text-xs text-slate-500 outline-none focus:ring-0"
                    >
                      <option value="">
                        {selectedOptions.length > 0
                          ? "+"
                          : field.allLabel || field.label}
                      </option>
                      {field.options
                        .filter(
                          (opt) =>
                            !selectedValues.some(
                              (v) => String(v) === String(opt.value)
                            )
                        )
                        .map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              );
            }

            return (
              <div key={field.name} className={fieldWrapperClass}>
                <label className={labelClass}>{field.label}</label>
                <select
                  value={filters?.[field.name] || ""}
                  onChange={(e) => onFilterChange(field.name, e.target.value)}
                  className={inputBaseClass}
                >
                  <option value="">{field.allLabel || field.label}</option>
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
