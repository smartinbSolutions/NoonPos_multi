// UpdateSalesQuotation.jsx
import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  FileText,
  AlertCircle,
  X,
  Percent,
  Tag,
  StickyNote,
  Receipt,
} from "lucide-react";
import { toast } from "react-toastify";
import useUpdateSalesQuotation from "../hooks/useUpdateSalesQuotation";
import SearchableSelect from "../../../../Global/SearchableSelect";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../../Global/DeleteModel";
import { ToastContainer } from "react-toastify";
import DropdownMenu from "../../../../Global/DropdownMenu";
import useProductCatalog from "../../../Products/hooks/useProductCatalog";
import useCustomerList from "../../../Customer/hooks/useCustomerList";

import ProductQuickAddModal from "../../../Products/components/ProductQuickAddModal";
import NumberInput from "../../../../Global/NumberInput";
import CustomerFormModal from "../../Sales/components/CustomerFormModal";

const inputClass =
  "h-9 w-full rounded-xl border border-[#e1e7fb] bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-350 focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const smallInputClass =
  "h-8 w-full rounded-lg border border-[#e1e7fb] bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12";
const panelClass =
  "relative overflow-hidden rounded-2xl border border-[#e9edfb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const panelBodyClass = "p-4";

const STATUS_OPTIONS = ["draft", "sent", "accepted", "rejected", "expired"];

function AccentRule({ colorClass }) {
  return <div className={`absolute inset-x-0 top-0 h-[3px] ${colorClass}`} />;
}

