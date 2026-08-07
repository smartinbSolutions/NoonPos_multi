import { Save, X, Package, DollarSign, Percent } from "lucide-react";
import { useState } from "react";
import { toast, ToastContainer } from "react-toastify";
import { useTranslation } from "react-i18next";
import { normalizeDigits } from "../../../Global/FormatNumber";
import NumberInput from "../../../Global/NumberInput";

const emptyForm = {
  name: "",
  costPrice: "",
  salePrice: "",
  unit_id: "",
  tax_id: "",
};

export default function ProductQuickAddModal({
  units,
  taxes,
  canUseUnits,
  canUseTaxes,
  saving,
  onClose,
  onSubmit,
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error(t("screens.products.nameRequired"));
      return;
    }

    if (Number(form.costPrice) <= 0) {
      toast.error(t("screens.products.validCost"));
      return;
    }

    if (Number(form.salePrice) <= 0) {
      toast.error(t("screens.products.validSale"));
      return;
    }

    await onSubmit({
      name: form.name.trim(),
      latinName: "",
      costPrice: Number(form.costPrice || 0),
      salePrice: Number(form.salePrice || 0),
      quantity: 0,
      oldQuantity: 0,
      unit_id: form.unit_id ? Number(form.unit_id) : null,
      tax_id: form.tax_id ? Number(form.tax_id) : null,
      logo: "",
      barcodes: [],
      productUnits: [],
    });
  };

  const inputClass =
    "h-10 w-full rounded-xl border border-[#e1e7fb] bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-350 focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400";
  const inputWithPrefixClass = inputClass + " pl-8";
  const labelClass =
    "flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-400";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/80 bg-[#f8faff] shadow-[0_32px_100px_rgba(15,23,42,0.28)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#e9edfb] bg-white/80 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eef1ff] text-[#4663ff]">
                <Package size={16} />
              </span>
              <h2 className="text-[15px] font-black text-slate-950">
                {t("screens.products.quickAddProduct", "Quick add product")}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label={t("common.close")}
            >
              <X size={17} />
            </button>
          </div>

          <div className="grid gap-3.5 p-5">
            <div className="space-y-1.5">
              <label className={labelClass}>
                {t("ui.name")} <span className="text-red-400">*</span>
              </label>
              <input
                required
                autoFocus
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder={t("screens.products.enterProductName")}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={labelClass}>
                  {t("ui.costPrice")} <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <DollarSign
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-350"
                  />
                  <NumberInput
                    required
                    value={form.costPrice}
                    onChange={(val) => updateField("costPrice", val)}
                    className={inputWithPrefixClass}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>
                  {t("screens.products.baseSalePrice")}{" "}
                  <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <DollarSign
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-400"
                  />
                  <NumberInput
                    required
                    value={form.salePrice}
                    onChange={(val) => updateField("salePrice", val)}
                    className={
                      inputWithPrefixClass +
                      " font-black text-emerald-700 focus:border-emerald-400 focus:ring-emerald-400/15"
                    }
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={labelClass}>{t("ui.unit")}</label>
                <select
                  value={form.unit_id}
                  onChange={(event) =>
                    updateField("unit_id", event.target.value)
                  }
                  disabled={!canUseUnits}
                  className={inputClass}
                >
                  <option value="">
                    {canUseUnits
                      ? t("ui.selectUnit")
                      : t("ui.unitsUnavailable")}
                  </option>

                  {units?.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} {unit.code ? `(${unit.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>{t("ui.tax")}</label>
                <div className="relative">
                  <Percent
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-350"
                  />
                  <select
                    value={form.tax_id}
                    onChange={(event) =>
                      updateField("tax_id", event.target.value)
                    }
                    disabled={!canUseTaxes}
                    className={inputWithPrefixClass}
                  >
                    <option value="">
                      {canUseTaxes
                        ? t("screens.products.noTaxOption")
                        : t("screens.products.taxesUnavailable")}
                    </option>

                    {taxes?.map((tax) => (
                      <option key={tax.id} value={tax.id}>
                        {tax.name} ({tax.rate}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#e9edfb] bg-white/80 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#4663ff] px-4 text-sm font-black text-white shadow-md shadow-[#4663ff]/25 transition hover:bg-[#3854e8] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={15} />
              {saving ? t("common.saving") : t("screens.products.create")}
            </button>
          </div>
        </form>
      </div>

      <ToastContainer position="top-right" />
    </>
  );
}
