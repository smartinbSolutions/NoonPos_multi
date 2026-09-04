// packages/app/src/renderer/features/manufacturingOrders/components/ManufacturingOrderDetailPage.jsx

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Factory,
  Wallet2,
  Loader2,
  AlertCircle,
  StickyNote,
} from "lucide-react";
import { toast } from "react-toastify";
import { ToastContainer } from "react-toastify";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { formatNumber } from "../../../Global/FormatNumber";
import DeleteModal from "../../../Global/DeleteModel";

const panelClass =
  "relative overflow-hidden rounded-2xl border border-[#e9edfb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const panelBodyClass = "p-4";

function AccentRule({ colorClass }) {
  return <div className={`absolute inset-x-0 top-0 h-[3px] ${colorClass}`} />;
}

export default function ManufacturingOrderDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { money } = usePrimaryCurrency();
  const api = window.api;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchOrder = () => {
    setLoading(true);
    setError("");
    api
      .getManufacturingOrder(id)
      .then((res) => {
        if (res.success) {
          setOrder(res.data);
        } else {
          setError(res.error);
        }
      })
      .catch((err) => setError(err.message || t("errors.loadError")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await api.deleteManufacturingOrder(order.id);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(t("screens.manufacturingOrders.deleted", "Order deleted"));
      navigate("/manufacturing-orders");
    } finally {
      setDeleting(false);
      setDeleteModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#f6f8fd] p-5">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              {error ||
                t("screens.manufacturingOrders.notFound", "Order not found")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate("/manufacturing-orders")}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
          >
            <ArrowLeft size={14} />
            {t("common.back")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8fd] text-slate-900">
      <div className="mx-auto max-w-4xl space-y-4 p-5">
        {/* Header */}
        <section className="flex flex-col gap-3 rounded-2xl border border-[#e9edfb] bg-white px-5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4663ff] text-white shadow-md shadow-[#4663ff]/25">
              <Factory size={18} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#4663ff]">
                {t("ui.manufacturing", "Manufacturing")}
              </p>
              <h1 className="text-lg font-black leading-tight text-slate-950">
                {order.order_name}
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                {order.output_product_name}
                {order.output_product_code
                  ? ` · #${order.output_product_code}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/manufacturing-orders")}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
            >
              <ArrowLeft size={14} />
              {t("common.back")}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/manufacturing-orders/${order.id}/edit`)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#dbe4ff] bg-white px-3.5 text-sm font-bold text-[#4663ff] transition hover:bg-[#eef3ff]"
            >
              <Edit2 size={14} />
              {t("common.edit")}
            </button>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 text-sm font-bold text-red-600 transition hover:bg-red-50"
            >
              <Trash2 size={14} />
              {t("common.delete")}
            </button>
          </div>
        </section>

        {order.description && (
          <section className={panelClass}>
            <AccentRule colorClass="bg-amber-500" />
            <div className={`${panelBodyClass} flex items-start gap-2.5`}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <StickyNote size={14} />
              </span>
              <p className="text-sm font-medium text-slate-700">
                {order.description}
              </p>
            </div>
          </section>
        )}

        {/* Output summary */}
        <section className={panelClass}>
          <AccentRule colorClass="bg-[#4663ff]" />
          <div className={panelBodyClass}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <p className="text-[11px] font-bold text-slate-400">
                  {t("ui.qty")}
                </p>
                <p className="font-black tabular-nums text-slate-950">
                  {formatNumber(order.output_quantity, 2)}{" "}
                  {order.output_unit_name}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400">
                  {t("ui.date")}
                </p>
                <p className="font-black text-slate-950">
                  {order.date ? order.date.slice(0, 10) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400">
                  {t("screens.manufacturingOrders.unitCost", "Cost per unit")}
                </p>
                <p className="font-black tabular-nums text-[#4663ff]">
                  {money(order.unit_cost)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400">
                  {t("ui.total")}
                </p>
                <p className="font-black tabular-nums text-red-600">
                  {money(order.total_cost)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Raw materials */}
        <section className={panelClass}>
          <AccentRule colorClass="bg-violet-500" />
          <div className="flex items-center justify-between gap-3 border-b border-[#eef1ff] px-4 py-3">
            <h2 className="text-[13px] font-black text-slate-900">
              {t("screens.boms.rawMaterials", "Raw Materials")}
            </h2>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600">
              {order.items.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-[#e5ebff] bg-[#f8faff] text-xs font-bold uppercase text-slate-500">
                  <th className="px-4 py-2.5 text-start">{t("ui.product")}</th>
                  <th className="px-4 py-2.5 text-start">{t("ui.qty")}</th>
                  <th className="px-4 py-2.5 text-start">{t("ui.unit")}</th>
                  <th className="px-4 py-2.5 text-start">{t("ui.cost")}</th>
                  <th className="px-4 py-2.5 text-start">{t("ui.total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1ff]">
                {order.items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-[#fafbff]">
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-slate-950">
                        {item.raw_material_name}
                      </div>
                      {item.raw_material_code && (
                        <div className="text-[11px] font-semibold text-slate-400">
                          #{item.raw_material_code}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-700">
                      {formatNumber(item.quantity, 2)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {item.unit_name || "—"}
                    </td>
                    <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-700">
                      {money(item.unit_cost_snapshot)}
                    </td>
                    <td className="px-4 py-2.5 font-bold tabular-nums text-red-600">
                      {money(item.line_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[#eef1ff] px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs font-black text-slate-700">
              <Wallet2 size={14} className="text-[#4663ff]" />
              {t(
                "screens.manufacturingOrders.rawMaterialCost",
                "Raw material cost",
              )}
            </span>
            <span className="text-lg font-black tabular-nums text-[#4663ff]">
              {money(order.raw_material_cost)}
            </span>
          </div>
        </section>

        {/* Cost breakdown */}
        <section className={panelClass}>
          <AccentRule colorClass="bg-emerald-500" />
          <div className={panelBodyClass}>
            <h2 className="mb-3 text-[13px] font-black text-slate-900">
              {t("ui.summary", "Cost Summary")}
            </h2>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>
                  {t(
                    "screens.manufacturingOrders.rawMaterialCost",
                    "Raw material cost",
                  )}
                </span>
                <span className="tabular-nums text-slate-700">
                  {money(order.raw_material_cost)}
                </span>
              </div>
              {Number(order.labor_cost) > 0 && (
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>
                    {t(
                      "screens.manufacturingOrders.addLaborCost",
                      "Labor cost",
                    )}
                  </span>
                  <span className="tabular-nums text-slate-700">
                    {money(order.labor_cost)}
                  </span>
                </div>
              )}
              {Number(order.overhead_cost) > 0 && (
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>
                    {t(
                      "screens.manufacturingOrders.addOverheadCost",
                      "Overhead cost",
                    )}
                  </span>
                  <span className="tabular-nums text-slate-700">
                    {money(order.overhead_cost)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-[#eef1ff] pt-1.5 text-sm font-black text-slate-900">
                <span>{t("ui.total")}</span>
                <span className="tabular-nums text-red-600">
                  {money(order.total_cost)}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <DeleteModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title={t(
          "screens.manufacturingOrders.deleteTitle",
          "Delete Manufacturing Order",
        )}
        message={t(
          "screens.manufacturingOrders.deleteMessage",
          "Are you sure you want to delete this order? Stock will be reversed if possible.",
        )}
      />

      <ToastContainer />
    </div>
  );
}
