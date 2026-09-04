// packages/app/src/renderer/features/boms/components/BomFormPage.jsx

import { useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Factory,
  AlertCircle,
  Loader2,
  Star,
} from "lucide-react";
import { toast } from "react-toastify";
import { ToastContainer } from "react-toastify";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import useBomForm from "../hooks/useBomForm";
import SearchableSelect from "../../../Global/SearchableSelect";
import NumberInput from "../../../Global/NumberInput";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import DeleteModal from "../../../Global/DeleteModel";

const inputClass =
  "h-9 w-full rounded-xl border border-[#e1e7fb] bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-350 focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const panelClass =
  "relative overflow-hidden rounded-2xl border border-[#e9edfb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const panelBodyClass = "p-4";

function AccentRule({ colorClass }) {
  return <div className={`absolute inset-x-0 top-0 h-[3px] ${colorClass}`} />;
}

export default function BomFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { money } = usePrimaryCurrency();

  const {
    isEdit,
    bom,
    setBom,
    items,
    products,
    setProducts,
    existingBomsForProduct,
    addItem,
    removeItem,
    selectOutputProduct,
    selectItemProduct,
    updateItemUnit,
    updateItemQuantity,
    estimatedCost,
    canSave,
    loading,
    saving,
    error,
    submit,
  } = useBomForm();

  const [deleteItemIndex, setDeleteItemIndex] = useState(null);

  const outputProduct = products.find((p) => p.id === bom.product_id);

  const handleSave = async () => {
    if (!canSave) return;
    const res = await submit();
    if (res?.success) {
      toast.success(
        isEdit
          ? t("screens.boms.updated", "BOM updated")
          : t("screens.boms.created", "BOM created"),
      );
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <Loader2 size={22} className="animate-spin" />
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
                {isEdit
                  ? t("screens.boms.editTitle", "Edit BOM")
                  : t("screens.boms.createTitle", "New BOM")}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/boms")}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <ArrowLeft size={14} />
            {t("common.back")}
          </button>
        </section>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Output product + name */}
        <section className={panelClass}>
          <AccentRule colorClass="bg-[#4663ff]" />
          <div className={panelBodyClass}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-400">
                  {t("screens.boms.outputProduct", "Output Product")}
                </label>
                <SearchableSelect
                  placeholder={t("ui.selectProduct")}
                  options={products}
                  selectedValue={bom.product_id}
                  selectedLabel={outputProduct?.name}
                  disabled={isEdit}
                  onChange={(e) => selectOutputProduct(e.id)}
                  onInputChange={async (value) => {
                    try {
                      const res = await window.api.getProducts({
                        page: 1,
                        limit: 50,
                        type: "normal",
                        search: value.trim() || undefined,
                      });
                      setProducts(res?.data || []);
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                />
                {!bom.product_id && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-amber-600">
                    <AlertCircle size={12} />
                    {t("errors.productRequired", "Select a product")}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-400">
                  {t("screens.boms.bomName", "BOM Name")}
                </label>
                <input
                  type="text"
                  className={inputClass}
                  value={bom.name}
                  onChange={(e) =>
                    setBom((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder={t(
                    "screens.boms.bomNamePlaceholder",
                    "e.g. Standard",
                  )}
                />
              </div>
            </div>

            {/* Default picker — only relevant once this product has more than one BOM */}
            {existingBomsForProduct.length > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2.5">
                <input
                  type="checkbox"
                  id="bom-is-default"
                  checked={bom.is_default}
                  onChange={(e) =>
                    setBom((prev) => ({
                      ...prev,
                      is_default: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-amber-500"
                />
                <label
                  htmlFor="bom-is-default"
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-700"
                >
                  <Star size={13} />
                  {t(
                    "screens.boms.makeDefault",
                    "Make this the default recipe for this product",
                  )}
                </label>
              </div>
            )}

            <div className="mt-3">
              <label className="mb-1 block text-[11px] font-bold text-slate-400">
                {t("ui.notes", "Notes")}
              </label>
              <textarea
                className={`${inputClass} h-auto min-h-[3rem] resize-none py-2`}
                value={bom.notes}
                onChange={(e) =>
                  setBom((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder={t(
                  "screens.boms.notesPlaceholder",
                  "Optional notes",
                )}
                rows={2}
              />
            </div>
          </div>
        </section>

        {/* Raw materials */}
        <section className={panelClass}>
          <AccentRule colorClass="bg-violet-500" />
          <div className="flex items-center justify-between gap-3 border-b border-[#eef1ff] px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-black text-slate-900">
                {t("screens.boms.rawMaterials", "Raw Materials")}
              </h2>
              {items.length > 0 && (
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600">
                  {items.length}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#4663ff] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#3854e8]"
            >
              <Plus size={13} />
              {t("screens.boms.addMaterial", "Add Material")}
            </button>
          </div>

          <div className="divide-y divide-[#eef1ff]">
            {items.map((item, index) => (
              <div
                key={index}
                className="space-y-2.5 p-3.5 transition hover:bg-[#fafbff]"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      placeholder={t("ui.selectProduct")}
                      options={products.filter((p) => p.id !== bom.product_id)}
                      selectedValue={item.raw_material_product_id}
                      selectedLabel={item.name}
                      onChange={(e) => selectItemProduct(index, e.id)}
                      onInputChange={async (value) => {
                        try {
                          const res = await window.api.getProducts({
                            page: 1,
                            limit: 50,
                            type: "normal",
                            search: value.trim() || undefined,
                          });
                          setProducts(res?.data || []);
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                    />
                    {item.code && (
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                        #{item.code}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setDeleteItemIndex(index)}
                    disabled={items.length === 1}
                    title={
                      items.length === 1
                        ? t(
                            "screens.boms.keepOneItem",
                            "Keep at least one material",
                          )
                        : undefined
                    }
                    className="mt-0.5 rounded-lg p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-slate-400">
                      {t("ui.qty")}
                    </label>
                    <NumberInput
                      className={inputClass}
                      value={item.quantity}
                      onChange={(val) => updateItemQuantity(index, val)}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-slate-400">
                      {t("ui.unit")}
                    </label>
                    {item.available_units?.length > 0 ? (
                      <select
                        className={inputClass}
                        value={item.unit_id || ""}
                        onChange={(e) => updateItemUnit(index, e.target.value)}
                      >
                        {item.available_units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.unit_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex h-9 items-center rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs text-slate-400">
                        {item.unit_name || "—"}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-slate-400">
                      {t("screens.boms.lineEstCost", "Est. Cost")}
                    </label>
                    <div className="flex h-9 items-center rounded-xl bg-[#f6f8fd] px-3 text-sm font-black tabular-nums text-red-600">
                      {money(
                        Number(item.quantity || 0) *
                          Number(item.unit_conversion_factor || 1) *
                          Number(item.cost_price || 0),
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-[#eef1ff] px-4 py-3">
            <span className="text-xs font-black text-slate-700">
              {t("screens.boms.totalEstCost", "Total Estimated Cost")}
            </span>
            <span className="text-lg font-black tabular-nums text-[#4663ff]">
              {money(estimatedCost)}
            </span>
          </div>
        </section>

        {/* Save */}
        <section className={panelClass}>
          <div
            className={`${panelBodyClass} flex items-center justify-between`}
          >
            {!canSave && !saving && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <AlertCircle size={12} />
                {!bom.product_id
                  ? t("errors.productRequired", "Select a product")
                  : t("errors.addOneItem")}
              </p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="ml-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#4663ff] px-5 text-sm font-black text-white shadow-md shadow-[#4663ff]/25 transition hover:bg-[#3854e8] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )}
              {isEdit
                ? t("common.save")
                : t("screens.boms.create", "Create BOM")}
            </button>
          </div>
        </section>
      </div>

      <DeleteModal
        open={deleteItemIndex !== null}
        onClose={() => setDeleteItemIndex(null)}
        onConfirm={() => {
          removeItem(deleteItemIndex);
          setDeleteItemIndex(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />

      <ToastContainer />
    </div>
  );
}
