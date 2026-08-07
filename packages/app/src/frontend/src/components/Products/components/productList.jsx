import {
  Barcode,
  Briefcase,
  Edit2,
  Eye,
  FileSpreadsheet,
  History,
  Layers,
  Package,
  PackagePlus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import useProductCatalog from "../hooks/useProductCatalog";
import useProductMovements from "../hooks/useProductMovements";
import DeleteModal from "../../../Global/DeleteModel";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { formatNumber } from "../../../Global/FormatNumber";
import { getAssetUrl } from "../../../Global/assetUrl";
import { useTranslation } from "react-i18next";
import ProductImportModal from "./ProductImportModal";
import Pagination from "../../../Global/Pagination";
import { useNavigate } from "react-router-dom";
import ProductUpdateModal from "./ProductUpdateModal";

export default function ProductList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const catalog = useProductCatalog();
  const { money } = usePrimaryCurrency();

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [updateExportModalOpen, setUpdateExportModalOpen] = useState(false);
  const {
    products,
    barcodesByProduct,
    loading,
    saving,
    error,
    refetch,
    search,
    setSearch,
    actionError,
    handleDeleteProduct,
    openDeleteModel,
    setOpenDeleteModel,
    setSelectDeleteProduct,
    selectDeleteProduct,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    totalCost,
  } = catalog;

  const totalQuantity = products.reduce(
    (total, product) => total + Number(product.quantity || 0),
    0
  );

  // A product's full barcode count spans two sources: the product-level
  // barcodes list (barcodesByProduct, from get-product-barcodes) and any
  // barcode attached directly to a selling unit (product.productUnits).
  // Neither alone is the real count a cashier could scan against.
  const getBarcodeCount = (product) => {
    const productLevel = (barcodesByProduct[product.id] || []).length;
    const unitLevel = (product.productUnits || []).filter((u) =>
      String(u.barcode || "").trim()
    ).length;
    return productLevel + unitLevel;
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <main className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.14)] backdrop-blur">
          <div className="grid gap-6 p-7 xl:grid-cols-[1fr_420px]">
            <div>
              <p className="mb-2 text-xs font-bold uppercase  text-[#4663ff]">
                {t("ui.inventory")}
              </p>
              <h1 className="max-w-2xl text-4xl font-black leading-tight text-slate-950">
                {t("screens.products.title")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                {t("screens.products.subtitle")}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-3xl border border-[#e5ebff] bg-[#f8faff] p-4">
                <Package size={20} className="mb-4 text-[#4663ff]" />
                <div className="text-2xl font-black text-slate-950">
                  {products.length}
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  {t("ui.products")}
                </div>
              </div>
              <div className="rounded-3xl border border-[#e5ebff] bg-[#f8faff] p-4">
                <Barcode size={20} className="mb-4 text-[#4663ff]" />
                <div className="text-2xl font-black text-slate-950">
                  {formatNumber(totalQuantity, 2)}
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  {t("ui.quantity")}
                </div>
              </div>
              <div className="rounded-3xl border border-[#e5ebff] bg-[#f8faff] p-4">
                <Package size={20} className="mb-4 text-[#4663ff]" />
                <div className="text-2xl font-black text-slate-950">
                  {money(totalCost)}
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  {t("ui.retailValue")}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#e5ebff] bg-white/60 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-12 w-full rounded-2xl border border-[#dbe4ff] bg-white/90 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10"
                placeholder={t("screens.products.search")}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={refetch}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
              >
                <RefreshCw size={16} />
                {t("common.refresh")}
              </button>
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
              >
                <FileSpreadsheet size={16} />
                {t("screens.products.import")}
              </button>
              <button
                type="button"
                onClick={() => setUpdateExportModalOpen(true)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
              >
                <FileSpreadsheet size={16} />
                {t("screens.products.updateProducts", "Update Products")}
              </button>
              <button
                type="button"
                onClick={() => navigate("/products/new")}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#4663ff] px-5 text-sm font-bold text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8]"
              >
                <PackagePlus size={17} />
                {t("screens.products.add")}
              </button>
            </div>
          </div>
        </section>

        {(error || actionError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {actionError || error}
          </div>
        )}

        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)]">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-500">
              {t("screens.products.loading")}
            </div>
          ) : products.length === 0 ? (
            <div className="p-12 text-center">
              <Package size={42} className="mx-auto text-[#4663ff]" />
              <h2 className="mt-4 text-xl font-black text-slate-950">
                {t("screens.products.empty")}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {t("screens.products.emptyHint")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-[#e5ebff] bg-[#f8faff] text-xs font-bold uppercase  text-slate-500">
                    <th className="px-5 py-3 text-start">{t("ui.product")}</th>
                    <th className="px-5 py-3 text-start">
                      {t("screens.products.productType", "Type")}
                    </th>
                    <th className="px-5 py-3 text-start">{t("ui.unit")}</th>
                    <th className="px-5 py-3 text-start">{t("ui.qty")}</th>
                    <th className="px-5 py-3 text-start">{t("ui.cost")}</th>
                    <th className="px-5 py-3 text-start">{t("ui.price")}</th>
                    <th className="px-5 py-3 text-start">{t("ui.tax")}</th>
                    <th className="px-5 py-3 text-start">
                      {t("screens.products.sellingUnits")}
                    </th>
                    <th className="px-5 py-3 text-start">{t("ui.barcodes")}</th>
                    <th className="px-5 py-3 text-start">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef1ff]">
                  {products.map((product) => {
                    const isService = product.type === "service";
                    const barcodeCount = getBarcodeCount(product);

                    return (
                      <tr
                        key={product.id}
                        className="transition hover:bg-[#f8faff]"
                      >
                        <td className="px-5 py-3 max-w-[280px]">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f8faff] text-[#4663ff]">
                              {product.logo ? (
                                <img
                                  src={getAssetUrl(product.logo)}
                                  alt={product.name || t("ui.product")}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Package size={18} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate font-bold text-slate-950 text-sm"
                                title={product.name || t("ui.unnamedProduct")}
                              >
                                {product.name || t("ui.unnamedProduct")}
                              </div>
                              {product.code && (
                                <div className="truncate text-[11px] font-semibold text-slate-400">
                                  {product.code}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {isService ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-600">
                              <Briefcase size={12} />
                              {t("screens.products.typeService", "Service")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                              <Package size={12} />
                              {t("screens.products.typeNormal", "Normal")}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {product.unit_name ? (
                            <span className="font-semibold">
                              {product.unit_name}
                              {product.unit_code
                                ? ` (${product.unit_code})`
                                : ""}
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              {t("ui.noUnit")}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-start font-bold tabular-nums text-slate-950">
                          {isService ? (
                            <span className="font-normal text-slate-400">
                              —
                            </span>
                          ) : (
                            formatNumber(product.quantity || 0, 2)
                          )}
                        </td>
                        <td className="px-5 py-3 text-start font-bold tabular-nums text-red-600">
                          {money(product.costPrice || 0)}
                        </td>
                        <td className="px-5 py-3 text-start font-bold tabular-nums text-emerald-600">
                          {money(product.salePrice || 0)}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {product.tax_name ? (
                            <span className="font-semibold">
                              {/* {product.tax_name} */}({product.tax_rate}%)
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              {t("screens.products.noTaxOption")}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-start text-slate-500">
                          {Number(product.unitCount || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-bold text-[#4663ff]">
                              <Layers size={12} />
                              {t("screens.products.extraUnitsCount", {
                                count: product.unitCount,
                              })}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-start">
                          {barcodeCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                              <Barcode size={12} />
                              {barcodeCount}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-start gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(`/products/${product.id}`)
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                              aria-label={t("screens.products.movementsAria")}
                            >
                              <Eye size={15} />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                navigate(`/products/${product.id}/edit`)
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                              aria-label={t("screens.products.editAria")}
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenDeleteModel(true);
                                setSelectDeleteProduct(product);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50"
                              aria-label={t("screens.products.deleteAria")}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
            </div>
          )}
        </section>
      </main>

      <ProductImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={refetch}
      />

      <ProductUpdateModal
        isOpen={updateExportModalOpen}
        onClose={() => setUpdateExportModalOpen(false)}
        onUpdated={refetch}
      />

      <DeleteModal
        open={openDeleteModel}
        onClose={() => setOpenDeleteModel(false)}
        onConfirm={() => handleDeleteProduct(selectDeleteProduct)}
        title={t("screens.products.deleteTitle")}
        message={t("screens.products.deleteMessage")}
      />
    </div>
  );
}
