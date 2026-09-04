import React, { useMemo, useState } from "react";
import {
  Receipt,
  HandCoins,
  BanknoteArrowDown,
  Eye,
  Wallet2,
  Trash2,
  Info,
  Clock,
  Pencil,
  Percent,
  MoreVertical,
  Download,
  Printer,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../../Global/DeleteModel";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import useExpenseList from "../hooks/useExpenseList";
import AddPayment from "../../../Cash/Payment/components/AddPayment";
import InvoiceListHeader from "../../../../Global/InvoiceListHeader";
import CategoryTags from "../../../../Global/CategoryTags";
import Pagination from "../../../../Global/Pagination";
import HoverTooltip from "../../../../Global/HoverTooltip";
import DropdownMenu from "../../../../Global/DropdownMenu";
import GoTo from "../../../../Global/GoTo";
import TagList from "../../../Tags/components/TagList";

function BreakdownTooltip({ trigger, rows }) {
  const hasAnyValue = rows.some((r) => Number(r.value) > 0);
  if (!hasAnyValue) return trigger;

  return (
    <HoverTooltip
      trigger={trigger}
      content={rows.map(
        (row, i) =>
          Number(row.value) > 0 && (
            <div
              key={i}
              className={`flex justify-between ${i > 0 ? "mt-1" : ""}`}
            >
              <span>{row.label}</span>
              <span className={`font-bold ${row.className || ""}`}>
                {row.display}
              </span>
            </div>
          ),
      )}
    />
  );
}

const StatusBadge = ({ status, paidAmount, remainingAmount, money, t }) => {
  const config = {
    paid: { label: t("ui.paid"), className: "bg-emerald-50 text-emerald-600" },
    partial: {
      label: t("ui.partial"),
      className: "bg-amber-50 text-amber-600",
    },
    unpaid: { label: t("ui.unpaid"), className: "bg-red-50 text-red-500" },
  };

  const { label, className } = config[status] || config.unpaid;

  return (
    <div className="group relative inline-block">
      <span
        className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase  ${className}`}
      >
        {label}
      </span>

      {status === "partial" && (
        <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-xl border border-[#e5ebff] bg-white p-3 text-xs font-semibold text-slate-600 opacity-0 shadow-lg transition group-hover:opacity-100">
          <div className="flex justify-between">
            <span>{t("ui.paid")}</span>
            <span className="font-bold text-emerald-600">
              {money(paidAmount)}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>{t("ui.remaining")}</span>
            <span className="font-bold text-amber-600">
              {money(remainingAmount)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const splitDateTime = (value) => {
  if (!value) return { dateLabel: "-", fullLabel: "" };

  const [datePart, timePart] = String(value).split(/[ T]/);

  const dateLabel = datePart || "-";
  const fullLabel = timePart ? `${datePart} ${timePart.slice(0, 8)}` : datePart;

  return { dateLabel, fullLabel };
};

const ExpenseList = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const {
    expenses,
    suppliers,
    categories,
    taxes,
    loading,
    saving,
    error,
    refetch,
    handleDelete,

    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,

    selecteInvoice,
    setSelecteInvoice,
    openPaymentModel,
    setOpenPaymentModel,

    filters,
    setFilters,
    clearFilters,

    allTags,
    tagsByExpense,
  } = useExpenseList();

  const { money } = usePrimaryCurrency();

  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [deleteExpense, setDeleteExpense] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [savingPdfId, setSavingPdfId] = useState(null);

  const handlePrint = async (expenseId) => {
    try {
      setIsPrinting(true);
      const res = await window.api.printDocument(`/print-expense/${expenseId}`);
      if (!res.success && res.error === "NO_PRINTER") {
        setActionError(t("screens.invoices.noPrinter", "No printer found."));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSavePdf = async (expenseId) => {
    try {
      setSavingPdfId(expenseId);
      const res = await window.api.saveDocumentPdf(
        `/print-expense/${expenseId}`,
        `expense-${expenseId}.pdf`,
      );
      if (!res.success && res.error !== "CANCELED") {
        setActionError(t("screens.invoices.pdfFailed", "Failed to save PDF."));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPdfId(null);
    }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return expenses;

    return expenses.filter((inv) => {
      return [
        inv.id,
        inv.supplier_name,
        inv.invoice_name,
        inv.description,
        inv.date,
        inv.total,
        inv.net_total,
        inv.status,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [expenses, search]);

  const totalNet = expenses.reduce(
    (sum, inv) => sum + Number(inv?.net_total || 0),
    0,
  );
  const totalTax = expenses.reduce(
    (sum, inv) => sum + Number(inv?.total_tax_value ?? inv?.taxValue ?? 0),
    0,
  );

  const unpaidCount = expenses.filter((inv) => inv.status !== "paid").length;

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <InvoiceListHeader
          badgeLabel={t("ui.expenses")}
          title={t("screens.invoices.expensesTitle")}
          subtitle={t("screens.invoices.expenseSubtitle")}
          stats={[
            { icon: Receipt, value: expenses.length, label: t("ui.expense") },
            {
              icon: HandCoins,
              value: unpaidCount,
              label: t("ui.open"),
              variant: "amber",
            },
            {
              icon: Percent,
              value: money(totalTax),
              label: t("screens.invoices.taxCollected"),
              variant: "violet",
            },
            {
              eyebrow: "NET",
              value: money(totalNet),
              label: t("ui.total"),
              variant: "brand",
            },
          ]}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("screens.invoices.search")}
          onRefresh={refetch}
          addLabel={t("screens.invoices.addExpense")}
          addIcon={BanknoteArrowDown}
          onAdd={() => navigate("/add-expense")}
          filters={filters}
          onFilterChange={(name, value) =>
            setFilters({ [name]: value || null })
          }
          onClearFilters={clearFilters}
          filterFields={[
            {
              type: "select",
              name: "status",
              label: t("filters.status"),
              allLabel: t("filters.allStatuses"),
              options: [
                { value: "paid", label: t("ui.paid") },
                { value: "partial", label: t("ui.partial") },
                { value: "unpaid", label: t("ui.unpaid") },
              ],
            },
            {
              type: "select",
              name: "supplier_id",
              label: t("ui.supplier"),
              allLabel: t("filters.allSuppliers"),
              options: [
                { value: "none", label: t("screens.invoices.noSupplier") },
                ...suppliers.map((s) => ({ value: s.id, label: s.name })),
              ],
            },
            {
              type: "select",
              name: "category_id",
              label: t("ui.category"),
              allLabel: t("filters.allCategories"),
              options: categories.map((c) => ({ value: c.id, label: c.name })),
            },
            {
              type: "multiselect",
              name: "taxIds",
              label: t("ui.tax"),
              options: taxes.map((tax) => ({
                value: tax.id,
                label: `${tax.name} (${tax.rate}%)`,
              })),
            },
            {
              type: "multiselect",
              name: "tagIds",
              label: t("screens.tags.title"),
              options: allTags.map((tag) => ({
                value: tag.id,
                label: tag.name,
              })),
            },
            { type: "date", name: "startDate", label: t("filters.dateFrom") },
            { type: "date", name: "endDate", label: t("filters.dateTo") },
            { type: "number", name: "minTotal", label: t("filters.minTotal") },
            { type: "number", name: "maxTotal", label: t("filters.maxTotal") },
          ]}
        />

        {(error || actionError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-700">
            {error || actionError}
          </div>
        )}

        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/85 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead className="bg-[#f8faff] text-xs font-bold uppercase  text-slate-500">
                <tr>
                  <th className="px-5 py-4 text-center">{t("ui.invoice")}</th>
                  <th className="px-5 py-4 text-center">{t("ui.name")}</th>
                  <th className="px-5 py-4 text-center">{t("ui.supplier")}</th>
                  <th className="px-5 py-4 text-center">{t("ui.category")}</th>
                  <th className="px-5 py-4 text-center">{t("ui.date")}</th>
                  <th className="px-5 py-4 text-center">{t("ui.subtotal")}</th>
                  <th className="px-5 py-4 text-center">{t("ui.discount")}</th>
                  <th className="px-5 py-4 text-center">{t("ui.tax")}</th>
                  <th className="px-5 py-4 text-center">{t("ui.net")}</th>
                  <th className="px-5 py-4 text-center">{t("ui.status")}</th>
                  <th className="px-5 py-4 text-center">
                    {t("screens.tags.title")}
                  </th>
                  <th className="px-5 py-4 text-center w-12" />
                </tr>
              </thead>

              <tbody className="divide-y divide-[#e5ebff]">
                {loading ? (
                  <tr>
                    <td colSpan="11" className="p-8 text-center text-slate-500">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="p-8 text-center text-slate-500">
                      {t("screens.invoices.empty")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((exp) => {
                    const { dateLabel, fullLabel } = splitDateTime(exp.date);

                    const itemTax = Number(exp.item_tax_total || 0);
                    const invoiceTax = Number(exp.taxValue || 0);
                    const totalTaxValue = Number(
                      exp.total_tax_value ?? itemTax + invoiceTax,
                    );

                    const itemDiscount = Number(exp.item_discount_total || 0);
                    const invoiceDiscount = Number(exp.discount || 0);
                    const totalDiscountValue = Number(
                      exp.total_discount_value ??
                        itemDiscount + invoiceDiscount,
                    );

                    const canEditDelete = exp.status === "unpaid";

                    return (
                      <tr
                        key={exp.id}
                        className="transition hover:bg-[#f8faff]"
                      >
                        <td className="px-5 py-4 text-center">
                          <span className="rounded-xl bg-[#eef3ff] px-3 py-1.5 text-xs font-black text-[#4663ff]">
                            #{exp.id}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-center">
                          <div className="group relative flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">
                              {exp.invoice_name || "-"}
                            </span>
                            {exp.description && (
                              <>
                                <Info
                                  size={14}
                                  className="cursor-help text-slate-400 hover:text-[#4663ff]"
                                />
                                <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 max-w-[220px] whitespace-normal rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                                  {exp.description}
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-center font-bold text-slate-900">
                          <GoTo id={exp.supplier_id} type={"supplier"}>
                            {exp.supplier_name || "-"}
                          </GoTo>
                        </td>

                        <td className="px-5 py-4 text-center">
                          <CategoryTags names={exp.category_names} />
                        </td>

                        <td className="px-5 py-4 text-center text-slate-500">
                          <span className="group relative inline-flex cursor-help items-center gap-1.5">
                            {dateLabel}
                            <Clock
                              size={12}
                              className="text-slate-300 group-hover:text-[#4663ff]"
                            />
                            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                              {fullLabel}
                            </span>
                          </span>
                        </td>

                        <td className="px-5 py-4 text-center font-semibold tabular-nums text-slate-700">
                          {money(exp.subtotal || 0)}
                        </td>

                        <td className="px-5 py-4 text-center tabular-nums">
                          {totalDiscountValue > 0 ? (
                            <BreakdownTooltip
                              trigger={
                                <span className="font-bold text-red-500">
                                  -{money(totalDiscountValue)}
                                </span>
                              }
                              rows={[
                                {
                                  label: t("screens.invoices.itemDiscount"),
                                  value: itemDiscount,
                                  display: `-${money(itemDiscount)}`,
                                  className: "text-red-500",
                                },
                                {
                                  label: t("screens.invoices.invoiceDiscount"),
                                  value: invoiceDiscount,
                                  display: `-${money(invoiceDiscount)}`,
                                  className: "text-red-500",
                                },
                              ]}
                            />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-center tabular-nums">
                          {totalTaxValue > 0 ? (
                            <BreakdownTooltip
                              trigger={
                                <span className="font-bold text-emerald-600">
                                  +{money(totalTaxValue)}
                                </span>
                              }
                              rows={[
                                {
                                  label: t("screens.invoices.itemTax"),
                                  value: itemTax,
                                  display: `+${money(itemTax)}`,
                                  className: "text-emerald-600",
                                },
                                ...(exp.taxes || []).map((tax) => ({
                                  label: `${tax.name} (${tax.rate}%)`,
                                  value: tax.value,
                                  display: `+${money(tax.value)}`,
                                  className: "text-emerald-600",
                                })),
                              ]}
                            />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-center tabular-nums text-emerald-700 font-semibold">
                          {money(exp.net_total || 0)}
                        </td>

                        <td className="px-5 py-4 text-center">
                          <StatusBadge
                            status={exp.status}
                            paidAmount={exp.paid_amount}
                            remainingAmount={exp.remaining_amount}
                            money={money}
                            t={t}
                          />
                        </td>

                        <td className="px-5 py-4 text-center">
                          <TagList
                            tags={tagsByExpense[exp.id] || []}
                            limit={2}
                          />
                        </td>

                        <td className="px-5 py-4 text-center">
                          <DropdownMenu
                            trigger={
                              <button className="rounded-xl p-2 text-slate-500 hover:bg-[#eef3ff] hover:text-[#4663ff]">
                                <MoreVertical size={16} />
                              </button>
                            }
                            align={i18n.dir() === "rtl" ? "left" : "right"}
                            options={[
                              {
                                key: "view",
                                icon: <Eye size={14} />,
                                label: t("common.view"),
                                onClick: () =>
                                  navigate(`/view-expense/${exp.id}`),
                              },
                              {
                                key: "savePdf",
                                icon: <Download size={14} />,
                                label: t("common.savePdf"),
                                onClick: () => handleSavePdf(exp.id),
                              },
                              {
                                key: "print",
                                icon: <Printer size={14} />,
                                label: t("common.print"),
                                onClick: () => handlePrint(exp.id),
                              },
                              {
                                key: "payment",
                                icon: <Wallet2 size={14} />,
                                label: t("ui.payment"),
                                onClick: () => {
                                  setSelecteInvoice(exp);
                                  setOpenPaymentModel(true);
                                },
                                visible: exp.status !== "paid",
                              },
                              {
                                key: "edit",
                                icon: <Pencil size={14} />,
                                label: t("common.edit"),
                                onClick: () =>
                                  navigate(`/edit-expense/${exp.id}`),
                                visible: canEditDelete,
                              },
                              {
                                key: "delete",
                                icon: (
                                  <Trash2 size={14} className="text-red-500" />
                                ),
                                label: t("common.delete"),
                                onClick: () => setDeleteExpense(exp),
                                visible: canEditDelete,
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
        </section>
      </div>

      <AddPayment
        isOpen={openPaymentModel}
        onClose={() => setOpenPaymentModel(false)}
        invoice={selecteInvoice}
        party={selecteInvoice?.supplier_id}
        partyName={selecteInvoice?.supplier_name}
        mode="expense"
        refetchList={refetch}
      />

      <DeleteModal
        open={Boolean(deleteExpense)}
        onClose={() => setDeleteExpense(null)}
        onConfirm={async () => {
          await handleDelete(deleteExpense.id);
          setDeleteExpense(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />
    </div>
  );
};

export default ExpenseList;