function AddOptionsMenu({ options, align = "right" }) {
  const trigger = (
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-400 transition hover:border-[#4663ff]/50 hover:bg-[#f6f8fd] hover:text-[#4663ff]"
      aria-label="Add"
    >
      <Plus size={14} />
    </button>
  );

  return <DropdownMenu trigger={trigger} options={options} align={align} />;
}

function AdjustmentChip({ icon, tone, children, onRemove }) {
  const toneClasses =
    tone === "danger"
      ? "border-red-100 bg-red-50/60"
      : "border-emerald-100 bg-emerald-50/60";

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${toneClasses}`}
    >
      {icon}
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded p-0.5 text-slate-400 transition hover:bg-white hover:text-red-600"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function UpdateSalesQuotation() {
  const { t } = useTranslation();
  const api = window.api;
  const catalog = useProductCatalog();

  const {
    quotation,
    setQuotation,
    addQuotationTax,
    removeQuotationTax,
    clearQuotationTaxes,
    setQuotationDiscountRate,
    setQuotationDiscountAmount,
    clearQuotationDiscount,
    items,
    products,
    customers,
    taxes,
    addItem,
    removeItem,
    updateItem,
    updateItemUnit,
    updateItemDiscountRate,
    updateItemDiscountAmount,
    clearItemDiscount,
    updateItemTax,
    enableItemTax,
    disableItemTax,
    updateItemDescription,
    setItemProduct,
    addItemWithProduct,
    submit,
    subtotal,
    itemDiscountSummary,
    itemTaxSummary,
    quotationDiscount,
    quotationTaxValue,
    netTotal,
    saving,
    error,
    loading,
    setProducts,
    refetch,
    status,
  } = useUpdateSalesQuotation();

  const {
    saving: productSaving,
    canUseUnits,
    canUseTaxes,
    isFormOpen,
    setIsFormOpen,
    submitProduct,
    units,
    taxes: productTaxes,
  } = catalog;

  const { submitDraft, setDraft, draft, actionError } = useCustomerList();

  const { money } = usePrimaryCurrency();
  const [deleteItemIndex, setDeleteItemIndex] = useState(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [revealedItemDiscounts, setRevealedItemDiscounts] = useState(
    () => new Set()
  );
  const [revealedItemNotes, setRevealedItemNotes] = useState(() => new Set());
  const [quotationDiscountRevealed, setQuotationDiscountRevealed] =
    useState(false);
  const [quotationTaxRevealed, setQuotationTaxRevealed] = useState(false);
  const [quotationNoteRevealed, setQuotationNoteRevealed] = useState(false);

  // Same reasoning as UpdateSales: `load()` is async, so the reveal state
  // has to be computed once real data has actually arrived.
  useEffect(() => {
    if (loading) return;

    setRevealedItemDiscounts(
      new Set(
        items
          .map((item, i) => (Number(item.discount_rate) > 0 ? i : null))
          .filter((i) => i !== null)
      )
    );
    setRevealedItemNotes(
      new Set(
        items
          .map((item, i) => (item.description ? i : null))
          .filter((i) => i !== null)
      )
    );
    setQuotationDiscountRevealed(Number(quotation?.discount_rate) > 0);
    setQuotationTaxRevealed((quotation?.taxes || []).length > 0);
    setQuotationNoteRevealed(Boolean(quotation?.description));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const hasUsableItems = items.some(
    (i) => i.product_id || i.product_name?.trim()
  );
  const canSave = hasUsableItems && !saving;

  const toggleItemDiscount = (index, revealed) => {
    setRevealedItemDiscounts((prev) => {
      const next = new Set(prev);
      if (revealed) {
        next.delete(index);
        clearItemDiscount(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleItemNote = (index, revealed) => {
    setRevealedItemNotes((prev) => {
      const next = new Set(prev);
      if (revealed) {
        next.delete(index);
        updateItemDescription(index, "");
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!canSave) return;
    const res = await submit();
    if (res?.success) {
      toast.success(t("screens.quotations.saved"));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8fd] text-sm font-bold text-slate-400">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8fd] p-5 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="flex flex-col gap-3 rounded-2xl border border-[#e9edfb] bg-white px-5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4663ff] text-white shadow-md shadow-[#4663ff]/25">
              <FileText size={18} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#4663ff]">
                {t("ui.sales")}
              </p>
              <h1 className="text-lg font-black leading-tight text-slate-950">
                {t("screens.quotations.editQuotation")}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.history.back()}
              disabled={saving}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
            >
              <ArrowLeft size={14} />
              {t("common.back")}
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <main className="space-y-4">
            <section className={panelClass}>
              <AccentRule colorClass="bg-[#4663ff]" />
              <div className={panelBodyClass}>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="flex items-center gap-1">
                    <div className="flex-1">
                      <SearchableSelect
                        placeholder={t("ui.selectCustomerOptional")}
                        options={customers}
                        selectedValue={quotation?.customer_id}
                        onChange={(customer) =>
                          setQuotation((prev) => ({
                            ...prev,
                            customer_id: customer.id,
                          }))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomerModalOpen(true)}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#4663ff] px-3 text-sm font-bold text-white shadow-md shadow-[#4663ff]/25 transition hover:bg-[#3854e8]"
                    >
                      <Plus size={14} />
                      <span>{t("screens.contacts.addCustomer")}</span>
                    </button>
                  </div>

                  <input
                    type="date"
                    className={inputClass}
                    value={quotation?.date || ""}
                    onChange={(e) =>
                      setQuotation((prev) => ({
                        ...prev,
                        date: e.target.value,
                      }))
                    }
                  />

                  <select
                    className={inputClass}
                    value={quotation?.status || "draft"}
                    onChange={(e) =>
                      setQuotation((prev) => ({
                        ...prev,
                        status: e.target.value,
                      }))
                    }
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {t(`screens.quotations.status.${s}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className={panelClass}>
              <AccentRule colorClass="bg-violet-500" />
              <div className="flex items-center justify-between gap-3 border-b border-[#eef1ff] px-4 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-black text-slate-900">
                    {t("ui.items")}
                  </h2>
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600">
                    {items.length}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#4663ff] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#3854e8]"
                  >
                    <Plus size={13} />
                    {t("screens.invoices.addItem")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-600 transition hover:bg-violet-100"
                  >
                    <Plus size={13} />
                    {t("screens.products.create")}
                  </button>
                </div>
              </div>

              <div className="divide-y divide-[#eef1ff]">
                {items.map((item, index) => {
                  const afterDiscount =
                    (item.total || 0) - (item.discount || 0);
                  const lineTotal = afterDiscount + (item.taxValue || 0);
                  const hasProduct = Boolean(
                    item.product_id || item.product_name?.trim()
                  );
                  const hasTax = hasProduct && item.tax_capable;
                  const isNonBaseUnit =
                    item.unit_conversion_factor &&
                    item.unit_conversion_factor !== 1;
                  const discountRevealed = revealedItemDiscounts.has(index);
                  const noteRevealed = revealedItemNotes.has(index);

                  return (
                    <div key={index} className="space-y-2.5 p-3.5">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <SearchableSelect
                            placeholder={t("ui.productNameOrSelect")}
                            options={products}
                            selectedValue={item.product_id}
                            selectedLabel={item.product_name}
                            onChange={(e) => {
                              updateItem(index, "product_id", e.id);
                            }}
                            onInputChange={async (value) => {
                              updateItem(index, "product_name", value);

                              if (!value.trim()) return;
                              try {
                                const res = await api.getProducts({
                                  page: 1,
                                  limit: 50,
                                  search: value,
                                });
                                setProducts(res?.data || []);
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                          />
                          {item.product_code && (
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                              #{item.product_code}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setDeleteItemIndex(index)}
                          disabled={items.length === 1}
                          className="mt-0.5 rounded-lg p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-slate-400">
                            {t("ui.qty")}
                          </label>
                          <NumberInput
                            className={inputClass}
                            value={item.entered_quantity}
                            onChange={(val) =>
                              updateItem(index, "entered_quantity", val)
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-slate-400">
                            {t("ui.price")}
                          </label>
                          <NumberInput
                            className={inputClass}
                            value={item.entered_price}
                            onChange={(val) =>
                              updateItem(index, "entered_price", val)
                            }
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
                              onChange={(e) =>
                                updateItemUnit(index, e.target.value)
                              }
                            >
                              {item.available_units.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.unit_name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              className={inputClass}
                              value={item.unit_name || ""}
                              onChange={(e) =>
                                updateItem(index, "unit_name", e.target.value)
                              }
                              placeholder="—"
                            />
                          )}
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-slate-400">
                            {t("ui.total")}
                          </label>
                          <div className="flex h-9 items-center rounded-xl bg-[#f6f8fd] px-3 text-sm font-black tabular-nums text-[#4663ff]">
                            {money(lineTotal)}
                          </div>
                        </div>

                        {hasProduct && (
                          <div className="flex items-end">
                            <AddOptionsMenu
                              align="right"
                              options={[
                                {
                                  key: "tax",
                                  label: t("screens.invoices.addTax"),
                                  icon: (
                                    <Receipt
                                      size={13}
                                      className="text-emerald-600"
                                    />
                                  ),
                                  visible: !item.tax_capable,
                                  onClick: () => enableItemTax(index),
                                },
                                {
                                  key: "discount",
                                  label: t("screens.invoices.addDiscount"),
                                  icon: (
                                    <Percent
                                      size={13}
                                      className="text-red-500"
                                    />
                                  ),
                                  visible: !discountRevealed,
                                  onClick: () =>
                                    toggleItemDiscount(index, false),
                                },
                                {
                                  key: "note",
                                  label: t("screens.invoices.addNote"),
                                  icon: (
                                    <StickyNote
                                      size={13}
                                      className="text-amber-500"
                                    />
                                  ),
                                  visible: !noteRevealed,
                                  onClick: () => toggleItemNote(index, false),
                                },
                              ]}
                            />
                          </div>
                        )}
                      </div>

                      {isNonBaseUnit && (
                        <p className="flex items-center gap-1.5 rounded-lg bg-[#f6f8fd] px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">
                          <Tag size={11} className="shrink-0 text-slate-400" />
                          {t("screens.invoices.unitConversionDetail", {
                            enteredQty: item.entered_quantity,
                            unitName: item.unit_name,
                            factor: item.unit_conversion_factor,
                            baseQty: item.quantity,
                          })}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5">
                        {hasTax && (
                          <AdjustmentChip
                            icon={
                              <Receipt
                                size={12}
                                className="shrink-0 text-emerald-600"
                              />
                            }
                            tone="success"
                            onRemove={() => disableItemTax(index)}
                          >
                            <select
                              className="h-6 border-none bg-transparent text-xs font-bold text-emerald-700 outline-none"
                              value={item.tax_id || ""}
                              onChange={(e) => {
                                const newTaxId = e.target.value
                                  ? Number(e.target.value)
                                  : null;
                                const selectedTax = taxes?.find(
                                  (tx) => tx.id === newTaxId
                                );
                                updateItemTax(
                                  index,
                                  newTaxId,
                                  selectedTax?.rate || 0
                                );
                              }}
                            >
                              <option value="">
                                {t("screens.products.noTaxOption")}
                              </option>
                              {taxes
                                ?.filter(
                                  (tax) =>
                                    tax.category === "product" ||
                                    tax.category === "both"
                                )
                                .map((tax) => (
                                  <option key={tax.id} value={tax.id}>
                                    {tax.name} ({tax.rate}%)
                                  </option>
                                ))}
                            </select>
                          </AdjustmentChip>
                        )}

                        {discountRevealed && (
                          <AdjustmentChip
                            icon={
                              <Percent
                                size={12}
                                className="shrink-0 text-red-500"
                              />
                            }
                            tone="danger"
                            onRemove={() => toggleItemDiscount(index, true)}
                          >
                            <NumberInput
                              className="h-6 w-12 border-none bg-transparent text-xs font-bold text-red-600 outline-none"
                              value={item.discount_rate || ""}
                              onChange={(val) =>
                                updateItemDiscountRate(index, val)
                              }
                              max={100}
                              placeholder="0"
                            />
                            <span className="text-[10px] text-red-400">
                              % =
                            </span>
                            <NumberInput
                              className="h-6 w-16 border-none bg-transparent text-xs font-bold text-red-600 outline-none"
                              value={item.discount || ""}
                              onChange={(val) =>
                                updateItemDiscountAmount(index, val)
                              }
                              placeholder="0"
                            />
                          </AdjustmentChip>
                        )}
                      </div>

                      {noteRevealed && (
                        <div className="flex w-full items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-1.5">
                          <StickyNote
                            size={12}
                            className="shrink-0 text-amber-500"
                          />
                          <input
                            type="text"
                            className="h-6 w-full min-w-0 flex-1 border-none bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400"
                            value={item.description || ""}
                            onChange={(e) =>
                              updateItemDescription(index, e.target.value)
                            }
                            placeholder={t("screens.invoices.notePlaceholder")}
                          />
                          <button
                            type="button"
                            onClick={() => toggleItemNote(index, true)}
                            className="shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-white hover:text-red-600"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </main>

          <aside className="space-y-4">
            <section className={panelClass}>
              <AccentRule colorClass="bg-emerald-500" />
              <div className={panelBodyClass}>
                <h3 className="mb-3 text-[13px] font-black text-slate-950">
                  {t("ui.summary")}
                </h3>

                <div className="space-y-2.5">
                  <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("ui.subtotal")}
                    </span>
                    <span className="text-right text-sm font-black tabular-nums">
                      {money(subtotal)}
                    </span>
                  </div>

                  {itemDiscountSummary.map((group) => (
                    <div
                      key={`item-discount-${group.rate}`}
                      className="grid grid-cols-[1fr_7.5rem] items-center gap-2"
                    >
                      <span className="text-xs text-slate-400">
                        {t("screens.invoices.itemDiscountAt", {
                          rate: Number(group.rate).toFixed(2),
                        })}
                      </span>
                      <span className="text-right text-xs font-bold tabular-nums text-red-500">
                        -{money(group.amount)}
                      </span>
                    </div>
                  ))}

                  {itemTaxSummary.map((group) => (
                    <div
                      key={`item-tax-${group.tax_id}`}
                      className="grid grid-cols-[1fr_7.5rem] items-center gap-2"
                    >
                      <span className="text-xs text-slate-400">
                        {t("screens.invoices.itemTaxAt", { rate: group.rate })}
                      </span>
                      <span className="text-right text-xs font-bold tabular-nums text-emerald-600">
                        +{money(group.value)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="my-3 h-px bg-[#eef1ff]" />

                <div className="space-y-2">
                  {quotationDiscountRevealed && (
                    <div className="space-y-1.5 rounded-xl border border-red-100 bg-red-50/40 p-2.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-red-600">
                          <Percent size={12} />
                          {t("screens.invoices.invoiceDiscountRate")}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            clearQuotationDiscount();
                            setQuotationDiscountRevealed(false);
                          }}
                          className="rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-red-600"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <NumberInput
                            className={`${smallInputClass} pe-5 text-end tabular-nums`}
                            value={quotation.discount_rate || ""}
                            onChange={setQuotationDiscountRate}
                            max={100}
                            placeholder="0"
                          />
                          <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                            %
                          </span>
                        </div>
                        <span className="text-xs text-slate-300">=</span>
                        <NumberInput
                          className={`${smallInputClass} flex-1 text-end tabular-nums`}
                          value={quotationDiscount || ""}
                          onChange={setQuotationDiscountAmount}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}

                  {quotationTaxRevealed && (
                    <div className="space-y-1.5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-2.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                          <Receipt size={12} />
                          {t("ui.tax")}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            clearQuotationTaxes();
                            setQuotationTaxRevealed(false);
                          }}
                          className="rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-red-600"
                        >
                          <X size={13} />
                        </button>
                      </div>

                      {(quotation.taxes || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {quotation.taxes.map((tax) => (
                            <span
                              key={tax.id}
                              className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 shadow-sm"
                            >
                              {tax.name} ({tax.rate}%)
                              <button
                                type="button"
                                onClick={() => removeQuotationTax(tax.id)}
                                className="rounded p-0.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <select
                        className={`${smallInputClass} text-right`}
                        value=""
                        onChange={(e) => {
                          const selected = taxes.find(
                            (tax) => tax.id === Number(e.target.value)
                          );
                          if (selected) addQuotationTax(selected);
                        }}
                      >
                        <option value="">
                          {t(
                            "screens.invoices.addAnotherTax",
                            "Add another tax"
                          )}
                        </option>
                        {taxes
                          .filter(
                            (tax) =>
                              (tax.category === "invoice" ||
                                tax.category === "both") &&
                              !(quotation.taxes || []).some(
                                (applied) => applied.id === tax.id
                              )
                          )
                          .map((tax) => (
                            <option key={tax.id} value={tax.id}>
                              {tax.name} ({tax.rate}%)
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {(!quotationDiscountRevealed ||
                    !quotationTaxRevealed ||
                    !quotationNoteRevealed) && (
                    <div className="flex">
                      <AddOptionsMenu
                        options={[
                          {
                            key: "quotation-discount",
                            label: t("screens.invoices.addInvoiceDiscount"),
                            icon: (
                              <Percent size={13} className="text-red-500" />
                            ),
                            visible: !quotationDiscountRevealed,
                            onClick: () => setQuotationDiscountRevealed(true),
                          },
                          {
                            key: "quotation-tax",
                            label: t("screens.invoices.addInvoiceTax"),
                            icon: (
                              <Receipt size={13} className="text-emerald-600" />
                            ),
                            visible: !quotationTaxRevealed,
                            onClick: () => setQuotationTaxRevealed(true),
                          },
                          {
                            key: "quotation-note",
                            label: t("screens.invoices.addInvoiceNote"),
                            icon: (
                              <StickyNote
                                size={13}
                                className="text-amber-500"
                              />
                            ),
                            visible: !quotationNoteRevealed,
                            onClick: () => setQuotationNoteRevealed(true),
                          },
                        ]}
                      />
                    </div>
                  )}

                  {quotationDiscount > 0 && (
                    <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {t("screens.invoices.invoiceDiscountAmount")}
                      </span>
                      <span className="text-right text-xs font-bold tabular-nums text-red-500">
                        -{money(quotationDiscount)}
                      </span>
                    </div>
                  )}

                  {quotationTaxValue > 0 && (
                    <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {t("screens.invoices.invoiceTaxAmount")}
                      </span>
                      <span className="text-right text-xs font-bold tabular-nums text-emerald-600">
                        +{money(quotationTaxValue)}
                      </span>
                    </div>
                  )}

                  {quotationNoteRevealed && (
                    <div className="space-y-1.5 rounded-xl border border-amber-100 bg-amber-50/40 p-2.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
                          <StickyNote size={12} />
                          {t("screens.invoices.invoiceNote")}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setQuotation((prev) => ({
                              ...prev,
                              description: "",
                            }));
                            setQuotationNoteRevealed(false);
                          }}
                          className="rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-red-600"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <textarea
                        className={`${smallInputClass} min-h-[2.5rem] resize-none overflow-hidden py-1.5`}
                        value={quotation.description || ""}
                        onChange={(e) => {
                          setQuotation((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }));
                          e.target.style.height = "auto";
                          e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        placeholder={t("screens.invoices.notePlaceholder")}
                        rows={1}
                      />
                    </div>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-[1fr_7.5rem] items-center gap-2 rounded-xl bg-[#f6f8fd] px-3 py-2.5">
                  <span className="text-xs font-black text-slate-700">
                    {t("ui.total")}
                  </span>
                  <span className="text-right text-lg font-black tabular-nums text-[#4663ff]">
                    {money(netTotal)}
                  </span>
                </div>
              </div>
            </section>

            <section className={panelClass}>
              <AccentRule colorClass="bg-amber-500" />
              <div className={`${panelBodyClass} space-y-2.5`}>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4663ff] py-2.5 text-sm font-black text-white shadow-md shadow-[#4663ff]/25 transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={15} />
                  {saving
                    ? t("common.saving")
                    : t("screens.quotations.saveQuotation")}
                </button>

                {!canSave && !saving && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                    <AlertCircle size={12} />
                    {t("errors.addOneItem")}
                  </p>
                )}
              </div>
            </section>
          </aside>
        </div>
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

      {customerModalOpen && (
        <CustomerFormModal
          open={customerModalOpen}
          onClose={() => setCustomerModalOpen(false)}
          draft={draft}
          setDraft={setDraft}
          onSubmit={async (event) => {
            const result = await submitDraft(event);
            if (result && result.id) {
              setQuotation((prev) => ({ ...prev, customer_id: result.id }));
              setCustomerModalOpen(false);
              await refetch();
            }
          }}
          saving={saving}
          actionError={actionError}
          t={t}
        />
      )}

      {isFormOpen && (
        <ProductQuickAddModal
          units={units}
          taxes={productTaxes}
          canUseUnits={canUseUnits}
          canUseTaxes={canUseTaxes}
          saving={productSaving}
          onClose={() => setIsFormOpen(false)}
          onSubmit={async (form) => {
            try {
              const result = await submitProduct(form);
              const fullProduct = await api.getProduct(result.id);
              const productUnits = fullProduct.productUnits || [];
              const baseUnit = productUnits.find((u) => u.is_base) || null;
              const matchedTax = productTaxes?.find(
                (tx) => tx.id === form.tax_id
              );

              const targetIndex = items.findIndex(
                (i) => !i.product_id && !i.product_name?.trim()
              );

              const productPayload = {
                id: result.id,
                name: form.name,
                price: baseUnit?.sale_price ?? form.salePrice,
                tax_id: form.tax_id,
                tax_rate: matchedTax?.rate || 0,
                available_units: productUnits,
                unit_id: baseUnit?.id ?? null,
                unit_name: baseUnit?.unit_name || "",
              };

              if (targetIndex === -1) {
                addItemWithProduct(productPayload);
              } else {
                setItemProduct(targetIndex, productPayload);
              }

              setIsFormOpen(false);
              await refetch();
            } catch {
              // actionError already set inside submitProduct/useProductCatalog
            }
          }}
        />
      )}

      <ToastContainer />
    </div>
  );
}
