import React, { useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Receipt,
  HandCoins,
  PackageOpen,
  AlertCircle,
  Loader2,
  X,
  Percent,
  StickyNote,
} from "lucide-react";
import { toast } from "react-toastify";
import useAddExpense from "../hooks/useAddExpense";
import SearchableSelect from "../../../../Global/SearchableSelect";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { ToastContainer } from "react-toastify";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../../Global/DeleteModel";
import AddPayment from "../../../Cash/Payment/components/AddPayment";
import useSuppliersList from "../../../Supplier/hooks/useSuppliersList";
import SupplierFormModal from "../../Purchase/components/SupplierFormModal";
import DropdownMenu from "../../../../Global/DropdownMenu";
import NumberInput from "../../../../Global/NumberInput";

const inputClass =
  "h-9 w-full rounded-xl border border-[#e1e7fb] bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-350 focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const smallInputClass =
  "h-8 w-full rounded-lg border border-[#e1e7fb] bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12";
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

export default function AddExpense() {
  const { t } = useTranslation();
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);

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
    supplierOptions,
    category,
    taxes,
    addItem,
    removeItem,
    updateItem,
    updateItemDiscountRate,
    updateItemDiscountAmount,
    clearItemDiscount,
    updateItemDescription,
    updateItemTax,
    enableItemTax,
    disableItemTax,
    submit,
    subtotal,
    itemDiscountSummary,
    itemTaxSummary,
    invoiceDiscount,
    invoiceTaxValue,
    netTotal,
    loading,
    saving,
    error,
    reset,
  } = useAddExpense({ supplierModalOpen });
  const { submitDraft, setDraft, draft, actionError } = useSuppliersList();
  const [deleteItemIndex, setDeleteItemIndex] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const { money } = usePrimaryCurrency();

  const [revealedItemDiscounts, setRevealedItemDiscounts] = useState(
    () => new Set()
  );
  const [revealedItemNotes, setRevealedItemNotes] = useState(() => new Set());
  const [invoiceDiscountRevealed, setInvoiceDiscountRevealed] = useState(false);
  const [invoiceTaxRevealed, setInvoiceTaxRevealed] = useState(false);
  const [invoiceNoteRevealed, setInvoiceNoteRevealed] = useState(false);

  const supplierName =
    supplierOptions.find((s) => s.id === invoice.supplier_id)?.name || "";

  const hasUsableItems = items.some((i) => i.category_id);
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

  const handleSaveUnpaid = async () => {
    if (!canSave) return;
    const res = await submit();
    if (res?.success) {
      toast.success(t("screens.expenses.savedUnpaid"));
    }
  };

  const handleOpenPayModal = () => {
    if (!hasUsableItems) {
      toast.error(t("errors.addOneItem"));
      return;
    }
    setPaymentModalOpen(true);
  };

  const handlePaymentCollected = async (paymentData) => {
    const res = await submit(paymentData);
    if (res?.success) {
      toast.success(t("screens.expenses.savedPaid"));
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f8fd] text-slate-900">
      <div className="mx-auto max-w-7xl space-y-4 p-5">
        <section className="flex flex-col gap-3 rounded-2xl border border-[#e9edfb] bg-white px-5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4663ff] text-white shadow-md shadow-[#4663ff]/25">
              <Receipt size={18} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#4663ff]">
                {t("ui.expense")}
              </p>
              <h1 className="text-lg font-black leading-tight text-slate-950">
                {t("screens.expenses.createExpense")}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {t("common.refresh")}
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              disabled={saving}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <ArrowLeft size={14} />
              {t("common.back")}
            </button>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <main className="space-y-4">
            <section className={panelClass}>
              <AccentRule colorClass="bg-[#4663ff]" />
              <div className={panelBodyClass}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <SearchableSelect
                        placeholder={t("ui.selectSupplier")}
                        options={supplierOptions}
                        selectedValue={invoice.supplier_id}
                        onChange={(e) =>
                          setInvoice({ ...invoice, supplier_id: e.id })
                        }
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setSupplierModalOpen(true)}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#4663ff] px-3 text-sm font-bold text-white shadow-md shadow-[#4663ff]/25 transition hover:bg-[#3854e8]"
                    >
                      <Plus size={14} />
                      <span>{t("screens.contacts.addSupplier")}</span>
                    </button>
                  </div>

                  <input
                    type="date"
                    className={inputClass}
                    value={invoice.date}
                    onChange={(e) =>
                      setInvoice({ ...invoice, date: e.target.value })
                    }
                  />

                  <input
                    type="text"
                    className={inputClass}
                    placeholder={t("ui.expenseName")}
                    value={invoice.invoice_name || ""}
                    onChange={(e) =>
                      setInvoice({ ...invoice, invoice_name: e.target.value })
                    }
                  />

                  <div />
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
                  {t("screens.invoices.addItem")}
                </button>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center gap-2.5 p-10 text-slate-400">
                  <Loader2 size={22} className="animate-spin" />
                  <p className="text-xs font-bold">{t("common.loading")}</p>
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2.5 p-10 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef3ff] text-[#4663ff]">
                    <PackageOpen size={20} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      {t("screens.expenses.noItemsYet")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t("screens.expenses.addItemToStart")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addItem}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-[#dbe4ff] bg-white px-3 py-1.5 text-xs font-bold text-[#4663ff] transition hover:bg-[#eef3ff]"
                  >
                    <Plus size={13} />
                    {t("screens.invoices.addItem")}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#eef1ff]">
                  {items.map((item, index) => {
                    const discountRevealed = revealedItemDiscounts.has(index);
                    const noteRevealed = revealedItemNotes.has(index);
                    const hasCategory = Boolean(item.category_id);
                    const hasTax = hasCategory && item.tax_capable;
                    const afterDiscount =
                      (item.total || 0) - (item.discount || 0);
                    const lineTotal = afterDiscount + (item.taxValue || 0);

                    return (
                      <div
                        key={index}
                        className="space-y-2.5 p-3.5 transition hover:bg-[#fafbff]"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <SearchableSelect
                              placeholder={t("ui.selectExpense")}
                              options={category}
                              selectedValue={item.category_id}
                              onChange={(e) =>
                                updateItem(index, "category_id", e.id)
                              }
                            />
                          </div>

                          <div className="w-32 shrink-0">
                            <NumberInput
                              className={inputClass}
                              value={item.price}
                              onChange={(val) =>
                                updateItem(index, "price", val)
                              }
                            />
                          </div>

                          <div className="flex h-9 w-32 shrink-0 items-center justify-end rounded-xl bg-[#f6f8fd] px-3 text-sm font-black tabular-nums text-[#4663ff]">
                            {money(lineTotal)}
                          </div>

                          {hasCategory && (
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
                          )}

                          <button
                            type="button"
                            onClick={() => setDeleteItemIndex(index)}
                            disabled={items.length === 1}
                            title={
                              items.length === 1
                                ? t("screens.invoices.keepOneItem")
                                : undefined
                            }
                            className="shrink-0 rounded-lg p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

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
                              placeholder={t(
                                "screens.invoices.notePlaceholder"
                              )}
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
              )}
            </section>
          </main>

          <aside className="space-y-4">
            <section className={panelClass}>
              <AccentRule colorClass="bg-emerald-500" />
              <div className={panelBodyClass}>
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <HandCoins size={15} />
                  </span>
                  <h3 className="text-[13px] font-black text-slate-950">
                    {t("ui.summary")}
                  </h3>
                </div>

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
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <NumberInput
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
                      </div>

                      {(invoice.taxes || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {invoice.taxes.map((tax) => (
                            <span
                              key={tax.id}
                              className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 shadow-sm"
                            >
                              {tax.name} ({tax.rate}%)
                              <button
                                type="button"
                                onClick={() => removeInvoiceTax(tax.id)}
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
                          if (selected) addInvoiceTax(selected);
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
                              !(invoice.taxes || []).some(
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

                  {(!invoiceDiscountRevealed ||
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
                              <Receipt size={13} className="text-emerald-600" />
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
                      </div>
                      <textarea
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

            <section className={panelClass}>
              <AccentRule colorClass="bg-amber-500" />
              <div className={`${panelBodyClass} space-y-2.5`}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <Save size={14} />
                  </span>
                  <h3 className="text-[13px] font-black text-slate-950">
                    {t("ui.payment")}
                  </h3>
                </div>

                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={handleSaveUnpaid}
                    disabled={!canSave}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : null}
                    {t("screens.invoices.saveUnpaid")}
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenPayModal}
                    disabled={!canSave}
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#4663ff] py-2.5 text-sm font-black text-white shadow-md shadow-[#4663ff]/25 transition hover:bg-[#3854e8] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save size={15} />
                    {t("screens.invoices.saveAndPay")}
                  </button>
                </div>

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

      {supplierModalOpen && (
        <SupplierFormModal
          open={supplierModalOpen}
          onClose={() => setSupplierModalOpen(false)}
          draft={draft}
          setDraft={setDraft}
          onSubmit={submitDraft}
          saving={saving}
          actionError={actionError}
          t={t}
        />
      )}
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

      <AddPayment
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        invoice={null}
        totalAmount={netTotal}
        party={invoice.supplier_id}
        partyName={supplierName}
        mode="expense"
        onSubmit={handlePaymentCollected}
        confirmLabel={t("screens.invoices.saveInvoice")}
      />

      <ToastContainer />
    </div>
  );
}
