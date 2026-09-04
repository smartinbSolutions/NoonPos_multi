// packages/app/src/renderer/features/manufacturingOrders/components/ManufacturingOrderList.jsx

import { Factory, Layers, Edit2, Eye, Trash2, Wallet2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useManufacturingOrders from "../hooks/useManufacturingOrders";
import DeleteModal from "../../../Global/DeleteModel";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { formatNumber } from "../../../Global/FormatNumber";
import Pagination from "../../../Global/Pagination";
import InvoiceListHeader from "../../../Global/InvoiceListHeader";
import SearchableSelect from "../../../Global/SearchableSelect";

export default function ManufacturingOrderList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { money } = usePrimaryCurrency();

  const {
    orders,
    loading,
    error,
    refetch,
    actionError,
    units,
    search,
    setSearch,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    filters,
    setFilters,
    clearFilters,
    outputProductOptions,
    outputProductLabel,
    setOutputProductLabel,
    searchOutputProducts,
    handleDeleteOrder,
    openDeleteModel,
    setOpenDeleteModel,
    selectDeleteOrder,
    setSelectDeleteOrder,
  } = useManufacturingOrders();

  const totalCost = orders.reduce(
    (sum, o) => sum + Number(o.total_cost || 0),
    0,
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <main className="mx-auto max-w-7xl space-y-6">
        <InvoiceListHeader
          badgeLabel={t("ui.manufacturing", "Manufacturing")}
          title={t("screens.manufacturingOrders.title", "Manufacturing Orders")}
          subtitle={t(
            "screens.manufacturingOrders.subtitle",
            "Track what you've manufactured, its cost, and stock impact",
          )}
          stats={[
            {
              icon: Factory,
              value: orders.length,
              label: t("screens.manufacturingOrders.title", "Orders"),
            },
            {
              icon: Wallet2,
              value: money(totalCost),
              label: t(
                "screens.manufacturingOrders.totalCostStat",
                "Total cost (this page)",
              ),
              variant: "brand",
            },
          ]}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t(
            "screens.manufacturingOrders.search",
            "Search by order name",
          )}
          onRefresh={refetch}
          addLabel={t("screens.manufacturingOrders.add", "New Order")}
          addIcon={Factory}
          onAdd={() => navigate("/manufacturing-orders/new")}
          filters={filters}
          onFilterChange={(name, value) =>
            setFilters({ [name]: value || null })
          }
          onClearFilters={clearFilters}
          filterFields={[
            {
              type: "search",
              name: "output_product_id",
              label: t("screens.boms.outputProduct", "Output Product"),
              placeholder: t("ui.selectProduct"),
              options: outputProductOptions,
              selectedLabel: outputProductLabel,
              onInputChange: searchOutputProducts,
              onSelect: (option) => setOutputProductLabel(option.name),
              onClear: () => setOutputProductLabel(""),
            },
            {
              type: "select",
              name: "unit_id",
              label: t("ui.unit"),
              allLabel: t("common.all"),
              options: units.map((u) => ({ value: u.id, label: u.name })),
            },
            {
              type: "date",
              name: "dateFrom",
              label: t("filters.dateFrom"),
            },
            {
              type: "date",
              name: "dateTo",
              label: t("filters.dateTo"),
            },
          ]}
        />

        {(error || actionError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {t(`errors.${actionError || error}`, actionError || error)}
          </div>
        )}

        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)]">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-500">
              {t("screens.manufacturingOrders.loading", "Loading orders...")}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center">
              <Factory size={42} className="mx-auto text-[#4663ff]" />
              <h2 className="mt-4 text-xl font-black text-slate-950">
                {t(
                  "screens.manufacturingOrders.empty",
                  "No manufacturing orders yet",
                )}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {t(
                  "screens.manufacturingOrders.emptyHint",
                  "Create an order to manufacture a product from raw materials.",
                )}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-[#e5ebff] bg-[#f8faff] text-xs font-bold uppercase text-slate-500">
                    <th className="px-5 py-3 text-start">
                      {t("ui.name", "Order")}
                    </th>
                    <th className="px-5 py-3 text-start">
                      {t("screens.boms.outputProduct", "Output Product")}
                    </th>
                    <th className="px-5 py-3 text-start">{t("ui.qty")}</th>
                    <th className="px-5 py-3 text-start">
                      {t("screens.boms.ingredients", "Ingredients")}
                    </th>
                    <th className="px-5 py-3 text-start">{t("ui.date")}</th>
                    <th className="px-5 py-3 text-start">
                      {t("screens.manufacturingOrders.unitCost", "Cost/Unit")}
                    </th>
                    <th className="px-5 py-3 text-start">{t("ui.total")}</th>
                    <th className="px-5 py-3 text-start">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef1ff]">
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="transition hover:bg-[#f8faff]"
                    >
                      <td className="px-5 py-3 font-bold text-slate-950">
                        {order.order_name}
                      </td>
                      <td className="px-5 py-3 max-w-[220px]">
                        <div
                          className="truncate font-semibold text-slate-700"
                          title={order.output_product_name}
                        >
                          {order.output_product_name}
                        </div>
                        {order.output_product_code && (
                          <div className="truncate text-[11px] font-semibold text-slate-400">
                            #{order.output_product_code}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 font-semibold tabular-nums text-slate-700">
                        {formatNumber(order.output_quantity, 2)}{" "}
                        {order.output_unit_name}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-bold text-[#4663ff]">
                          <Layers size={12} />
                          {t("screens.boms.itemCount", {
                            count: order.item_count,
                            defaultValue: "{{count}} items",
                          })}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {order.date ? order.date.slice(0, 10) : "—"}
                      </td>
                      <td className="px-5 py-3 font-bold tabular-nums text-slate-700">
                        {money(order.unit_cost || 0)}
                      </td>
                      <td className="px-5 py-3 font-bold tabular-nums text-red-600">
                        {money(order.total_cost || 0)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-start gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/manufacturing-orders/${order.id}`)
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                            aria-label={t(
                              "screens.manufacturingOrders.viewAria",
                              "View order",
                            )}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/manufacturing-orders/${order.id}/edit`)
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                            aria-label={t(
                              "screens.manufacturingOrders.editAria",
                              "Edit order",
                            )}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenDeleteModel(true);
                              setSelectDeleteOrder(order);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50"
                            aria-label={t(
                              "screens.manufacturingOrders.deleteAria",
                              "Delete order",
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
        onConfirm={() => handleDeleteOrder(selectDeleteOrder)}
        title={t(
          "screens.manufacturingOrders.deleteTitle",
          "Delete Manufacturing Order",
        )}
        message={t(
          "screens.manufacturingOrders.deleteMessage",
          "Are you sure you want to delete this order? Stock will be reversed if possible.",
        )}
      />
    </div>
  );
}
