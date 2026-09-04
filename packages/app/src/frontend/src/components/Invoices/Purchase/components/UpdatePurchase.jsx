import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { ToastContainer } from "react-toastify";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Receipt,
  Lock,
  X,
  Percent,
  Tag,
  StickyNote,
} from "lucide-react";
import useUpdatePurchase from "../hooks/useUpdatePurchase";
import SearchableSelect from "../../../../Global/SearchableSelect";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../../Global/DeleteModel";
import ConfirmModal from "../../../../Global/ConfirmModal";
import DropdownMenu from "../../../../Global/DropdownMenu";
import useProductCatalog from "../../../Products/hooks/useProductCatalog";
import ProductQuickAddModal from "../../../Products/components/ProductQuickAddModal";
import useSuppliersList from "../../../Supplier/hooks/useSuppliersList";
import SupplierFormModal from "./SupplierFormModal";
import { normalizeDigits } from "../../../../Global/FormatNumber";
import NumberInput from "../../../../Global/NumberInput";
import TagPickerField from "../../../Tags/components/TagPickerField";

const inputClass =
  "h-9 w-full rounded-xl border border-[#e1e7fb] bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-350 focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const smallInputClass =
  "h-8 w-full rounded-lg border border-[#e1e7fb] bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const panelClass =
  "relative overflow-hidden rounded-2xl border border-[#e9edfb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const panelBodyClass = "p-4";

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

