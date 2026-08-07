// SalesQuotationList.jsx
import React, { useMemo, useState } from "react";
import {
  FileText,
  PackagePlus,
  Eye,
  Trash2,
  Percent,
  Edit2,
  Send,
  MoreVertical,
  Download,
  Printer,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import useSalesQuotationList from "../hooks/useSalesQuotationList";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../../Global/DeleteModel";
import InvoiceListHeader from "../../../../Global/InvoiceListHeader";
import Pagination from "../../../../Global/Pagination";
import FormattedDate from "../../../../Global/FormattedDate";
import InvoiceIdBadge from "../../../../Global/InvoiceIdBadge";
import GoTo from "../../../../Global/GoTo";
import HoverTooltip from "../../../../Global/HoverTooltip";
import { ToastContainer } from "react-toastify";
import DropdownMenu from "../../../../Global/DropdownMenu";

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

const STATUS_CONFIG = {
  draft: "bg-slate-100 text-slate-500",
  sent: "bg-amber-50 text-amber-600",
  accepted: "bg-emerald-50 text-emerald-600",
  rejected: "bg-red-50 text-red-600",
  expired: "bg-slate-100 text-slate-400",
};

const StatusBadge = ({ status, t }) => (
  <span
    className={`inline-flex items-center rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${
      STATUS_CONFIG[status] || STATUS_CONFIG.draft
    }`}
  >
    {t(`screens.quotations.status.${status}`)}
  </span>
);

const SalesQuotationList = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const {
    salesQuotations,
    loading,
    error,
    refetch,
    deleteQuotation,

    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,

    filters,
    handleFilterChange,
    clearFilters,
    customers,
    taxes,
  } = useSalesQuotationList();

  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [deleteQuotationTarget, setDeleteQuotationTarget] = useState(null);
  const { money } = usePrimaryCurrency();

  const [isPrinting, setIsPrinting] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const api = window.api;

  const handlePrint = async (quotationId) => {
    try {
      setIsPrinting(true);
      const res = await api.printDocument(
        `/print-sales-quotation/${quotationId}`
      );
      if (!res.success && res.error === "NO_PRINTER") {
        console.error("No printer found");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSavePdf = async (quotationId) => {
    try {
      setIsSavingPdf(true);
      const res = await api.saveDocumentPdf(
        `/print-sales-quotation/${quotationId}`,
        `quotation-${quotationId}.pdf`
      );
      if (!res.success && res.error !== "CANCELED") {
        console.error(res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingPdf(false);
    }
  };

  const quotationFilterFields = [
    { name: "dateFrom", type: "date", label: t("filters.dateFrom") },
    { name: "dateTo", type: "date", label: t("filters.dateTo") },
    {
      name: "customerId",
      type: "select",
      label: t("ui.customer"),
      allLabel: t("filters.allCustomers"),
      options: customers?.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      name: "status",
      type: "select",
      label: t("filters.status"),
      allLabel: t("filters.allStatuses"),
      options: [
        { value: "draft", label: t("screens.quotations.status.draft") },
        { value: "sent", label: t("screens.quotations.status.sent") },
        {
          value: "accepted",
          label: t("screens.quotations.status.accepted"),
        },
        {
          value: "rejected",
          label: t("screens.quotations.status.rejected"),
        },
        {
          value: "expired",
          label: t("screens.quotations.status.expired"),
        },
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
    if (!term) return salesQuotations;

    return salesQuotations.filter((q) => {
      return [
        q.id,
        q.customer_name,
        q.quotation_name,
        q.date,
        q.subtotal,
        q.net_total,
        q.status,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [salesQuotations, search]);

  const handleDelete = async (id) => {
    try {
      setActionError("");
      await deleteQuotation(id);
    } catch (err) {
      setActionError(
        err?.message === "CANNOT_DELETE_ACCEPTED_QUOTATION"
          ? t("screens.quotations.cannotDeleteAccepted")
          : t("screens.quotations.deleteFailed")
      );
    }
  };

  const totalNet = salesQuotations.reduce(
    (sum, q) => sum + Number(q.net_total || 0),
    0
  );
  const totalTax = salesQuotations.reduce(
    (sum, q) => sum + Number(q.total_tax_value || q.taxValue || 0),
    0
  );

  const acceptedCount = salesQuotations.filter(
    (q) => q.status === "accepted"
  ).length;

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <InvoiceListHeader
          badgeLabel={t("ui.sales")}
          badgeIcon={FileText}
          title={t("screens.quotations.listTitle")}
          subtitle={t("screens.quotations.listSubtitle")}
          stats={[
            {
              icon: FileText,
              value: salesQuotations.length,
              label: t("screens.quotations.quotations"),
            },
            {
              icon: Send,
              value: acceptedCount,
              label: t("screens.quotations.status.accepted"),
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
          searchPlaceholder={t("screens.quotations.search")}
          onRefresh={refetch}
          addLabel={t("screens.quotations.addQuotation")}
          addIcon={PackagePlus}
          onAdd={() => navigate("/add-sales-quotation")}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={clearFilters}
          filterFields={quotationFilterFields}
          clearLabel={t("common.clear")}
        />

        {(error || actionError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {actionError || error}
          </div>
        )}

        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/85 shadow-[0_18px_60px_rgba(70,99,255,0.10)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#f8faff] text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-center">
                    {t("screens.quotations.quotation")}
                  </th>
                  <th className="px-4 py-3 text-center">{t("ui.customer")}</th>
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
                      {t("screens.quotations.empty")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((q) => {
                    const itemTax = Number(q.item_tax_total || 0);
                    const quotationTax = Number(q.taxValue || 0);
                    const totalTaxValue = Number(
                      q.total_tax_value ?? itemTax + quotationTax
                    );

                    const itemDiscount = Number(q.item_discount_total || 0);
                    const quotationDiscount = Number(q.discount || 0);
                    const totalDiscountValue = Number(
                      q.total_discount_value ?? itemDiscount + quotationDiscount
                    );

                    const canEdit = q.status !== "accepted";
                    const canDelete = q.status !== "accepted";

                    return (
                      <tr key={q.id} className="transition hover:bg-[#f8faff]">
                        <td className="px-4 py-3 text-center">
                          <InvoiceIdBadge id={q.id} name={q.quotation_name} />
                        </td>

                        <td className="px-4 py-3 text-center">
                          {q.customer_id ? (
                            <GoTo type="customer" id={q.customer_id}>
                              {q.customer_name}
                            </GoTo>
                          ) : (
                            <span className="text-slate-400">
                              {t("screens.quotations.noCustomer")}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-500 text-center">
                          <FormattedDate value={q.date} />
                        </td>

                        <td className="px-4 py-3 text-center font-semibold tabular-nums text-slate-700">
                          {money(q.subtotal || 0)}
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
                                  value: quotationDiscount,
                                  display: `-${money(quotationDiscount)}`,
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
                                ...(q.taxes || []).map((tax) => ({
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
                          {money(q.net_total || 0)}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={q.status} t={t} />
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
                                  navigate(`/view-sales-quotation/${q.id}`),
                              },
                              {
                                key: "edit",
                                icon: <Edit2 size={14} />,
                                label: t("common.edit"),
                                onClick: () =>
                                  navigate(`/edit-sales-quotation/${q.id}`),
                                visible: canEdit,
                              },
                              {
                                key: "savePdf",
                                icon: <Download size={14} />,
                                label: t("common.savePdf", "Save as PDF"),
                                onClick: () => handleSavePdf(q.id),
                              },
                              {
                                key: "print",
                                icon: <Printer size={14} />,
                                label: t("common.print"),
                                onClick: () => handlePrint(q.id),
                              },
                              {
                                key: "delete",
                                icon: (
                                  <Trash2 size={14} className="text-red-500" />
                                ),
                                label: t("common.delete"),
                                onClick: () => setDeleteQuotationTarget(q),
                                visible: canDelete,
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

      <DeleteModal
        open={Boolean(deleteQuotationTarget)}
        onClose={() => setDeleteQuotationTarget(null)}
        onConfirm={async () => {
          await handleDelete(deleteQuotationTarget.id);
          setDeleteQuotationTarget(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />
      <ToastContainer />
    </div>
  );
};

export default SalesQuotationList;
