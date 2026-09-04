import {
  Plus,
  Save,
  Trash2,
  X,
  Package,
  DollarSign,
  Barcode,
  ImagePlus,
  Layers,
  Percent,
  Briefcase,
  Lock,
  TagIcon,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import { getAssetUrl } from "../../../Global/assetUrl";
import { useTranslation } from "react-i18next";
import useProductCatalog from "../hooks/useProductCatalog";
import { normalizeDigits } from "../../../Global/FormatNumber";
import NumberInput from "../../../Global/NumberInput";
import TagPickerField from "../../Tags/components/TagPickerField";

// ---- Shared style tokens ----
const inputClass =
  "h-9 w-full rounded-xl border border-[#e1e7fb] bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-350 focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400";
const inputWithPrefixClass = inputClass + " pl-6";
const labelClass =
  "flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-400";
const smallRemoveBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-600";

// Panel accent recipe: { icon bg/text, top rule, section chip }
const accents = {
  identity: {
    icon: "bg-[#eef1ff] text-[#4663ff]",
    rule: "bg-[#4663ff]",
  },
  pricing: {
    icon: "bg-emerald-50 text-emerald-600",
    rule: "bg-emerald-500",
  },
  units: {
    icon: "bg-violet-50 text-violet-600",
    rule: "bg-violet-500",
  },
  barcodes: {
    icon: "bg-amber-50 text-amber-600",
    rule: "bg-amber-500",
  },
  tags: {
    icon: "bg-pink-50 text-pink-600",
    rule: "bg-pink-500",
  },
};

const Panel = ({ accent, icon, title, action, children }) => (
  <div className="relative overflow-hidden rounded-2xl border border-[#e9edfb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
    <div
      className={`absolute inset-x-0 top-0 h-[3px] ${accents[accent].rule}`}
    />
    <div className="flex items-center justify-between gap-2 px-4 pb-2.5 pt-4">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${accents[accent].icon}`}
        >
          {icon}
        </span>
        <h3 className="text-[13px] font-black text-slate-900">{title}</h3>
      </div>
      {action}
    </div>
    <div className="px-4 pb-4">{children}</div>
  </div>
);

const AddButton = ({ onClick, colorClass, label, disabled, tooltip }) => {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${colorClass}`}
    >
      <Plus size={13} />
      {label}
    </button>
  );

  if (disabled && tooltip) {
    return (
      <span className="group relative inline-flex">
        {button}
        <span className="pointer-events-none absolute top-full left-1/2 z-20 mt-1.5 -translate-x-1/3 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
          {tooltip}
        </span>
      </span>
    );
  }

  return button;
};

const emptyForm = {
  name: "",
  latinName: "",
  code: "",
  description: "",
  costPrice: "",
  salePrice: "",
  quantity: 0,
  unit_id: "",
  tax_id: "",
  logo: "",
  type: "normal",
  barcodes: [{ barcode: "" }],
  productUnits: [],
  oldQuantity: 0,
};

