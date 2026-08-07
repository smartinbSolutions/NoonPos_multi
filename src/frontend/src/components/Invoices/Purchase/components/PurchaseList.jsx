import React, { useMemo, useState } from "react";
import usePurchaseList from "../hooks/usePurchaseList";
import {
  Download,
  Edit2,
  Eye,
  HandCoins,
  MoreVertical,
  PackagePlus,
  Percent,
  Printer,
  Receipt,
  Trash2,
  Undo2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../../Global/DeleteModel";
import AddPayment from "../../../Cash/Payment/components/AddPayment";
import InvoiceListHeader from "../../../../Global/InvoiceListHeader";
import Pagination from "../../../../Global/Pagination";
import ReturnStatusBadge from "../../../../Global/ReturnStatusBadge";
import FormattedDate from "../../../../Global/FormattedDate";
import HoverTooltip from "../../../../Global/HoverTooltip";
import GoTo from "../../../../Global/GoTo";
import DropdownMenu from "../../../../Global/DropdownMenu";
import InvoiceIdBadge from "../../../../Global/InvoiceIdBadge";

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
          )
      )}
    />
  );
}

const StatusBadge = ({ status, paidAmount, remainingAmount, money, t }) => {
  const config = {
    paid: { label: t("ui.paid"), classes: "bg-emerald-50 text-emerald-600" },
    partial: {
      label: t("ui.partial", "Partial"),
      classes: "bg-amber-50 text-amber-600",
    },
    unpaid: { label: t("ui.unpaid"), classes: "bg-slate-100 text-slate-500" },
  };
  const current = config[status] || config.unpaid;

  const badge = (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${current.classes}`}
    >
      {current.label}
    </span>
  );

  if (status !== "partial") return badge;

  return (
    <HoverTooltip
      trigger={badge}
      content={
        <>
          <div className="flex justify-between">
            <span>{t("ui.paid")}</span>
            <span className="font-bold text-emerald-600">
              {money(paidAmount)}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>{t("ui.remaining", "Remaining")}</span>
            <span className="font-bold text-amber-600">
              {money(remainingAmount)}
            </span>
          </div>
        </>
      }
    />
  );
};

const PurchaseList = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const {
    purchaseInvoices,
    loading,
    saving,
    error,
    refetch,
    deletePurchase,

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
    handleFilterChange,
    clearFilters,
    suppliers,
    taxes,
  } = usePurchaseList();

  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [deleteInvoice, setDeleteInvoice] = useState(null);
  const { money } = usePrimaryCurrency();

  const purchaseFilterFields = [
    { name: "dateFrom", type: "date", label: t("filters.dateFrom") },
    { name: "dateTo", type: "date", label: t("filters.dateTo") },
    {
      name: "supplierId",
      type: "select",
      label: t("ui.supplier"),
      allLabel: t("filters.allSuppliers"),
      options: suppliers.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      name: "status",
      type: "select",
      label: t("filters.status"),
      allLabel: t("filters.allStatuses"),
      options: [
        { value: "paid", label: t("ui.paid") },
        { value: "partial", label: t("ui.partial") },
        { value: "unpaid", label: t("ui.unpaid") },
      ],
    },
    {
      name: "returnStatus",
      type: "select",
      label: t("filters.returnStatus"),
      allLabel: t("filters.allReturnStatuses"),
      options: [
        { value: "none", label: t("filters.noReturn") },
        { value: "partial", label: t("ui.partiallyRefunded") },
        { value: "full", label: t("ui.fullyRefunded") },
      ],
    },
    { name: "minTotal", type: "number", label: t("filters.minTotal") },
    { name: "maxTotal", type: "number", label: t("filters.maxTotal") },
    {
      name: "taxIds",
      type: "multiselect",
      label: t("ui.tax"),
      options: taxes.map((tax) => ({
        value: tax.id,
        label: `${tax.name} (${tax.rate}%)`,
      })),
    },
  ];

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return purchaseInvoices;

    return purchaseInvoices.filter((inv) => {
      return [
        inv.id,
        inv.supplier_name,
        inv.supplier_id,
        inv.date,
        inv.total,
        inv.net_total,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [purchaseInvoices, search]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  const handlePrint = async (id) => {
    try {
      setIsPrinting(true);
      const res = await window.api.printDocument(`/print-purchase/${id}`);
      if (!res.success && res.error === "NO_PRINTER")
        console.error("No printer found");
    } catch (err) {
      console.error(err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSavePdf = async (id) => {
    try {
      setIsSavingPdf(true);
      const res = await window.api.saveDocumentPdf(
        `/print-purchase/${id}`,
        `purchase-${id}.pdf`
      );
      if (!res.success && res.error !== "CANCELED") console.error(res.error);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingPdf(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      setActionError("");
      await deletePurchase(id);
    } catch (err) {
      console.log(err.message);
      setActionError(t("screens.invoices.deleteFailed"));
    }
  };

  const totalNet = purchaseInvoices.reduce(
    (sum, inv) => sum + Number(inv.net_total || 0),
    0
  );
  const totalTax = purchaseInvoices.reduce(
    (sum, inv) => sum + Number(inv.total_tax_value || inv.taxValue || 0),
    0
  );
  const unpaidCount = purchaseInvoices.filter(
    (inv) => inv.status !== "paid"
  ).length;

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <InvoiceListHeader
          badgeLabel={t("ui.purchase")}
          badgeIcon={Receipt}
          title={t("screens.invoices.purchaseTitle")}
          subtitle={t("screens.invoices.purchaseSubtitle")}
          stats={[
            {
              icon: Receipt,
              value: purchaseInvoices.length,
              label: t("ui.invoices"),
            },
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
          addLabel={t("screens.invoices.addInvoice")}
          addIcon={PackagePlus}
          onAdd={() => navigate("/add-purchase")}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={clearFilters}
          filterFields={purchaseFilterFields}
          clearLabel={t("common.clear")}
        />

        {(error || actionError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {actionError || error}
          </div>
        )}

        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/85 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-[#f8faff] text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-center">{t("ui.invoice")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.supplier")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.date")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.subtotal")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.discount")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.tax")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.net")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.status")}</th>
                  <th className="px-4 py-3 text-center">
                    {t("common.actions")}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#e5ebff]">
                {loading ? (
                  <tr>
                    <td colSpan="9" className="p-8 text-center text-slate-500">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="p-8 text-center text-slate-500">
                      {t("screens.invoices.empty")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => {
                    const itemTax = Number(inv.item_tax_total || 0);
                    const invoiceTax = Number(inv.taxValue || 0);
                    const totalTaxValue = Number(
                      inv.total_tax_value ?? itemTax + invoiceTax
                    );

                    const itemDiscount = Number(inv.item_discount_total || 0);
                    const invoiceDiscount = Number(inv.discount || 0);
                    const totalDiscountValue = Number(
                      inv.total_discount_value ?? itemDiscount + invoiceDiscount
                    );

                    return (
                      <tr
                        key={inv.id}
                        className="transition hover:bg-[#f8faff]"
                      >
                        <td className="px-4 py-3 text-center">
                          <InvoiceIdBadge id={inv.id} name={inv.invoice_name} />
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900 text-center">
                          <GoTo type={"supplier"} id={inv?.supplier_id}>
                            {" "}
                            {inv.supplier_name || "-"}
                          </GoTo>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-center">
                          <FormattedDate value={inv.date} />
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-slate-700 text-center">
                          {money(inv.subtotal || 0)}
                        </td>

                        <td className="px-4 py-3 text-center tabular-nums ">
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

                        <td className="px-4 py-3 text-center tabular-nums">
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
                                ...(inv.taxes || []).map((tax) => ({
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

                        <td className="px-4 py-3 text-center font-bold tabular-nums text-emerald-700">
                          {money(inv.net_total || 0)}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <StatusBadge
                              status={inv.status}
                              paidAmount={inv.paid_amount}
                              remainingAmount={inv.remaining_amount}
                              money={money}
                              t={t}
                            />
                            <ReturnStatusBadge status={inv.return_status} />
                          </div>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <DropdownMenu
                            trigger={
                              <button className="rounded-lg p-1.5 text-slate-500 hover:bg-[#eef3ff] hover:text-[#4663ff]">
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
                                  navigate(`/view-purchase/${inv.id}`),
                              },
                              {
                                key: "savePdf",
                                icon: <Download size={14} />,
                                label: t("common.savePdf"),
                                onClick: () => handleSavePdf(inv.id),
                              },
                              {
                                key: "print",
                                icon: <Printer size={14} />,
                                label: t("common.print"),
                                onClick: () => handlePrint(inv.id),
                              },
                              {
                                key: "payment",
                                icon: <HandCoins size={14} />,
                                label: t("ui.payment"),
                                onClick: () => {
                                  setSelecteInvoice(inv);
                                  setOpenPaymentModel(true);
                                },
                                visible: inv.status !== "paid",
                              },
                              {
                                key: "return",
                                icon: <Undo2 size={14} />,
                                label: t("ui.createPurchaseReturn"),
                                onClick: () =>
                                  navigate(`/purchase-return/${inv.id}`),
                                visible: inv.return_status !== "full",
                              },
                              {
                                key: "edit",
                                icon: <Edit2 size={14} />,
                                label: t("common.edit"),
                                onClick: () =>
                                  navigate(`/edit-purchase/${inv.id}`),
                                visible:
                                  inv.status === "unpaid" &&
                                  inv.return_status === "none",
                              },
                              {
                                key: "delete",
                                icon: (
                                  <Trash2 size={14} className="text-red-500" />
                                ),
                                label: t("common.delete"),
                                onClick: () => setDeleteInvoice(inv),
                                visible:
                                  inv.status === "unpaid" &&
                                  inv.return_status === "none",
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
        mode="purchase"
        refetchList={refetch}
      />
      <DeleteModal
        open={Boolean(deleteInvoice)}
        onClose={() => setDeleteInvoice(null)}
        onConfirm={async () => {
          await handleDelete(deleteInvoice.id);
          setDeleteInvoice(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />
    </div>
  );
};

export default PurchaseList;
