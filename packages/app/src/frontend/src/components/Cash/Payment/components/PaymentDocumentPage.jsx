import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast, ToastContainer } from "react-toastify";
import {
  Printer,
  Trash2,
  TrendingUp,
  TrendingDown,
  Download,
} from "lucide-react";

import { formatMoney } from "../../../../Global/FormatNumber";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import DeleteModal from "../../../../Global/DeleteModel";
import GoTo from "../../../../Global/GoTo";
import BackButton from "../../../../Global/BackButton";

const PaymentDocumentPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { primaryCurrency } = usePrimaryCurrency();

  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  const api = window.api;

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getPayment(id).then((data) => {
      if (active) {
        setPayment(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [id]);

  const handlePrint = async () => {
    try {
      setIsPrinting(true);
      const res = await api.printDocument(`/print-payment/${id}`);
      if (!res.success && res.error === "NO_PRINTER") {
        toast.error(t("screens.invoices.noPrinter", "No printer found."));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSavePdf = async () => {
    try {
      setIsSavingPdf(true);
      const res = await api.saveDocumentPdf(
        `/print-payment/${id}`,
        `payment-${id}.pdf`
      );
      if (!res.success && res.error !== "CANCELED") {
        toast.error(t("screens.invoices.pdfFailed", "Failed to save PDF."));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingPdf(false);
    }
  };

  const handleDelete = async () => {
    const res = await api.deletePayment(id);
    if (res.success) {
      toast.success(t("screens.payments.deleted"));
      navigate("/payments");
    } else {
      toast.error(res.message || t("screens.payments.deleteFailed"));
    }
    setDeleteOpen(false);
  };

  const pageClass =
    "min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900";
  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur overflow-hidden";

  if (loading) {
    return (
      <div className={pageClass}>
        <div className="mx-auto max-w-3xl py-16 text-center text-slate-500">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className={pageClass}>
        <div className="mx-auto max-w-3xl py-16 text-center text-slate-500">
          {t("screens.payments.notFound")}
        </div>
      </div>
    );
  }

  const isIncome = payment.type === "income";
  const rateDiffers = payment.exchange_rate !== payment.effective_rate;
  const fundCurrency = {
    code: payment.fund_currency_code,
    symbol: payment.fund_currency_symbol,
  };

  return (
    <div className={pageClass}>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <BackButton />

          <div className="flex gap-2">
            <button
              onClick={handleSavePdf}
              disabled={isSavingPdf}
              className="inline-flex items-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-[#eef3ff] hover:text-[#4663ff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={16} />
              {isSavingPdf ? t("common.saving") : t("common.savePdf")}
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="inline-flex items-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-[#eef3ff] hover:text-[#4663ff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Printer size={16} />
              {isPrinting ? t("common.saving") : t("common.print")}
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-red-100 bg-white px-4 py-2.5 text-sm font-bold text-red-500 transition hover:bg-red-50"
            >
              <Trash2 size={16} />
              {t("common.delete")}
            </button>
          </div>
        </div>

        <section className={panelClass}>
          <div className="flex items-start justify-between p-7">
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-[#4663ff]">
                {t("ui.payment")}
              </p>
              <h1 className="text-3xl font-black text-slate-950">
                #{payment.id}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {new Date(payment.date).toLocaleString()}
              </p>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black ${
                isIncome
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {isIncome ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {isIncome
                ? t("screens.payments.income")
                : t("screens.payments.expense")}
            </span>
          </div>

          {/* NUMBERS — amount is the focal point, larger and first */}
          <div className="border-t border-[#e5ebff] bg-[#f8faff] p-7">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white p-5">
                <p className="text-xs font-bold uppercase text-slate-400">
                  {t("ui.amount")}
                </p>
                <p
                  className={`mt-1 text-2xl font-black tabular-nums ${
                    isIncome ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {formatMoney(payment.amount, primaryCurrency)}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-5">
                <p className="text-xs font-bold uppercase text-slate-400">
                  {t("screens.payments.collectedAmount")}
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-700">
                  {formatMoney(payment.amount_fund_currency, fundCurrency)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  {t("screens.payments.party")}
                </p>
                <p className="mt-1 font-bold text-slate-900">
                  {payment.party_id ? (
                    <GoTo
                      type={payment.party_type}
                      id={payment.party_id}
                      variant="light"
                    >
                      {payment.party_name || t("ui.other")}
                    </GoTo>
                  ) : (
                    payment.party_name || t("ui.other")
                  )}
                  <span className="ms-2 font-normal text-slate-400">
                    ({t(`ui.${payment.party_type}`)})
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  {t("ui.fund")}
                </p>
                <p className="mt-1 font-bold text-slate-900">
                  <GoTo type="fund" id={payment.fund_id} variant="light">
                    {payment.fund_name}
                  </GoTo>{" "}
                  <span className="font-normal text-slate-400">
                    ({payment.fund_currency_code})
                  </span>
                </p>
              </div>
            </div>

            {rateDiffers && (
              <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    {t("screens.funds.exchangeRate")}
                  </p>
                  <p className="mt-1 font-bold tabular-nums text-slate-700">
                    {payment.exchange_rate}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    {t("screens.funds.effectiveRate")}
                  </p>
                  <p className="mt-1 font-bold tabular-nums text-slate-700">
                    {payment.effective_rate}
                  </p>
                </div>
              </div>
            )}
          </div>

          {payment.note && (
            <div className="border-t border-[#e5ebff] p-7 text-sm">
              <p className="text-xs font-bold uppercase text-slate-400">
                {t("ui.note")}
              </p>
              <p className="mt-1 text-slate-700">{payment.note}</p>
            </div>
          )}

          {payment.allocations.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between bg-white px-5 py-4 text-sm"
            >
              <div className="flex items-center gap-2">
                <GoTo type={a.invoice_type} id={a.invoice_id} variant="light">
                  {t(`screens.invoices.invoiceType.${a.invoice_type}`, {
                    defaultValue: a.invoice_type,
                  })}{" "}
                  #{a.invoice_id}
                </GoTo>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    a.settlement_status === "full"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {a.settlement_status === "full"
                    ? t("screens.payments.fullyPaid") || "Fully paid"
                    : t("screens.payments.partiallyPaid") || "Partially paid"}
                </span>
              </div>
              <span className="font-black tabular-nums text-slate-900">
                {formatMoney(a.amount, fundCurrency)}
              </span>
            </div>
          ))}
        </section>
      </div>

      <DeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t("deleteModal.paymentTitle")}
        message={t("deleteModal.paymentMessage")}
      />

      <ToastContainer />
    </div>
  );
};

export default PaymentDocumentPage;
