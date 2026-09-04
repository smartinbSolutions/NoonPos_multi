import React, { useEffect, useState } from "react";
import {
  Printer,
  ArrowLeft,
  Undo2,
  HandCoins,
  Tag,
  StickyNote,
  Download,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import GoTo from "../../../../Global/GoTo";
import FormattedDate from "../../../../Global/FormattedDate";
import HoverTooltip from "../../../../Global/HoverTooltip";
import BackButton from "../../../../Global/BackButton";
import TagList from "../../../Tags/components/TagList";

const STATUS_CONFIG = {
  paid: { bg: "bg-emerald-50", text: "text-emerald-600" },
  partial: { bg: "bg-amber-50", text: "text-amber-600" },
  unpaid: { bg: "bg-slate-100", text: "text-slate-500" },
};

const panelClass =
  "relative overflow-hidden rounded-2xl border border-[#e9edfb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

function AccentRule({ colorClass }) {
  return <div className={`absolute inset-x-0 top-0 h-[3px] ${colorClass}`} />;
}

export default function PurchaseReturnView() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();

  const [returnInvoice, setReturnInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState([]);
  const { money } = usePrimaryCurrency();

  useEffect(() => {
    let cancelled = false;

    const loadReturnInvoice = async () => {
      try {
        setLoading(true);
        const data = await window.api.getPurchaseReturnById(id);

        if (!cancelled) {
          setReturnInvoice(data);
        }

        if (data && !cancelled) {
          const tagsRes = await window.api.getEntityTags(
            "purchase_return",
            Number(id),
          );
          if (tagsRes.success && !cancelled) {
            setTags(tagsRes.data);
          }
        }
      } catch (error) {
        console.error("Failed to load purchase return:", error);
        if (!cancelled) {
          setReturnInvoice(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadReturnInvoice();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const items = returnInvoice?.items || [];
  const allocations = returnInvoice?.allocations || [];
  const status = returnInvoice?.status || "unpaid";
  const statusStyle = STATUS_CONFIG[status] || STATUS_CONFIG.unpaid;

  const statusLabel =
    status === "paid"
      ? t("ui.fullyRefunded")
      : status === "partial"
        ? t("ui.partialRefund")
        : t("ui.onAccount");

  const itemTaxTotal = items.reduce(
    (sum, item) => sum + Number(item.taxValue || 0),
    0,
  );
  const itemDiscountTotal = items.reduce(
    (sum, item) => sum + Number(item.discount || 0),
    0,
  );
  const invoiceDiscount = Number(returnInvoice?.discount || 0);
  const invoiceTaxValue = Number(returnInvoice?.taxValue || 0);

  const [isPrinting, setIsPrinting] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  const handlePrint = async () => {
    try {
      setIsPrinting(true);
      const res = await window.api.printDocument(
        `/print-purchase-return/${id}`,
      );
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
        `/print-purchase-return/${id}`,
        `purchase-return-${id}.pdf`,
      );
      if (!res.success && res.error !== "CANCELED") console.error(res.error);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8fd] text-sm font-bold text-slate-400">
        {t("common.loading")}
      </div>
    );
  }

  if (!returnInvoice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8fd] p-6 text-sm font-bold text-red-500">
        {t("screens.invoices.notFound")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8fd] p-5 text-slate-900 print:bg-white">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <BackButton />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSavePdf}
              disabled={isSavingPdf}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 text-sm font-bold text-white shadow-md shadow-amber-500/25 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={14} />
              {isSavingPdf ? t("common.saving") : t("common.savePdf")}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 text-sm font-bold text-white shadow-md shadow-amber-500/25 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Printer size={14} />
              {isPrinting ? t("common.saving") : t("common.print")}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#e9edfb] bg-white shadow-[0_12px_40px_rgba(70,99,255,0.10)] print:rounded-none print:border-none print:shadow-none">
          <div className="grid gap-4 border-b border-[#eef1ff] bg-[#f6f8fd] p-5 md:grid-cols-[1fr_auto]">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/25">
                <Undo2 size={20} />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">
                  {t("screens.purchaseReturn.purchaseReturn")}
                </p>
                <h1 className="text-xl font-black leading-tight text-slate-950">
                  #{returnInvoice.id}
                </h1>
                <div className="mt-0.5 space-y-0.5 text-xs text-slate-500">
                  <p>
                    {t("screens.purchaseReturn.returnDate")}:{" "}
                    <FormattedDate value={returnInvoice.date} />
                  </p>
                  <p>
                    {t("screens.purchaseReturn.originalInvoice")}:{" "}
                    <GoTo
                      type="purchase"
                      id={returnInvoice.purchase_invoice_id}
                    >
                      #{returnInvoice.purchase_invoice_id}
                    </GoTo>
                    {returnInvoice.purchase_invoice_name &&
                      ` (${returnInvoice.purchase_invoice_name})`}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-left md:text-right">
              <p className="text-base font-black text-slate-950">
                <GoTo type="supplier" id={returnInvoice.supplier_id}>
                  {returnInvoice.supplier_name || "-"}
                </GoTo>
              </p>

              <span
                className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusStyle.bg} ${statusStyle.text}`}
              >
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {returnInvoice.description && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/40 px-3.5 py-2.5 text-xs font-medium text-slate-600">
                <StickyNote
                  size={14}
                  className="mt-0.5 shrink-0 text-amber-500"
                />
                <div>
                  <span className="mb-0.5 block font-black uppercase tracking-wide text-amber-600">
                    {t("screens.purchaseReturn.reasonOfReturn")}
                  </span>
                  {returnInvoice.description}
                </div>
              </div>
            )}
            {tags.length > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-[#e9edfb] bg-white px-3.5 py-2.5 print:hidden">
                <Tag size={14} className="shrink-0 text-slate-400" />
                <TagList tags={tags} limit={6} />
              </div>
            )}

            <div className={panelClass}>
              <AccentRule colorClass="bg-amber-500" />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-[#f8faff] text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="p-3 text-right">{t("ui.product")}</th>
                      <th className="p-3 text-center">
                        {t("screens.purchaseReturn.returnQty")}
                      </th>
                      <th className="p-3 text-center">
                        {t("screens.purchaseReturn.returnPrice")}
                      </th>
                      <th className="p-3 text-center">{t("ui.discount")}</th>
                      <th className="p-3 text-center">{t("ui.tax")}</th>
                      <th className="p-3 text-center">{t("ui.total")}</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#eef1ff]">
                    {items.length === 0 ? (
                      <tr>
                        <td
                          className="p-6 text-center text-sm text-slate-400"
                          colSpan={6}
                        >
                          {t("screens.invoices.noItems")}
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => {
                        const afterDiscount =
                          Number(item.total || 0) - Number(item.discount || 0);
                        const lineTotal =
                          afterDiscount + Number(item.taxValue || 0);
                        const isNonBaseUnit =
                          item.unit_conversion_factor &&
                          Number(item.unit_conversion_factor) !== 1;

                        return (
                          <tr key={item.id} className="align-top">
                            <td className="p-3">
                              <div className="font-bold text-slate-900">
                                <GoTo
                                  id={item.product_id}
                                  type={"products"}
                                  variant="light"
                                >
                                  {item.product_name || item.name || "-"}
                                </GoTo>
                              </div>
                              {item.product_code && (
                                <div className="mt-0.5 text-[11px] font-semibold text-slate-400">
                                  #{item.product_code}
                                </div>
                              )}
                              {isNonBaseUnit && (
                                <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                                  <Tag size={11} className="shrink-0" />
                                  {t("screens.invoices.unitConversionDetail", {
                                    enteredQty: (
                                      Number(item.quantity) /
                                      Number(item.unit_conversion_factor)
                                    ).toFixed(2),
                                    unitName: item.unit_name,
                                    factor: item.unit_conversion_factor,
                                    baseQty: item.quantity,
                                  })}
                                </div>
                              )}
                              {item.description && (
                                <div className="mt-1 flex items-start gap-1 text-[11px] font-medium text-amber-600">
                                  <StickyNote
                                    size={11}
                                    className="mt-0.5 shrink-0"
                                  />
                                  {item.description}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-center font-semibold tabular-nums text-amber-700">
                              {isNonBaseUnit
                                ? Number(item.quantity || 0) /
                                  Number(item.unit_conversion_factor || 1)
                                : Number(item.quantity || 0)}
                              {item.unit_name && (
                                <span className="ml-1 text-[11px] font-normal text-slate-400">
                                  {item.unit_name}
                                </span>
                              )}
                              {isNonBaseUnit && (
                                <span className="ml-1 text-[11px] font-normal text-slate-400">
                                  ({Number(item.quantity || 0)})
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center tabular-nums text-slate-700">
                              {money(item.price)}
                            </td>
                            <td className="p-3 text-center tabular-nums">
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
                            <td className="p-3 text-center tabular-nums">
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
                            <td className="p-3 text-center font-black tabular-nums text-amber-700">
                              {money(lineTotal)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
              <div className={panelClass}>
                <AccentRule colorClass="bg-[#4663ff]" />
                <div className="p-4">
                  <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-black text-slate-900">
                    <HandCoins size={14} className="text-[#4663ff]" />
                    {t("screens.purchaseReturn.refundHistory")}
                  </h3>

                  {allocations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs font-semibold text-slate-400">
                      {t("screens.purchaseReturn.noCashRefunded")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {allocations.map((alloc) => (
                        <div
                          key={alloc.payment_id}
                          className="flex items-center justify-between rounded-xl border border-[#eef1ff] bg-[#f8faff] px-3 py-2.5 text-sm"
                        >
                          <div>
                            <div className="flex items-center gap-1.5 font-bold text-slate-800">
                              <GoTo type="fund" id={alloc.fund_id}>
                                {alloc.fund_name || "-"}
                              </GoTo>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                              <FormattedDate value={alloc.date} /> ·{" "}
                              <GoTo type="payment" id={alloc.payment_id}>
                                {t("ui.payment")} #{alloc.payment_id}
                              </GoTo>
                            </div>
                          </div>
                          <div className="font-bold tabular-nums text-emerald-700">
                            {money(alloc.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={panelClass}>
                <AccentRule colorClass="bg-emerald-500" />
                <div className="space-y-2.5 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("ui.subtotal")}</span>
                    <span className="font-bold tabular-nums">
                      {money(returnInvoice.subtotal)}
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
                        {returnInvoice.discount_rate
                          ? ` (${returnInvoice.discount_rate}%)`
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

                  {(returnInvoice.taxes || []).map((tax) => (
                    <div key={tax.id} className="flex justify-between text-xs">
                      <span className="text-slate-400">
                        {tax.tax_name} ({tax.tax_rate}%)
                      </span>
                      <span className="font-bold tabular-nums text-emerald-600">
                        +{money(tax.tax_value)}
                      </span>
                    </div>
                  ))}

                  <div className="flex items-center justify-between rounded-xl bg-[#f6f8fd] px-3 py-2.5">
                    <span className="text-xs font-black text-slate-700">
                      {t("ui.total")}
                    </span>
                    <span className="text-lg font-black tabular-nums text-amber-600">
                      {money(returnInvoice.net_total)}
                    </span>
                  </div>

                  {status !== "unpaid" && (
                    <>
                      <div className="flex justify-between border-t border-dashed border-slate-200 pt-2.5 text-xs">
                        <span className="text-slate-500">
                          {t("ui.cashRefunded")}
                        </span>
                        <span className="font-bold tabular-nums text-emerald-700">
                          {money(returnInvoice.paid_amount)}
                        </span>
                      </div>
                      {status === "partial" && (
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">
                            {t("ui.remaining")}
                          </span>
                          <span className="font-bold tabular-nums text-amber-600">
                            {money(returnInvoice.remaining_amount)}
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
    </div>
  );
}
