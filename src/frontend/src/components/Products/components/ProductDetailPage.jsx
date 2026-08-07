import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  Package,
  History,
  Info,
  Layers,
  Barcode,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { formatNumber } from "../../../Global/FormatNumber";
import { getAssetUrl } from "../../../Global/assetUrl";
import Pagination from "../../../Global/Pagination";
import useProductMovements from "../hooks/useProductMovements";
import GoTo from "../../../Global/GoTo";
import BackButton from "../../../Global/BackButton";

const TABS = [
  { key: "details", icon: Info },
  { key: "movements", icon: History },
];

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { money } = usePrimaryCurrency();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("details");

  const {
    movements,
    loading: movementsLoading,
    error: movementsError,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    fetchMovements,
  } = useProductMovements(id);

  useEffect(() => {
    const loadProduct = async () => {
      setLoading(true);
      const result = await window.api.getProduct(Number(id));
      setProduct(result || null);
      setLoading(false);
    };
    loadProduct();
  }, [id]);

  useEffect(() => {
    if (activeTab === "movements") {
      fetchMovements();
    }
  }, [activeTab, fetchMovements]);

  const isService = product?.type === "service";

  const panelClass =
    "rounded-[28px] border border-[#e5ebff] bg-white/85 p-5 shadow-sm";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        {t("screens.products.loading")}
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500">
        <p>{t("screens.products.notFound")}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white px-4 py-2 text-sm font-bold text-[#4663ff] transition hover:bg-[#eef3ff]"
        >
          <ArrowLeft size={16} />
          {t("common.back")}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <main className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <p className="text-xs font-bold uppercase text-[#4663ff]">
              {t("ui.inventory")}
            </p>
            <h1 className="text-2xl font-black text-slate-950">
              {product.name}
            </h1>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* Aside — product summary only */}
          <aside className={panelClass}>
            <div className="mb-5 flex aspect-square items-center justify-center overflow-hidden rounded-[24px] border border-dashed border-[#cbd7ff] bg-[#f8faff]">
              {product.logo ? (
                <img
                  src={getAssetUrl(product.logo)}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Package size={44} className="text-[#4663ff]" />
              )}
            </div>

            <div className="space-y-3">
              {/* Quantity is meaningless for a service — no physical stock
                  behind it — so the card is dropped entirely rather than
                  shown pinned at 0. */}
              {!isService && (
                <div className="rounded-2xl bg-[#eef3ff] p-4">
                  <p className="text-xs font-bold text-slate-500">
                    {t("ui.quantity")}
                  </p>
                  <p className="mt-1 text-xl font-black text-slate-950">
                    {formatNumber(product.quantity || 0, 2)}
                    {product.unit_name ? (
                      <span className="ml-1 text-sm font-semibold text-slate-500">
                        {product.unit_name}
                      </span>
                    ) : null}
                  </p>
                </div>
              )}

              <div className="rounded-2xl bg-red-50 p-4">
                <p className="text-xs font-bold text-slate-500">
                  {t("ui.cost")}
                </p>
                <p className="mt-1 text-xl font-black text-red-600">
                  {money(product.costPrice || 0)}
                </p>
              </div>

              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-bold text-slate-500">
                  {t("screens.products.baseSalePrice")}
                </p>
                <p className="mt-1 text-xl font-black text-emerald-700">
                  {money(product.salePrice || 0)}
                </p>
              </div>

              {product.tax_name ? (
                <div className="rounded-2xl bg-amber-50 p-4">
                  <p className="text-xs font-bold text-slate-500">
                    {t("ui.tax")}
                  </p>
                  <p className="mt-1 text-xl font-black text-amber-700">
                    {product.tax_name}
                    <span className="ml-1 text-sm font-semibold text-amber-600">
                      ({product.tax_rate}%)
                    </span>
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-500">
                    {t("ui.tax")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-400">
                    {t("screens.products.noTaxOption")}
                  </p>
                </div>
              )}
            </div>
          </aside>

          {/* Main column: prominent tab bar + content panel */}
          <div className="space-y-4">
            <div className="flex gap-2 rounded-[28px] border border-[#e5ebff] bg-white/85 p-2 shadow-sm">
              {TABS.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex flex-1 items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-black transition ${
                    activeTab === key
                      ? "bg-[#4663ff] text-white shadow-lg shadow-[#4663ff]/25"
                      : "text-slate-500 hover:bg-[#eef3ff] hover:text-[#4663ff]"
                  }`}
                >
                  <Icon size={18} />
                  {t(`screens.products.tab.${key}`)}
                </button>
              ))}
            </div>

            <section className={panelClass}>
              {activeTab === "details" && (
                <div className="space-y-5">
                  {(product.latinName ||
                    product.code ||
                    product.description) && (
                    <div className="grid gap-4 rounded-2xl border border-[#e5ebff] bg-[#f8faff] p-4 sm:grid-cols-2">
                      {product.latinName ? (
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            {t("ui.latinName")}
                          </span>
                          <p className="mt-0.5 text-sm font-semibold text-slate-800">
                            {product.latinName}
                          </p>
                        </div>
                      ) : null}

                      {product.code ? (
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            {t("ui.code")}
                          </span>
                          <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800">
                            {product.code}
                          </p>
                        </div>
                      ) : null}

                      {product.description ? (
                        <div className="sm:col-span-2">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            {t("ui.description")}
                          </span>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm font-semibold text-slate-800">
                            {product.description}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div>
                    <h3 className="mb-3 flex items-center gap-2 font-black text-slate-950">
                      <Layers size={17} className="text-[#4663ff]" />
                      {t("screens.products.sellingUnits")}
                    </h3>
                    {product.productUnits?.length ? (
                      <div className="overflow-hidden rounded-2xl border border-[#e5ebff]">
                        <table className="w-full text-sm">
                          <thead className="bg-[#f8faff] text-xs font-bold uppercase text-slate-500">
                            <tr>
                              <th className="px-4 py-2 text-start">
                                {t("ui.unit")}
                              </th>
                              <th className="px-4 py-2 text-start">
                                {t("screens.products.conversionPlaceholder")}
                              </th>
                              <th className="px-4 py-2 text-start">
                                {t("ui.price")}
                              </th>
                              <th className="px-4 py-2 text-start">
                                {t("ui.barcodes")}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#eef1ff]">
                            {product.productUnits.map((unit) => {
                              // The base unit has no barcode column of its own in practice —
                              // its real-world barcode(s) live in product_barcodes instead
                              // (see get-pos-products' barcode short-circuit, which falls
                              // back to product_barcodes for exactly this reason). A
                              // non-base selling unit's barcode always comes from its own
                              // product_units.barcode column.
                              const rowBarcodes = unit.is_base
                                ? unit.barcode
                                  ? [unit.barcode]
                                  : (product.barcodes || []).map(
                                      (b) => b.barcode
                                    )
                                : unit.barcode
                                  ? [unit.barcode]
                                  : [];

                              return (
                                <tr key={unit.id}>
                                  <td className="px-4 py-2 font-semibold text-slate-900">
                                    {unit.unit_name}
                                    {unit.is_base ? (
                                      <span className="ml-2 rounded-full bg-[#eef3ff] px-2 py-0.5 text-xs font-bold text-[#4663ff]">
                                        {t("screens.products.baseUnitBadge")}
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="px-4 py-2 tabular-nums text-slate-600">
                                    × {formatNumber(unit.conversion_factor, 2)}
                                  </td>
                                  <td className="px-4 py-2 font-bold tabular-nums text-emerald-600">
                                    {money(unit.sale_price || 0)}
                                  </td>
                                  <td className="px-4 py-2 text-slate-500">
                                    {rowBarcodes.length ? (
                                      <div className="flex flex-wrap gap-1">
                                        {rowBarcodes.map((code) => (
                                          <span
                                            key={code}
                                            className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600"
                                          >
                                            {code}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">
                        {t("screens.products.noSellingUnits")}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "movements" && (
                <div>
                  <h3 className="mb-4 flex items-center gap-2 font-black text-slate-950">
                    <History size={17} className="text-[#4663ff]" />
                    {t("screens.products.movementsTitle")}
                  </h3>

                  {movementsLoading ? (
                    <div className="flex items-center justify-center py-16 text-sm font-semibold text-slate-500">
                      {t("screens.products.movementsLoading")}
                    </div>
                  ) : movementsError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                      {movementsError}
                    </div>
                  ) : movements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <p className="text-sm font-semibold text-slate-500">
                        {t("screens.products.noMovements")}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {movements.map((movement) => {
                          const isIn = movement.type === "in";
                          // Unit shown here is the movement's own SNAPSHOT
                          // (unit_name/base_unit_name/conversion_factor),
                          // not a live join to the product's current unit —
                          // otherwise renaming/editing a unit later would
                          // silently reinterpret old movement history.
                          const wasNonBaseUnit =
                            movement.unit_name &&
                            movement.base_unit_name &&
                            movement.unit_name !== movement.base_unit_name;

                          return (
                            <div
                              key={movement.id}
                              className="flex items-center justify-between gap-3 rounded-2xl border border-[#e5ebff] bg-[#f8faff] px-4 py-3"
                            >
                              <div className="flex items-center gap-3">
                                {isIn ? (
                                  <ArrowDownCircle
                                    size={20}
                                    className="shrink-0 text-emerald-500"
                                  />
                                ) : (
                                  <ArrowUpCircle
                                    size={20}
                                    className="shrink-0 text-red-500"
                                  />
                                )}
                                <div>
                                  <div className="text-sm font-bold text-slate-950">
                                    {t(
                                      `screens.products.action.${movement.action}`,
                                      { defaultValue: movement.action }
                                    )}

                                    <span className="ml-1.5 inline-flex items-center align-middle">
                                      {movement.action === "delete" ? (
                                        <span className="text-slate-400">
                                          {t(
                                            `screens.products.refType.${movement.reference_type}`,
                                            {
                                              defaultValue:
                                                movement.reference_type,
                                            }
                                          )}
                                        </span>
                                      ) : (
                                        <GoTo
                                          type={movement.reference_type}
                                          id={movement.reference_id}
                                        >
                                          {t(
                                            `screens.products.refType.${movement.reference_type}`,
                                            {
                                              defaultValue:
                                                movement.reference_type,
                                            }
                                          )}
                                        </GoTo>
                                      )}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {new Date(movement.date).toLocaleString()}
                                  </div>
                                </div>
                              </div>

                              {/* Quantity/unit is a stock concept — skipped
                                  entirely for a service's movement rows,
                                  same as the aside's Quantity card. What's
                                  left (action + reference + date) is exactly
                                  the audit trail a service still needs. */}
                              {!isService && (
                                <div className="text-start">
                                  <div
                                    className={`text-sm font-black ${
                                      isIn ? "text-emerald-600" : "text-red-600"
                                    }`}
                                  >
                                    {isIn ? "+" : "-"}
                                    {wasNonBaseUnit
                                      ? formatNumber(
                                          movement.quantity /
                                            movement.conversion_factor,
                                          2
                                        )
                                      : formatNumber(movement.quantity, 2)}{" "}
                                    {wasNonBaseUnit
                                      ? movement.unit_name
                                      : movement.unit_name ||
                                        movement.unit_code ||
                                        ""}
                                  </div>
                                  {wasNonBaseUnit && (
                                    <div className="text-xs text-slate-400">
                                      {t(
                                        "screens.products.movementBaseEquivalent",
                                        {
                                          defaultValue:
                                            "= {{baseQty}} {{baseUnit}}",
                                          baseQty: formatNumber(
                                            movement.quantity,
                                            2
                                          ),
                                          baseUnit: movement.base_unit_name,
                                        }
                                      )}
                                    </div>
                                  )}
                                  {(movement.enterPrice > 0 ||
                                    movement.outPrice > 0) && (
                                    <div className="text-xs text-slate-500">
                                      {money(
                                        movement.enterPrice || movement.outPrice
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={total}
                        limit={limit}
                        onPageChange={setPage}
                        onLimitChange={(newLimit) => {
                          setLimit(newLimit);
                          setPage(1);
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
