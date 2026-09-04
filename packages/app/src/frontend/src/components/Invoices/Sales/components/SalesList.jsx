import React, { useMemo, useState } from "react";
import {
  Receipt,
  HandCoins,
  PackagePlus,
  Eye,
  Trash2,
  Percent,
  Edit2,
  Undo2,
  Download,
  Printer,
  MoreVertical,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import useSalesList from "../hooks/useSalesList";
import AddPayment from "../../../Cash/Payment/components/AddPayment";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../../Global/DeleteModel";
import InvoiceListHeader from "../../../../Global/InvoiceListHeader";
import Pagination from "../../../../Global/Pagination";
import FormattedDate from "../../../../Global/FormattedDate";
import InvoiceIdBadge from "../../../../Global/InvoiceIdBadge";
import GoTo from "../../../../Global/GoTo";
import ReturnStatusBadge from "../../../../Global/ReturnStatusBadge";
import HoverTooltip from "../../../../Global/HoverTooltip";
import { ToastContainer } from "react-toastify";
import DropdownMenu from "../../../../Global/DropdownMenu";
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
    paid: {
      label: t("screens.invoices.paid"),
      classes: "bg-emerald-50 text-emerald-600",
    },
    partial: {
      label: t("screens.invoices.partial", "Partial"),
      classes: "bg-amber-50 text-amber-600",
    },
    unpaid: {
      label: t("screens.invoices.unpaid"),
      classes: "bg-slate-100 text-slate-500",
    },
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

const SalesList = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const {
    salesInvoices,
    loading,
    saving,
    error,
    refetch,
    deleteSales,

    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    api,
    selecteInvoice,
    setSelecteInvoice,
    openPaymentModel,
    setOpenPaymentModel,

    filters,
    handleFilterChange,
    clearFilters,
    customers,
    taxes,
    allTags,
    tagsByInvoice,
  } = useSalesList();

  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [deleteInvoice, setDeleteInvoice] = useState(null);
  const { money } = usePrimaryCurrency();

  const salesFilterFields = [
    { name: "dateFrom", type: "date", label: t("filters.dateFrom") },
    { name: "dateTo", type: "date", label: t("filters.dateTo") },
    {
      name: "customerId",
      type: "select",
      label: t("ui.customer"),
      allLabel: t("filters.allCustomers"),
      options: customers.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      name: "channel",
      type: "select",
      label: t("filters.channel"),
      allLabel: t("filters.allChannels"),
      options: [
        { value: "manual", label: t("screens.invoices.manual") },
        { value: "pos", label: t("screens.invoices.pos") },
      ],
    },
    {
      name: "status",
      type: "select",
      label: t("filters.status"),
      allLabel: t("filters.allStatuses"),
      options: [
        { value: "paid", label: t("screens.invoices.paid") },
        { value: "partial", label: t("screens.invoices.partial") },
        { value: "unpaid", label: t("screens.invoices.unpaid") },
      ],
    },

    {
      name: "returnStatus",
      type: "select",
      label: t("filters.returnStatus"),
      allLabel: t("filters.allReturnStatuses"),
      options: [
        { value: "none", label: t("filters.noReturn") },
        { value: "partial", label: t("ui.partially-refunded") },
        { value: "full", label: t("ui.fully-refunded") },
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
    {
      name: "tagIds",
      type: "multiselect",
      label: t("screens.tags.title"),
      options: allTags.map((tag) => ({
        value: tag.id,
        label: tag.name,
      })),
    },
  ];

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return salesInvoices;

    return salesInvoices.filter((inv) => {
      return [
        inv.id,
        inv.customer_name,
        inv.invoice_name,
        inv.date,
        inv.subtotal,
        inv.net_total,
        inv.status,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [salesInvoices, search]);

  const [isPrinting, setIsPrinting] = useState(false);
  const [savingPdfId, setSavingPdfId] = useState(null);

  const handlePrint = async (invoiceId) => {
    try {
      setIsPrinting(true);
      const res = await api.printDocument(`/print-sales/${invoiceId}`);
      if (!res.success && res.error === "NO_PRINTER") {
        setActionError(t("screens.invoices.noPrinter", "No printer found."));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSavePdf = async (invoiceId) => {
    try {
      setSavingPdfId(invoiceId);
      const res = await api.saveDocumentPdf(
        `/print-sales/${invoiceId}`,
        `invoice-${invoiceId}.pdf`,
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

  const handleDelete = async (id) => {
    try {
      setActionError("");
      await deleteSales(id);
    } catch (err) {
      setActionError(t("screens.invoices.deleteFailed"));
    }
  };

  const totalNet = salesInvoices.reduce(
    (sum, inv) => sum + Number(inv.net_total || 0),
    0,
  );
  const totalTax = salesInvoices.reduce(
    (sum, inv) => sum + Number(inv.total_tax_value || inv.taxValue || 0),
    0,
  );

  const unpaidCount = salesInvoices.filter(
    (inv) => inv.status !== "paid",
  ).length;

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <InvoiceListHeader
          badgeLabel={t("ui.sales")}
          badgeIcon={Receipt}
          title={t("screens.invoices.salesTitle")}
          subtitle={t("screens.invoices.salesSubtitle")}
          stats={[
            {
              icon: Receipt,
              value: salesInvoices.length,
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
          onAdd={() => navigate("/add-sales")}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={clearFilters}
          filterFields={salesFilterFields}
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
                  <th className="px-4 py-3 text-center">{t("ui.customer")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.date")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.subtotal")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.discount")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.tax")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.net")}</th>
                  <th className="px-4 py-3 text-center">{t("ui.status")}</th>
                  <th className="px-4 py-3 text-center">
                    {t("screens.tags.title")}
                  </th>
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
                      inv.total_tax_value ?? itemTax + invoiceTax,
                    );

                    const itemDiscount = Number(inv.item_discount_total || 0);
                    const invoiceDiscount = Number(inv.discount || 0);
                    const totalDiscountValue = Number(
                      inv.total_discount_value ??
                        itemDiscount + invoiceDiscount,
                    );

                    return (
                      <tr
                        key={inv.id}
                        className="transition hover:bg-[#f8faff]"
                      >
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <InvoiceIdBadge
                              id={inv.id}
                              name={inv.invoice_name}
                            />
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ${
                                inv.channel === "pos"
                                  ? "bg-violet-50 text-violet-600"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {inv.channel === "pos"
                                ? t("screens.invoices.pos")
                                : t("screens.invoices.manual")}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <GoTo type="customer" id={inv.customer_id}>
                            {inv.customer_name ||
                              t("screens.pos.walkInCustomer")}
                          </GoTo>
                        </td>

                        <td className="px-4 py-3 text-slate-500 text-center">
                          <FormattedDate value={inv.date} />
                        </td>

                        <td className="px-4 py-3 text-center font-semibold tabular-nums text-slate-700">
                          {money(inv.subtotal || 0)}
                        </td>

                        <td className="px-4 py-3 text-center tabular-nums">
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

                        <td className="px-4 py-3 text-right tabular-nums">
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
                          <TagList
                            tags={tagsByInvoice[inv.id] || []}
                            limit={2}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <DropdownMenu
                            trigger={
                              <button className="rounded-lg p-1.5 text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]">
                                <MoreVertical size={16} />
                              </button>
                            }
                            align={isRtl ? "left" : "right"}
                            options={[
                              {
                                key: "view",
                                icon: <Eye size={14} />,
                                label: t("common.view"),
                                onClick: () =>
                                  navigate(`/view-sales/${inv.id}`),
                              },
                              {
                                key: "savePdf",
                                icon: <Download size={14} />,
                                label: t("common.savePdf", "Save as PDF"),
                                onClick: () => handleSavePdf(inv.id),
                              },
                              {
                                key: "print",
                                icon: <Printer size={14} />,
                                label: t("common.print"),
                                onClick: () => handlePrint(inv.id),
                              },
                              {
                                key: "edit",
                                icon: <Edit2 size={14} />,
                                label: t("common.edit"),
                                onClick: () =>
                                  navigate(`/edit-sales/${inv.id}`),
                                visible:
                                  inv.status === "unpaid" &&
                                  inv.return_status === "none" &&
                                  inv.channel !== "pos",
                              },
                              {
                                key: "payment",
                                icon: <HandCoins size={14} />,
                                label: t("ui.payment"),
                                onClick: () => {
                                  setSelecteInvoice(inv);
                                  setOpenPaymentModel(true);
                                },
                                visible:
                                  inv.status !== "paid" &&
                                  inv.channel !== "pos",
                              },
                              {
                                key: "return",
                                icon: <Undo2 size={14} />,
                                label: t("ui.createSalesReturn"),
                                onClick: () =>
                                  navigate(`/sales-return/${inv.id}`),
                                visible: inv.return_status !== "full",
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
                                  inv.return_status === "none" &&
                                  inv.channel !== "pos",
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
        party={selecteInvoice?.customer_id}
        partyName={selecteInvoice?.customer_name}
        mode="sales"
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
      <ToastContainer />
    </div>
  );
};

export default SalesList;
