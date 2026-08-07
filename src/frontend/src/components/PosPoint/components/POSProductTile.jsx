import { Package2, Percent, Tag } from "lucide-react";
import { getAssetUrl } from "../../../Global/assetUrl";

export default function POSProductTile({
  product,
  outOfStock,
  onClick,
  money,
  formatNumber,
  t,
}) {
  const taxRate = Number(product.tax_rate || 0);
  const hasTax = Boolean(product.tax_id) && taxRate > 0;
  const priceWithTax = hasTax
    ? Number(product.price || 0) * (1 + taxRate / 100)
    : Number(product.price || 0);

  const unitLabel = !product.is_base
    ? t("screens.pos.unitOfBase", "{{unit}} of {{baseUnit}}", {
        unit: product.unit_name,
        baseUnit: product.base_unit_name,
      })
    : null;

  return (
    <button
      type="button"
      disabled={outOfStock}
      onClick={onClick}
      className={`group overflow-hidden rounded-2xl border border-stone-200 bg-white text-start shadow-sm shadow-stone-200/70 transition ${
        outOfStock
          ? "cursor-not-allowed opacity-50"
          : "hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-100 active:scale-[0.97]"
      }`}
    >
      {/* IMAGE */}
      <div className="relative aspect-[4/3] bg-stone-100">
        {product.logo ? (
          <img
            src={getAssetUrl(product.logo)}
            alt={product.name || t("ui.product")}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-blue-600">
            <Package2 size={30} />
          </div>
        )}

        {!product.is_base && (
          <div className="absolute start-2 top-2 flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-[11px] font-black text-stone-700 shadow-sm backdrop-blur">
            <Tag size={11} className="text-blue-600" />
            {unitLabel && (
              <p className="mt-1.5 truncate text-start text-[11px] font-semibold text-stone-400">
                {t(
                  "screens.pos.unitEquals",
                  "{{unitLabel}} = {{factor}} {{baseUnit}}",
                  {
                    unitLabel,
                    factor: formatNumber(product.conversion_factor || 1, 0),
                    baseUnit: product.base_unit_name,
                  }
                )}
              </p>
            )}
          </div>
        )}

        {outOfStock && (
          <div className="absolute inset-x-0 bottom-0 bg-rose-600/90 px-2 py-1 text-center text-[11px] font-black text-white">
            {t("screens.pos.outOfStock", "Out of stock")}
          </div>
        )}
      </div>

      {/* BODY */}
      <div className="p-3">
        <h3 className="truncate text-sm font-black text-stone-950">
          {product.name || t("ui.unnamedProduct")}
        </h3>

        {/* PRICE — the only element that needs forced LTR, since it's a
            currency symbol + digits, not a sentence */}
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span
            dir="ltr"
            className="text-xl font-black leading-none text-blue-700"
          >
            {money(priceWithTax)}
          </span>
          {hasTax && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
              <Percent size={10} />
              {t("screens.pos.taxIncluded", "incl. {{rate}}% tax", {
                rate: taxRate,
              })}
            </span>
          )}
        </div>

        <div className="mt-2 truncate rounded-lg bg-stone-50 px-2 py-1.5 text-start text-[11px] font-semibold text-stone-500">
          {t("screens.pos.availableCount", "{{label}}: {{count}}", {
            label: unitLabel || t("ui.available", "Available"),
            count: formatNumber(product.quantity || 0, 2),
          })}
        </div>
      </div>
    </button>
  );
}
