// packages/app/src/renderer/features/boms/components/BomList.jsx

import {
  Factory,
  Layers,
  Edit2,
  Eye,
  Star,
  Trash2,
  Wallet2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useBoms from "../hooks/useBoms";
import DeleteModal from "../../../Global/DeleteModel";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { formatNumber } from "../../../Global/FormatNumber";
import Pagination from "../../../Global/Pagination";
import InvoiceListHeader from "../../../Global/InvoiceListHeader";

export default function BomList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { money } = usePrimaryCurrency();

  const {
    boms,
    loading,
    error,
    refetch,
    search,
    setSearch,
    actionError,
    handleDeleteBom,
    openDeleteModel,
    setOpenDeleteModel,
    selectDeleteBom,
    setSelectDeleteBom,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
  } = useBoms();

  const totalEstimatedCost = boms.reduce(
    (sum, bom) => sum + Number(bom.estimated_cost || 0),
    0,
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <main className="mx-auto max-w-7xl space-y-6">
        <InvoiceListHeader
          badgeLabel={t("ui.manufacturing", "Manufacturing")}
          title={t("screens.boms.title", "Bills of Materials")}
          subtitle={t(
            "screens.boms.subtitle",
            "Recipes used to manufacture products",
          )}
          stats={[
            {
              icon: Layers,
              value: boms.length,
              label: t("screens.boms.title", "BOMs"),
            },
            {
              icon: Wallet2,
              value: money(totalEstimatedCost),
              label: t("screens.boms.estimatedCost", "Est. cost (this page)"),
              variant: "brand",
            },
          ]}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("screens.boms.search", "Search by BOM name")}
          onRefresh={refetch}
          addLabel={t("screens.boms.add", "New BOM")}
          addIcon={Factory}
          onAdd={() => navigate("/boms/new")}
        />

        {(error || actionError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {actionError || error}
          </div>
        )}

        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)]">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-500">
              {t("screens.boms.loading", "Loading BOMs...")}
            </div>
          ) : boms.length === 0 ? (
            <div className="p-12 text-center">
              <Factory size={42} className="mx-auto text-[#4663ff]" />
              <h2 className="mt-4 text-xl font-black text-slate-950">
                {t("screens.boms.empty", "No BOMs yet")}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {t(
                  "screens.boms.emptyHint",
                  "Create a recipe to start manufacturing products.",
                )}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-[#e5ebff] bg-[#f8faff] text-xs font-bold uppercase text-slate-500">
                    <th className="px-5 py-3 text-start">
                      {t("screens.boms.outputProduct", "Output Product")}
                    </th>
                    <th className="px-5 py-3 text-start">
                      {t("ui.name", "Name")}
                    </th>
                    <th className="px-5 py-3 text-start">
                      {t("screens.boms.default", "Default")}
                    </th>
                    <th className="px-5 py-3 text-start">
                      {t("screens.boms.ingredients", "Ingredients")}
                    </th>
                    <th className="px-5 py-3 text-start">
                      {t("screens.boms.estimatedCost", "Est. Cost")}
                    </th>
                    <th className="px-5 py-3 text-start">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef1ff]">
                  {boms.map((bom) => (
                    <tr key={bom.id} className="transition hover:bg-[#f8faff]">
                      <td className="px-5 py-3 max-w-[240px]">
                        <div
                          className="truncate font-bold text-slate-950 text-sm"
                          title={bom.product_name}
                        >
                          {bom.product_name}
                        </div>
                        {bom.product_code && (
                          <div className="truncate text-[11px] font-semibold text-slate-400">
                            {bom.product_code}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-700">
                        {bom.name}
                      </td>
                      <td className="px-5 py-3">
                        {bom.is_default ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                            <Star size={12} />
                            {t("screens.boms.defaultBadge", "Default")}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-bold text-[#4663ff]">
                          <Layers size={12} />
                          {t("screens.boms.itemCount", {
                            count: bom.items.length,
                            defaultValue: "{{count}} items",
                          })}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-start font-bold tabular-nums text-red-600">
                        {money(bom.estimated_cost || 0)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => navigate(`/boms/${bom.id}`)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                            aria-label={t("screens.boms.viewAria", "View BOM")}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/boms/${bom.id}/edit`)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                            aria-label={t("screens.boms.editAria", "Edit BOM")}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenDeleteModel(true);
                              setSelectDeleteBom(bom);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50"
                            aria-label={t(
                              "screens.boms.deleteAria",
                              "Delete BOM",
                            )}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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

      <DeleteModal
        open={openDeleteModel}
        onClose={() => setOpenDeleteModel(false)}
        onConfirm={() => handleDeleteBom(selectDeleteBom)}
        title={t("screens.boms.deleteTitle", "Delete BOM")}
        message={t(
          "screens.boms.deleteMessage",
          "Are you sure you want to delete this BOM?",
        )}
      />
    </div>
  );
}