export default function ProductFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const {
    units,
    taxes,
    barcodesByProduct,
    canManageBarcodes,
    canUseUnits,
    canUseTaxes,
    saving,
    actionError,
    activeProduct,
    openEdit,
    openCreate,
    submitProduct,
    handleLogo,
  } = useProductCatalog();

  const [initializing, setInitializing] = useState(isEditing);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [tagIds, setTagIds] = useState([]);

  const isService = form.type === "service";
  const barcodeInputRefs = useRef([]);

  const handleBarcodeKeyDown = (event, onScanned) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.target.blur();
    onScanned?.();
  };

  useEffect(() => {
    const lastIndex = form.barcodes.length - 1;
    const last = form.barcodes[lastIndex];
    if (form.barcodes.length > 1 && last && !last.barcode) {
      barcodeInputRefs.current[lastIndex]?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.barcodes.length]);

  useEffect(() => {
    let cancelled = false;

    if (isEditing) {
      setInitializing(true);
      openEdit({ id: Number(id) }).finally(() => {
        if (!cancelled) setInitializing(false);
      });
    } else {
      openCreate();
      setInitializing(false);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (submitAttempted && !saving && !actionError) {
      navigate("/products");
    }
  }, [submitAttempted, saving, actionError, navigate]);

  useEffect(() => {
    const barcodes = activeProduct
      ? barcodesByProduct[activeProduct.id] || []
      : [];
    const productUnits = activeProduct?.productUnits || [];

    if (activeProduct) {
      setForm({
        id: activeProduct.id,
        name: activeProduct.name || "",
        latinName: activeProduct.latinName || "",
        code: activeProduct.code || "",
        description: activeProduct.description || "",
        costPrice: Number(activeProduct.costPrice ?? 0),
        salePrice: Number(activeProduct.salePrice ?? 0),
        quantity: Number(activeProduct.quantity ?? 0),
        unit_id: activeProduct.unit_id ? Number(activeProduct.unit_id) : "",
        tax_id: activeProduct.tax_id ? Number(activeProduct.tax_id) : "",
        logo: activeProduct.logo || "",
        type: activeProduct.type || "normal",
        barcodes: barcodes.length > 0 ? barcodes : [{ barcode: "" }],
        productUnits: productUnits
          .filter((u) => !u.is_base)
          .map((u) => ({
            id: u.id,
            unit_name: u.unit_name,
            conversion_factor: u.conversion_factor,
            sale_price: u.sale_price,
            barcode: u.barcode || "",
          })),
        oldQuantity: Number(activeProduct.quantity ?? 0),
      });
    } else if (!isEditing) {
      setForm(emptyForm);
    }
  }, [activeProduct, barcodesByProduct, isEditing]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateBarcode = (index, value) => {
    setForm((current) => ({
      ...current,
      barcodes: current.barcodes.map((barcode, currentIndex) =>
        currentIndex === index ? { ...barcode, barcode: value } : barcode,
      ),
    }));
  };

  const addBarcode = () => {
    setForm((current) => ({
      ...current,
      barcodes: [...current.barcodes, { barcode: "" }],
    }));
  };

  const removeBarcode = (index) => {
    setForm((current) => ({
      ...current,
      barcodes:
        current.barcodes.length === 1
          ? [{ barcode: "" }]
          : current.barcodes.filter(
              (_, currentIndex) => currentIndex !== index,
            ),
    }));
  };

  const addProductUnit = () => {
    setForm((current) => ({
      ...current,
      productUnits: [
        ...current.productUnits,
        { unit_name: "", conversion_factor: "", sale_price: "", barcode: "" },
      ],
    }));
  };

  const updateProductUnit = (index, field, value) => {
    setForm((current) => ({
      ...current,
      productUnits: current.productUnits.map((unit, currentIndex) => {
        if (currentIndex !== index) return unit;

        const updated = { ...unit, [field]: value };

        if (field === "conversion_factor") {
          const factor = Number(value) || 0;
          const basePrice = Number(form.salePrice) || 0;
          updated.sale_price =
            factor > 0 ? (basePrice * factor).toString() : "";
        }

        return updated;
      }),
    }));
  };

  const removeProductUnit = (index) => {
    setForm((current) => ({
      ...current,
      productUnits: current.productUnits.filter(
        (_, currentIndex) => currentIndex !== index,
      ),
    }));
  };

  const uploadLogo = async (event) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      const savedPath = await handleLogo(file);

      setForm((current) => ({ ...current, logo: savedPath }));

      toast.success(t("screens.products.uploaded"));
    } catch (err) {
      console.error(err);
      toast.error(t("screens.products.uploadFailed"));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error(t("screens.products.nameRequired"));
      return;
    }

    if (Number(form.costPrice) < 0) {
      toast.error(t("screens.products.validCost"));
      return;
    }

    if (Number(form.salePrice) <= 0) {
      toast.error(t("screens.products.validSale"));
      return;
    }

    const invalidUnit = form.productUnits.find(
      (u) =>
        u.unit_name.trim() &&
        u.conversion_factor !== "" &&
        Number(u.conversion_factor) <= 1,
    );

    if (invalidUnit) {
      toast.error(
        t(
          "screens.products.conversionMustExceedOne",
          "Conversion factor must be greater than 1 — it can't be smaller than or equal to the base unit.",
        ),
      );
      return;
    }

    const cleanedUnits = form.productUnits
      .filter((u) => u.unit_name.trim() && Number(u.conversion_factor) > 0)
      .map((u) => ({
        ...(u.id ? { id: u.id } : {}),
        unit_name: u.unit_name.trim(),
        conversion_factor: Number(u.conversion_factor),
        sale_price: Number(u.sale_price || 0),
        barcode: String(u.barcode || "").trim(),
      }));

    setSubmitAttempted(true);

    await submitProduct({
      ...form,
      quantity: isService ? 0 : Number(form.quantity || 0),
      costPrice: Number(form.costPrice || 0),
      salePrice: Number(form.salePrice || 0),
      unit_id: form.unit_id ? Number(form.unit_id) : null,
      tax_id: form.tax_id ? Number(form.tax_id) : null,
      barcodes: form.barcodes.filter((item) => item.barcode.trim()),
      productUnits: cleanedUnits,
      oldQuantity: form.oldQuantity || 0,
      tagIds,
    });
  };

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8fd]">
        <div className="flex items-center gap-2.5 text-sm font-bold text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-[#4663ff]" />
          {t("screens.products.loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8fd] text-slate-900">
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-6xl flex-col">
        {/* Sticky top action bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#e9edfb] bg-white/90 px-5 py-3 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/products")}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label={t("common.close")}
            >
              <X size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#4663ff]">
                {t("ui.inventory")}
              </p>
              <h1 className="truncate text-[17px] font-black leading-tight text-slate-950">
                {isEditing
                  ? t("screens.products.edit")
                  : t("screens.products.create")}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/products")}
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
              {saving
                ? t("common.saving")
                : isEditing
                  ? t("screens.products.update")
                  : t("screens.products.create")}
            </button>
          </div>
        </div>

        {actionError && (
          <div className="mx-5 mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
            {actionError}
          </div>
        )}

        <div className="grid gap-3.5 p-5">
          {/* Identity: logo + core fields */}
          <Panel
            accent="identity"
            icon={<Package size={15} />}
            title={t("screens.products.identity")}
          >
            <div className="flex flex-wrap items-start gap-4">
              <label className="group relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-[#d6ddf9] bg-[#f6f8fd] transition hover:border-[#4663ff]">
                {form.logo ? (
                  <img
                    src={getAssetUrl(form.logo)}
                    alt={t("ui.product")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImagePlus
                    size={19}
                    className="text-[#9aa8f0] transition group-hover:text-[#4663ff]"
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={uploadLogo}
                />
              </label>

              <div className="flex-1 space-y-3">
                {/* Row 1: naming/identifying fields */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className={labelClass}>
                      {t("ui.name")} <span className="text-red-400">*</span>
                    </label>
                    <input
                      required
                      value={form.name}
                      onChange={(event) =>
                        updateField("name", event.target.value)
                      }
                      placeholder={t("screens.products.enterProductName")}
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelClass}>{t("ui.latinName")}</label>
                    <input
                      value={form.latinName}
                      onChange={(event) =>
                        updateField("latinName", event.target.value)
                      }
                      placeholder={t("ui.optional")}
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelClass}>{t("ui.code")}</label>
                    <input
                      value={form.code}
                      onChange={(event) =>
                        updateField("code", event.target.value)
                      }
                      placeholder={t("ui.optional")}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Row 2: stock/unit fields */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {/* Quantity is meaningless for a service — no physical stock
                      behind it — so it's hidden entirely rather than shown
                      disabled-at-zero. */}
                  {!isService && (
                    <div className="space-y-1.5">
                      <label className={labelClass}>{t("ui.quantity")}</label>
                      <NumberInput
                        value={form.quantity}
                        onChange={(val) => updateField("quantity", val)}
                        className={inputClass}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className={labelClass}>
                      {t("ui.unit")} <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={form.unit_id}
                      onChange={(event) =>
                        updateField("unit_id", event.target.value)
                      }
                      disabled={!canUseUnits}
                      className={inputClass}
                      required
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
                </div>
              </div>
            </div>

            {/* Row 3: description, full width */}
            <div className="mt-3.5 space-y-1.5">
              <label className={labelClass}>{t("ui.description")}</label>
              <textarea
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                placeholder={t("ui.optional")}
                rows={2}
                className={inputClass + " h-auto resize-none py-2"}
              />
            </div>

            {/* Product type — editable only at creation. Once a product has
                real stock movements (or, later, expiry lots) tied to it,
                flipping normal<->service would reinterpret that history, so
                this is locked the moment the product exists. */}
            <div className="mt-3.5 border-t border-slate-100 pt-3.5">
              <label className={labelClass}>
                {t("screens.products.productType", "Product Type")}
              </label>

              {isEditing ? (
                <div className="mt-1.5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                  <Lock size={13} />
                  {form.type === "service"
                    ? t("screens.products.typeService", "Service")
                    : t("screens.products.typeNormal", "Normal")}
                  <span className="font-medium text-slate-400">
                    {t(
                      "screens.products.typeLocked",
                      "— can't be changed after creation",
                    )}
                  </span>
                </div>
              ) : (
                <div className="mt-1.5 inline-flex overflow-hidden rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => updateField("type", "normal")}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold transition ${
                      form.type === "normal"
                        ? "bg-[#4663ff] text-white"
                        : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <Package size={13} />
                    {t("screens.products.typeNormal", "Normal")}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField("type", "service")}
                    className={`flex items-center gap-1.5 border-l border-slate-200 px-3.5 py-2 text-xs font-bold transition ${
                      form.type === "service"
                        ? "bg-[#4663ff] text-white"
                        : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <Briefcase size={13} />
                    {t("screens.products.typeService", "Service")}
                  </button>
                </div>
              )}
            </div>
          </Panel>

          <Panel
            accent="tags"
            icon={<TagIcon size={15} />}
            title={t("screens.tags.title")}
          >
            <TagPickerField
              scope="product"
              entityType="product"
              entityId={activeProduct?.id}
              selectedIds={tagIds}
              onChange={setTagIds}
            />
          </Panel>

          {/* Pricing */}
          <Panel
            accent="pricing"
            icon={<DollarSign size={15} />}
            title={t("ui.price")}
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
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

              <div className="col-span-2 space-y-1.5 md:col-span-1">
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
          </Panel>

          {/* Selling units + barcodes side by side */}
          <div className="grid gap-3.5 md:grid-cols-[3fr_2fr]">
            <Panel
              accent="units"
              icon={<Layers size={15} />}
              title={t("screens.products.sellingUnits")}
              action={
                <AddButton
                  onClick={addProductUnit}
                  colorClass="bg-violet-50 text-violet-600 hover:bg-violet-100"
                  label={t("common.add")}
                  disabled={!form.unit_id}
                  tooltip={
                    !form.unit_id
                      ? t("screens.products.selectBaseUnitFirst")
                      : undefined
                  }
                />
              }
            >
              <div className="mb-2.5 flex items-start gap-2 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-[11px] font-semibold leading-relaxed text-violet-700">
                <Layers size={13} className="mt-0.5 shrink-0" />
                <span>
                  {t(
                    "screens.products.unitsHint",
                    "The base unit is your smallest unit. Any selling unit must represent a larger quantity — its conversion factor must be greater than 1 (e.g. a box of 12 has a conversion factor of 12).",
                  )}
                </span>
              </div>

              {form.productUnits.length === 0 ? (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-4 text-xs font-semibold text-slate-400">
                  {t("screens.products.noSellingUnits")}
                </div>
              ) : (
                <div className="grid gap-2">
                  {form.productUnits.map((unit, index) => {
                    const factor = Number(unit.conversion_factor);
                    const hasInvalidFactor =
                      unit.conversion_factor !== "" &&
                      unit.conversion_factor !== undefined &&
                      !isNaN(factor) &&
                      factor <= 1;

                    return (
                      <div
                        key={unit.id ? `id-${unit.id}` : `new-${index}`}
                        className="rounded-xl bg-slate-50/60 p-1.5"
                      >
                        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-1.5">
                          <input
                            value={unit.unit_name}
                            onChange={(event) =>
                              updateProductUnit(
                                index,
                                "unit_name",
                                event.target.value,
                              )
                            }
                            placeholder={t(
                              "screens.products.unitNamePlaceholder",
                            )}
                            className={inputClass}
                          />

                          <NumberInput
                            value={unit.conversion_factor}
                            onChange={(val) =>
                              updateProductUnit(index, "conversion_factor", val)
                            }
                            placeholder={t(
                              "screens.products.conversionPlaceholder",
                            )}
                            className={
                              hasInvalidFactor
                                ? inputClass +
                                  " border-red-300 focus:border-red-400 focus:ring-red-400/15"
                                : inputClass
                            }
                          />

                          <NumberInput
                            value={unit.sale_price}
                            onChange={(val) =>
                              updateProductUnit(index, "sale_price", val)
                            }
                            placeholder={t(
                              "screens.products.unitSalePricePlaceholder",
                            )}
                            className={inputClass}
                          />

                          {canManageBarcodes && (
                            <input
                              value={unit.barcode || ""}
                              onChange={(event) =>
                                updateProductUnit(
                                  index,
                                  "barcode",
                                  normalizeDigits(event.target.value),
                                )
                              }
                              onKeyDown={(event) => handleBarcodeKeyDown(event)}
                              placeholder={t(
                                "screens.products.unitBarcodePlaceholder",
                                "Barcode",
                              )}
                              className={inputClass}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => removeProductUnit(index)}
                            className={smallRemoveBtnClass}
                            aria-label={t("screens.products.removeUnit")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {hasInvalidFactor && (
                          <p className="mt-1 px-1 text-[11px] font-semibold text-red-500">
                            {t(
                              "screens.products.conversionMustExceedOne",
                              "Conversion factor must be greater than 1 — it can't be smaller than or equal to the base unit.",
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            {canManageBarcodes ? (
              <Panel
                accent="barcodes"
                icon={<Barcode size={15} />}
                title={t("ui.barcodes")}
                action={
                  <AddButton
                    onClick={addBarcode}
                    colorClass="bg-amber-50 text-amber-600 hover:bg-amber-100"
                    label={t("common.add")}
                  />
                }
              >
                <div className="grid gap-2">
                  {form.barcodes.map((barcode, index) => (
                    <div
                      key={barcode.id ? `id-${barcode.id}` : `new-${index}`}
                      className="grid grid-cols-[1fr_auto] gap-1.5 rounded-xl bg-slate-50/60 p-1.5"
                    >
                      <input
                        ref={(el) => (barcodeInputRefs.current[index] = el)}
                        value={barcode.barcode}
                        onChange={(event) =>
                          updateBarcode(
                            index,
                            normalizeDigits(event.target.value),
                          )
                        }
                        onKeyDown={(event) =>
                          handleBarcodeKeyDown(event, () => {
                            const isLastRow =
                              index === form.barcodes.length - 1;
                            const hasValue = barcode.barcode.trim();
                            if (isLastRow && hasValue) {
                              addBarcode();
                            }
                          })
                        }
                        placeholder={t("screens.products.enterBarcode")}
                        className={inputClass}
                      />

                      <button
                        type="button"
                        onClick={() => removeBarcode(index)}
                        className={smallRemoveBtnClass}
                        aria-label={t("screens.products.removeBarcode")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : (
              <div className="flex items-center rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs font-bold text-amber-800">
                {t("screens.products.barcodeUnavailable")}
              </div>
            )}
          </div>
        </div>
      </form>

      <ToastContainer position="top-right" />
    </div>
  );
}
