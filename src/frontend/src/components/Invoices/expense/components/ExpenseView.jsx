import React, { useEffect, useState } from "react";
import {
  Receipt,
  HandCoins,
  FileText,
  Download,
  Printer,
  StickyNote,
} from "lucide-react";

import { useParams } from "react-router-dom";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import GoTo from "../../../../Global/GoTo";
import HoverTooltip from "../../../../Global/HoverTooltip";
import BackButton from "../../../../Global/BackButton";

const STATUS_CONFIG = {
  paid: { bg: "bg-green-100", text: "text-green-700" },
  partial: { bg: "bg-amber-100", text: "text-amber-700" },
  unpaid: { bg: "bg-red-100", text: "text-red-600" },
};

export default function ExpenseView() {
  const { t } = useTranslation();
  const { id } = useParams();

  const api = window.api;
  const { money } = usePrimaryCurrency();

  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [isPrinting, setIsPrinting] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  const handlePrint = async () => {
    try {
      setIsPrinting(true);
      const res = await window.api.printDocument(`/print-expense/${id}`);
      if (!res.success && res.error === "NO_PRINTER")
        console.error("No printer found");
    } catch (err) {
      console.error(err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSavePdf = async () => {
    try {
      setIsSavingPdf(true);
      const res = await window.api.saveDocumentPdf(
        `/print-expense/${id}`,
        `expense-${id}.pdf`
      );
      if (!res.success && res.error !== "CANCELED") console.error(res.error);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingPdf(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadExpense = async () => {
      try {
        setLoading(true);
        const res = await api.getExpense(id);
        if (!cancelled) setExpense(res);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadExpense();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString();
  };

  const items = expense?.items || [];
  const allocations = expense?.allocations || [];
  const status = expense?.status || "unpaid";
  const statusStyle = STATUS_CONFIG[status] || STATUS_CONFIG.unpaid;

  const statusLabel =
    status === "paid"
      ? t("ui.paid")
      : status === "partial"
        ? t("ui.partial", "Partial")
        : t("ui.unpaid");

  const itemTaxTotal = items.reduce(
    (sum, item) => sum + Number(item.taxValue || 0),
    0
  );
  const itemDiscountTotal = items.reduce(
    (sum, item) => sum + Number(item.discount || 0),
    0
  );
  const invoiceDiscount = Number(expense?.discount || 0);
  const invoiceTaxValue = Number(expense?.taxValue || 0);
  const hasAnyDiscount = itemDiscountTotal > 0 || invoiceDiscount > 0;
  const hasAnyTax = itemTaxTotal > 0 || invoiceTaxValue > 0;
  const hasAnyItemNote = items.some((item) => item.description);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef3ff] text-slate-500">
        {t("screens.invoices.loadingInvoice")}
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="p-6 text-red-500">
        {error || t("screens.invoices.notFound")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900 print:bg-white">
      <div className="mx-auto max-w-5xl">
        <div className="print:hidden mb-6 flex items-center justify-between">
          <BackButton />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSavePdf}
              disabled={isSavingPdf}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#4663ff] px-4 text-sm font-bold text-white shadow-md shadow-[#4663ff]/25 hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={18} />
              {isSavingPdf ? t("common.saving") : t("common.savePdf")}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#4663ff] px-4 text-sm font-bold text-white shadow-md shadow-[#4663ff]/25 hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Printer size={18} />
              {isPrinting ? t("common.saving") : t("common.print")}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(70,99,255,0.14)] print:rounded-none print:border-none print:shadow-none">
          <div className="grid gap-6 bg-[#f8faff] p-7 md:grid-cols-[1fr_auto]">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#4663ff] text-white">
                <Receipt size={24} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-[#4663ff]">
                  {t("ui.expenses")}
                </p>
                <h1 className="text-3xl font-black text-slate-950">
                  {expense.invoice_name || `${t("ui.expense")} #${expense.id}`}
                </h1>
                <p className="text-sm text-slate-500">
                  {t("screens.invoices.invoiceDate", {
                    date: formatDate(expense.date),
                  })}
                </p>
              </div>
            </div>

            <div className="text-left md:text-right">
              <p className="text-lg font-black text-slate-950">
                {expense.supplier_id ? (
                  <GoTo
                    type="supplier"
                    id={expense.supplier_id}
                    variant="light"
                  >
                    {expense.supplier_name || t("ui.noSupplier")}
                  </GoTo>
                ) : (
                  expense.supplier_name || t("ui.noSupplier")
                )}
              </p>
              <p className="text-sm text-slate-500">{t("ui.supplier")}</p>
              <span
                className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-black ${statusStyle.bg} ${statusStyle.text}`}
              >
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="p-7">
            {expense.description && (
              <div className="mb-6 rounded-2xl border border-[#e5ebff] bg-[#f8faff] p-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-700">
                  <FileText size={16} className="text-[#4663ff]" />
                  {t("ui.description", "Description")}
                </div>
                <p className="text-sm leading-6 text-slate-600">
                  {expense.description}
                </p>
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-[#e5ebff]">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-[#f8faff] text-xs font-bold uppercase text-slate-500">
                  <tr>
                    <th className="p-3 text-start">{t("ui.category")}</th>
                    <th className="p-3 text-start">{t("ui.price")}</th>
                    {hasAnyDiscount && (
                      <th className="p-3 text-start">{t("ui.discount")}</th>
                    )}
                    {hasAnyTax && (
                      <th className="p-3 text-start">{t("ui.tax")}</th>
                    )}
                    <th className="p-3 text-start">{t("ui.total")}</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#e5ebff]">
                  {items.length === 0 ? (
                    <tr>
                      <td className="p-5 text-start text-slate-500" colSpan={5}>
                        {t("screens.invoices.noItems")}
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => {
                      const afterDiscount =
                        Number(item.total || 0) - Number(item.discount || 0);
                      const lineTotal =
                        afterDiscount + Number(item.taxValue || 0);

                      return (
                        <tr key={item.id ?? index}>
                          <td className="p-3">
                            <div className="font-bold text-slate-900">
                              {item.category_id ? (
                                <GoTo
                                  type="expense_category"
                                  id={item.category_id}
                                  variant="light"
                                >
                                  {item.category_name || "-"}
                                </GoTo>
                              ) : (
                                item.category_name || "-"
                              )}
                            </div>
                            {item.description && (
                              <div className="mt-1 flex items-start gap-1 text-xs italic text-slate-400">
                                <StickyNote
                                  size={11}
                                  className="mt-0.5 shrink-0"
                                />
                                {item.description}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-start tabular-nums">
                            {money(item.price)}
                          </td>
                          {hasAnyDiscount && (
                            <td className="p-3 text-start tabular-nums">
                              {Number(item.discount || 0) > 0 ? (
                                <HoverTooltip
                                  trigger={
                                    <span className="font-bold text-red-500">
                                      -{money(item.discount)}
                                    </span>
                                  }
                                  content={
                                    <div className="flex justify-between">
                                      <span>{t("ui.discount")}</span>
                                      <span className="font-bold text-red-500">
                                        {item.discount_rate}%
                                      </span>
                                    </div>
                                  }
                                />
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          )}
                          {hasAnyTax && (
                            <td className="p-3 text-start tabular-nums">
                              {Number(item.taxValue || 0) > 0 ? (
                                <HoverTooltip
                                  trigger={
                                    <span className="font-bold text-emerald-600">
                                      +{money(item.taxValue)}
                                    </span>
                                  }
                                  content={
                                    <div className="flex justify-between">
                                      <span>
                                        {item.tax_name || t("ui.tax")}
                                      </span>
                                      <span className="font-bold text-emerald-600">
                                        {item.tax_rate}%
                                      </span>
                                    </div>
                                  }
                                />
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          )}
                          <td className="p-3 text-start font-black tabular-nums text-[#4663ff]">
                            {money(lineTotal)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-6 lg:flex-row lg:justify-between">
              {/* PAYMENT HISTORY */}
              <div className="flex-1">
                <h3 className="mb-3 flex items-start gap-2 text-sm font-black text-slate-700">
                  <HandCoins size={16} className="text-[#4663ff]" />
                  {t("screens.invoices.paymentHistory", "Payment History")}
                </h3>

                {allocations.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#dbe4ff] p-5 text-start text-sm text-slate-400">
                    {t("screens.invoices.noPaymentsRecordedYet")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allocations.map((alloc) => (
                      <div
                        key={alloc.id}
                        className="flex items-center justify-between rounded-2xl border border-[#e5ebff] bg-[#f8faff] px-4 py-3 text-sm"
                      >
                        <div>
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            <GoTo
                              type="fund"
                              id={alloc.fund_id}
                              variant="light"
                            >
                              {alloc.fund_name || "-"}
                            </GoTo>
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                            {formatDate(alloc.date)} ·{" "}
                            <GoTo
                              type="payment"
                              id={alloc.payment_id}
                              variant="light"
                            >
                              {t("ui.payment")} #{alloc.payment_id}
                            </GoTo>
                          </div>
                        </div>
                        <div className="tabular-nums font-bold text-emerald-700">
                          {money(alloc.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* TOTALS */}
              <div className="w-full max-w-full space-y-2.5 rounded-3xl bg-[#f8faff] p-5 lg:w-80">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{t("ui.subtotal")}</span>
                  <span className="font-bold tabular-nums">
                    {money(expense.subtotal)}
                  </span>
                </div>

                {itemDiscountTotal > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">
                      {t("screens.invoices.itemDiscount")}
                    </span>
                    <span className="font-bold tabular-nums text-red-500">
                      -{money(itemDiscountTotal)}
                    </span>
                  </div>
                )}

                {invoiceDiscount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">
                      {t("screens.invoices.invoiceDiscount")}
                      {expense.discount_rate
                        ? ` (${expense.discount_rate}%)`
                        : ""}
                    </span>
                    <span className="font-bold tabular-nums text-red-500">
                      -{money(invoiceDiscount)}
                    </span>
                  </div>
                )}

                {itemTaxTotal > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">
                      {t("screens.invoices.itemTax")}
                    </span>
                    <span className="font-bold tabular-nums text-emerald-600">
                      +{money(itemTaxTotal)}
                    </span>
                  </div>
                )}

                {(expense.taxes || []).map((tax) => (
                  <div key={tax.id} className="flex justify-between text-xs">
                    <span className="text-slate-400">
                      {tax.tax_name} ({tax.tax_rate}%)
                    </span>
                    <span className="font-bold tabular-nums text-emerald-600">
                      +{money(tax.tax_value)}
                    </span>
                  </div>
                ))}

                <div className="flex justify-between border-t border-[#dbe4ff] pt-3 text-xl font-black">
                  <span>{t("ui.total")}</span>
                  <span className="text-[#4663ff]">
                    {money(expense.net_total)}
                  </span>
                </div>

                {status !== "unpaid" && (
                  <>
                    <div className="flex justify-between border-t border-dashed border-[#dbe4ff] pt-3 text-sm">
                      <span className="text-slate-500">{t("ui.paid")}</span>
                      <span className="font-bold text-emerald-700">
                        {money(expense.paid_amount)}
                      </span>
                    </div>
                    {status === "partial" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">
                          {t("ui.remaining", "Remaining")}
                        </span>
                        <span className="font-bold text-amber-600">
                          {money(expense.remaining_amount)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
