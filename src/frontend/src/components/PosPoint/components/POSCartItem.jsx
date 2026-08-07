import { Minus, Plus, Trash2, Percent, Tag, StickyNote } from "lucide-react";
import HoverTooltip from "../../../Global/HoverTooltip";
import { normalizeDigits } from "../../../Global/FormatNumber";
import NumberInput from "../../../Global/NumberInput";

export default function POSCartItem({
  item,
  onOpenPriceModal,
  onUpdateQuantity,
  onRemove,
  money,
  t,
}) {
  const taxRate = Number(item.tax_rate || 0);
  const hasTax = Boolean(item.tax_id) && taxRate > 0;

  const discountRate = Number(item.discount_rate || 0);
  const hasDiscount = discountRate > 0.005;

  const hasNote = Boolean(item.description?.trim());

  // Per-unit tax-inclusive price, for the "was → now" comparison line —
  // display only, not used for the actual total.
  const unitPriceWithTax = hasTax
    ? item.price * (1 + taxRate / 100)
    : item.price;
  const originalUnitPrice = hasDiscount
    ? unitPriceWithTax / (1 - discountRate / 100)
    : unitPriceWithTax;

  // The real total — already fully computed by recalcCartItem in the
  // hook (discount then tax applied, same cascade as manual sales).
  // Never recompute this locally; it's the one source of truth.
  const lineTotal = Number(item.lineTotal || 0);

  return (
    <div
      className="rounded-2xl border border-stone-200 bg-white p-3.5 cursor-pointer shadow-sm hover:border-blue-200 hover:shadow-md transition duration-150"
      onClick={() => onOpenPriceModal(item)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black text-stone-950">
            {item.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!item.is_base && item.unit_name && (
              <span className="flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">
                <Tag size={10} className="text-blue-600" />
                {item.unit_name}
              </span>
            )}
            {hasTax && (
              <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                <Percent size={10} />
                {t("screens.pos.taxIncluded", "incl. {{rate}}% tax", {
                  rate: taxRate,
                })}
              </span>
            )}
            {hasDiscount && (
              <span className="flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                <Percent size={10} />
                {t("screens.pos.discountApplied", "{{rate}}% off", {
                  rate: discountRate.toFixed(2),
                })}
              </span>
            )}
            {hasNote && (
              <HoverTooltip
                placement="top"
                trigger={
                  <span className="flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                    <StickyNote size={10} />
                  </span>
                }
                content={item.description}
              />
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-90"
          aria-label={t("screens.pos.clear")}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex h-11 items-center overflow-hidden rounded-xl border border-stone-200 bg-white">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateQuantity(item.id, item.qty === 1 ? -1 : item.qty - 1);
            }}
            className="flex h-11 w-11 items-center justify-center text-stone-700 transition hover:bg-stone-100 active:scale-90"
          >
            <Minus size={15} />
          </button>

          <NumberInput
            value={item.qty}
            onClick={(e) => e.stopPropagation()}
            onChange={(val) => onUpdateQuantity(item.id, val)}
            className="h-11 w-14 bg-transparent text-center text-base font-black text-stone-950 outline-none"
          />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateQuantity(item.id, item.qty + 1);
            }}
            className="flex h-11 w-11 items-center justify-center text-stone-700 transition hover:bg-stone-100 active:scale-90"
          >
            <Plus size={15} />
          </button>
        </div>

        <div className="text-end">
          <p className="text-[10px] text-stone-500">{t("ui.subtotal")}</p>
          {hasDiscount && (
            <p
              dir="ltr"
              className="text-[10px] font-semibold text-stone-400 line-through"
            >
              {money(originalUnitPrice * item.qty)}
            </p>
          )}
          <h3 dir="ltr" className="text-base font-black text-blue-700">
            {money(lineTotal)}
          </h3>
        </div>
      </div>
    </div>
  );
}