function AdjustmentChip({ icon, tone, children, onRemove, disabled }) {
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
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded p-0.5 text-slate-400 transition hover:bg-white hover:text-red-600"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export default function UpdatePurchase() {
  const { t } = useTranslation();
  const catalog = useProductCatalog();
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);

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

  const {
    invoice,
    setInvoice,
    addInvoiceTax,
    removeInvoiceTax,
    clearInvoiceTaxes,
    setInvoiceDiscountRate,
    setInvoiceDiscountAmount,
    clearInvoiceDiscount,
    items,
    products,
    suppliers,
    taxes,
    tagIds,
    setTagIds,
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
    invoiceDiscount,
    invoiceTaxValue,
    netTotal,
    saving,
    error,
    loading,
    api,
    setProducts,
    refetch,
    status,
  } = useUpdatePurchase();

  const { submitDraft, setDraft, draft, actionError } = useSuppliersList();

  const { money } = usePrimaryCurrency();
  const [deleteItemIndex, setDeleteItemIndex] = useState(null);

  const [revealedItemDiscounts, setRevealedItemDiscounts] = useState(
    () => new Set(),
  );
  const [revealedItemNotes, setRevealedItemNotes] = useState(() => new Set());
  const [invoiceDiscountRevealed, setInvoiceDiscountRevealed] = useState(false);
  const [invoiceTaxRevealed, setInvoiceTaxRevealed] = useState(false);
  const [invoiceNoteRevealed, setInvoiceNoteRevealed] = useState(false);

  const [pendingTaxConfirm, setPendingTaxConfirm] = useState(null);
  const [confirmingTaxUpdate, setConfirmingTaxUpdate] = useState(false);

  useEffect(() => {
    if (loading) return;

    setRevealedItemDiscounts(
      new Set(
        items
          .map((item, i) => (Number(item.discount_rate) > 0 ? i : null))
          .filter((i) => i !== null),
      ),
    );
    setRevealedItemNotes(
      new Set(
        items
          .map((item, i) => (item.description ? i : null))
          .filter((i) => i !== null),
      ),
    );
    setInvoiceDiscountRevealed(Number(invoice?.discount_rate) > 0);
    setInvoiceTaxRevealed((invoice?.taxes || []).length > 0);
    setInvoiceNoteRevealed(Boolean(invoice?.description));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const hasReturn = items.some((i) => Number(i.returned_quantity || 0) > 0);
  const isLocked = status === "paid" || status === "partial" || hasReturn;

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

  const handleItemTaxChange = (index, item, newTaxId) => {
    const selectedTax = taxes?.find((tx) => tx.id === newTaxId) || null;
    const changed = updateItemTax(index, newTaxId, selectedTax?.rate || 0);

    if (changed && item.product_id) {
      setPendingTaxConfirm({
        productId: item.product_id,
        productName: item.name,
        newTaxId,
        newTaxName: selectedTax?.name || null,
      });
    }
  };

  const handleConfirmProductTaxUpdate = async () => {
    if (!pendingTaxConfirm) return;

    setConfirmingTaxUpdate(true);

    try {
      await api.updateProductTax({
        product_id: pendingTaxConfirm.productId,
        tax_id: pendingTaxConfirm.newTaxId,
      });
      await refetch(); // ADD
    } catch (err) {
      console.error("Failed to update product default tax:", err);
    } finally {
      setConfirmingTaxUpdate(false);
      setPendingTaxConfirm(null);
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
              <Receipt size={18} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#4663ff]">
                {t("ui.purchase")}
              </p>
              <h1 className="text-lg font-black leading-tight text-slate-950">
                {t("screens.invoices.editPurchase")}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase ${
                status === "paid"
                  ? "bg-emerald-50 text-emerald-600"
                  : status === "partial"
                    ? "bg-amber-50 text-amber-600"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {t(`screens.invoices.${status}`)}
            </span>
            <button
              type="button"
              onClick={() => window.history.back()}
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

        {isLocked && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-700">
            <Lock size={15} className="mt-0.5 shrink-0" />
            <span>
              {hasReturn
                ? t(
                    "screens.invoices.lockedAfterReturn",
                    "This invoice has a return and can no longer be edited.",
                  )
                : t("screens.invoices.lockedAfterPayment")}
            </span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <main className="space-y-4">
            <section className={panelClass}>
              <AccentRule colorClass="bg-[#4663ff]" />
              <div className={panelBodyClass}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-1">
                    <div className="flex-1">
                      <SearchableSelect
                        placeholder={t("ui.selectSupplier")}
                        options={suppliers}
                        selectedValue={invoice?.supplier_id}
                        onChange={(e) =>
                          setInvoice((prev) => ({ ...prev, supplier_id: e.id }))
                        }
                        disabled={isLocked}
                      />
                    </div>
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => setSupplierModalOpen(true)}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#4663ff] px-3 text-sm font-bold text-white shadow-md shadow-[#4663ff]/25 transition hover:bg-[#3854e8]"
                      >
                        <Plus size={14} />
                        <span>{t("screens.contacts.addSupplier")}</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="date"
                    className={inputClass}
                    value={invoice?.date || ""}
                    disabled={isLocked}
                    onChange={(e) =>
                      setInvoice((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>
              </div>
            </section>

            {/* Tags */}
            <section className={panelClass}>
              <AccentRule colorClass="bg-pink-500" />
              <div className={panelBodyClass}>
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
                    <Tag size={15} />
                  </span>
                  <h3 className="text-[13px] font-black text-slate-950">
                    {t("screens.tags.title")}
                  </h3>
                </div>

                <TagPickerField
                  scope="purchase_invoice"
                  entityType="purchase_invoice"
                  entityId={invoice?.id}
                  selectedIds={tagIds}
                  onChange={setTagIds}
                  skipInitialFetch
                  disabled={isLocked}
                />
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
                    disabled={isLocked}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#4663ff] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={13} />
                    {t("screens.invoices.addItem")}
                  </button>
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(true)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-600 transition hover:bg-violet-100"
                    >
                      <Plus size={13} />
                      {t("screens.products.create")}
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-[#eef1ff]">
                {items.map((item, index) => {
                  const afterDiscount =
                    (item.total || 0) - (item.discount || 0);
                  const lineTotal = afterDiscount + (item.taxValue || 0);
                  const hasProduct = Boolean(item.product_id);
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
                            placeholder={t("ui.selectProduct")}
                            options={products}
                            selectedValue={item.product_id}
                            selectedLabel={item.name}
                            disabled={isLocked}
                            onChange={(e) => {
                              updateItem(index, "product_id", e.id);
                            }}
                            onInputChange={async (value) => {
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
                          {item.code && (
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                              #{item.code}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setDeleteItemIndex(index)}
                          disabled={items.length === 1 || isLocked}
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
                            disabled={isLocked}
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
                            disabled={isLocked}
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
                              disabled={isLocked}
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
                            <div className="flex h-9 items-center rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs text-slate-400">
                              {item.unit_name || "—"}
                            </div>
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

                        {hasProduct && !isLocked && (
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
                            disabled={isLocked}
                            onRemove={() => disableItemTax(index)}
                          >
                            <select
                              className="h-6 border-none bg-transparent text-xs font-bold text-emerald-700 outline-none disabled:text-emerald-700"
                              value={item.tax_id || ""}
                              disabled={isLocked}
                              onChange={(e) => {
                                const newTaxId = e.target.value
                                  ? Number(e.target.value)
                                  : null;
                                handleItemTaxChange(index, item, newTaxId);
                              }}
                            >
                              <option value="">
                                {t("screens.products.noTaxOption")}
                              </option>
                              {taxes
                                ?.filter(
                                  (tax) =>
                                    tax.category === "product" ||
                                    tax.category === "both",
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
                            disabled={isLocked}
                            onRemove={() => toggleItemDiscount(index, true)}
                          >
                            <NumberInput
                              disabled={isLocked}
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
                              disabled={isLocked}
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
                            disabled={isLocked}
                            className="h-6 w-full min-w-0 flex-1 border-none bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400"
                            value={item.description || ""}
                            onChange={(e) =>
                              updateItemDescription(index, e.target.value)
                            }
                            placeholder={t("screens.invoices.notePlaceholder")}
                          />
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => toggleItemNote(index, true)}
                              className="shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-white hover:text-red-600"
                            >
                              <X size={13} />
                            </button>
                          )}
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
                  {invoiceDiscountRevealed && (
                    <div className="space-y-1.5 rounded-xl border border-red-100 bg-red-50/40 p-2.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-red-600">
                          <Percent size={12} />
                          {t("screens.invoices.invoiceDiscountRate")}
                        </label>
                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => {
                              clearInvoiceDiscount();
                              setInvoiceDiscountRevealed(false);
                            }}
                            className="rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-red-600"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <NumberInput
                            disabled={isLocked}
                            className={`${smallInputClass} pe-5 text-end tabular-nums`}
                            value={invoice.discount_rate || ""}
                            onChange={setInvoiceDiscountRate}
                            max={100}
                            placeholder="0"
                          />
                          <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                            %
                          </span>
                        </div>
                        <span className="text-xs text-slate-300">=</span>
                        <NumberInput
                          disabled={isLocked}
                          className={`${smallInputClass} flex-1 text-end tabular-nums`}
                          value={invoiceDiscount || ""}
                          onChange={setInvoiceDiscountAmount}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}

                  {invoiceTaxRevealed && (
                    <div className="space-y-1.5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-2.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                          <Receipt size={12} />
                          {t("ui.tax")}
                        </label>
                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => {
                              clearInvoiceTaxes();
                              setInvoiceTaxRevealed(false);
                            }}
                            className="rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-red-600"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>

                      {(invoice.taxes || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {invoice.taxes.map((tax) => (
                            <span
                              key={tax.id}
                              className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 shadow-sm"
                            >
                              {tax.name} ({tax.rate}%)
                              {!isLocked && (
                                <button
                                  type="button"
                                  onClick={() => removeInvoiceTax(tax.id)}
                                  className="rounded p-0.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                >
                                  <X size={11} />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      {!isLocked && (
                        <select
                          className={`${smallInputClass} text-right`}
                          value=""
                          onChange={(e) => {
                            const selected = taxes.find(
                              (tax) => tax.id === Number(e.target.value),
                            );
                            if (selected) addInvoiceTax(selected);
                          }}
                        >
                          <option value="">
                            {t(
                              "screens.invoices.addAnotherTax",
                              "Add another tax",
                            )}
                          </option>
                          {taxes
                            .filter(
                              (tax) =>
                                (tax.category === "invoice" ||
                                  tax.category === "both") &&
                                !(invoice.taxes || []).some(
                                  (applied) => applied.id === tax.id,
                                ),
                            )
                            .map((tax) => (
                              <option key={tax.id} value={tax.id}>
                                {tax.name} ({tax.rate}%)
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  )}

                  {!isLocked &&
                    (!invoiceDiscountRevealed ||
                      !invoiceTaxRevealed ||
                      !invoiceNoteRevealed) && (
                      <div className="flex">
                        <AddOptionsMenu
                          options={[
                            {
                              key: "invoice-discount",
                              label: t("screens.invoices.addInvoiceDiscount"),
                              icon: (
                                <Percent size={13} className="text-red-500" />
                              ),
                              visible: !invoiceDiscountRevealed,
                              onClick: () => setInvoiceDiscountRevealed(true),
                            },
                            {
                              key: "invoice-tax",
                              label: t("screens.invoices.addInvoiceTax"),
                              icon: (
                                <Receipt
                                  size={13}
                                  className="text-emerald-600"
                                />
                              ),
                              visible: !invoiceTaxRevealed,
                              onClick: () => setInvoiceTaxRevealed(true),
                            },
                            {
                              key: "invoice-note",
                              label: t("screens.invoices.addInvoiceNote"),
                              icon: (
                                <StickyNote
                                  size={13}
                                  className="text-amber-500"
                                />
                              ),
                              visible: !invoiceNoteRevealed,
                              onClick: () => setInvoiceNoteRevealed(true),
                            },
                          ]}
                        />
                      </div>
                    )}

                  {invoiceDiscount > 0 && (
                    <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {t("screens.invoices.invoiceDiscountAmount")}
                      </span>
                      <span className="text-right text-xs font-bold tabular-nums text-red-500">
                        -{money(invoiceDiscount)}
                      </span>
                    </div>
                  )}

                  {invoiceTaxValue > 0 && (
                    <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {t("screens.invoices.invoiceTaxAmount")}
                      </span>
                      <span className="text-right text-xs font-bold tabular-nums text-emerald-600">
                        +{money(invoiceTaxValue)}
                      </span>
                    </div>
                  )}

                  {invoiceNoteRevealed && (
                    <div className="space-y-1.5 rounded-xl border border-amber-100 bg-amber-50/40 p-2.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
                          <StickyNote size={12} />
                          {t("screens.invoices.invoiceNote")}
                        </label>
                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => {
                              setInvoice((prev) => ({
                                ...prev,
                                description: "",
                              }));
                              setInvoiceNoteRevealed(false);
                            }}
                            className="rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-red-600"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      <textarea
                        disabled={isLocked}
                        className={`${smallInputClass} min-h-[2.5rem] resize-none overflow-hidden py-1.5`}
                        value={invoice.description || ""}
                        onChange={(e) => {
                          setInvoice((prev) => ({
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

            {!isLocked && (
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4663ff] py-2.5 text-sm font-black text-white shadow-md shadow-[#4663ff]/25 transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={15} />
                {saving
                  ? t("common.saving")
                  : t("screens.invoices.saveInvoice")}
              </button>
            )}
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

      <ConfirmModal
        open={Boolean(pendingTaxConfirm)}
        onClose={() => setPendingTaxConfirm(null)}
        onConfirm={handleConfirmProductTaxUpdate}
        confirming={confirmingTaxUpdate}
        title={t("screens.invoices.updateProductTaxTitle")}
        message={
          pendingTaxConfirm
            ? pendingTaxConfirm.newTaxId
              ? t("screens.invoices.updateProductTaxSetMessage", {
                  taxName: pendingTaxConfirm.newTaxName,
                  productName: pendingTaxConfirm.productName,
                })
              : t("screens.invoices.updateProductTaxRemoveMessage", {
                  productName: pendingTaxConfirm.productName,
                })
            : ""
        }
      />
      {supplierModalOpen && (
        <SupplierFormModal
          open={supplierModalOpen}
          onClose={() => setSupplierModalOpen(false)}
          draft={draft}
          setDraft={setDraft}
          onSubmit={async (event) => {
            const result = await submitDraft(event);
            if (result && result.id) {
              setInvoice((prev) => ({ ...prev, supplier_id: result.id }));
              setSupplierModalOpen(false);
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
              const targetIndex = items.findIndex((i) => !i.product_id);
              const matchedTax = productTaxes?.find(
                (tx) => tx.id === form.tax_id,
              );

              if (targetIndex === -1) {
                addItemWithProduct({
                  id: result.id,
                  name: form.name,
                  price: form.costPrice,
                  tax_id: form.tax_id,
                  tax_rate: matchedTax?.rate || 0,
                });
              } else {
                setItemProduct(targetIndex, {
                  id: result.id,
                  name: form.name,
                  price: form.costPrice,
                  tax_id: form.tax_id,
                  tax_rate: matchedTax?.rate || 0,
                });
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
