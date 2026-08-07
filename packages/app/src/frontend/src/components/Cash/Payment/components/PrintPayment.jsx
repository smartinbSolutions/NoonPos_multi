import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { formatMoney } from "../../../../Global/FormatNumber";
import { amountToWords } from "../../../../Global/numberToWords";

export default function PrintPayment() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { primaryCurrency } = usePrimaryCurrency();

  const [payment, setPayment] = useState(null);
  const [company, setCompany] = useState(null);
  const [primaryCurrencyRecord, setPrimaryCurrencyRecord] = useState(null);
  const [fundCurrencyRecord, setFundCurrencyRecord] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.api.getPayment(id),
      window.api.getCompanySetting(),
    ]).then(([paymentData, companyRes]) => {
      if (!cancelled) {
        setPayment(paymentData);
        setCompany(companyRes?.settings || null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!payment) return;
    let cancelled = false;
    window.api.getCurrencies().then((list) => {
      if (cancelled) return;
      const rows = list || [];
      setPrimaryCurrencyRecord(
        rows.find((c) => c.code === primaryCurrency?.code) ||
          rows.find((c) => c.isPrimary) ||
          null
      );
      setFundCurrencyRecord(
        rows.find((c) => c.code === payment.fund_currency_code) || null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [payment, primaryCurrency?.code]);

  if (!payment) return null;

  const isIncome = payment.type === "income";
  const rateDiffers = payment.exchange_rate !== payment.effective_rate;
  const allocations = payment.allocations || [];
  const showFundAmount =
    payment.fund_currency_code &&
    payment.amount_fund_currency !== payment.amount;

  const invoiceTypeLabel = (type) => {
    const key = `DOCS.INVOICE_TYPE_${String(type || "").toUpperCase()}`;
    const translated = t(key);
    return translated === key ? type : translated;
  };

  return (
    <div
      className="w-[210mm] min-h-[297mm] mx-auto bg-white p-8 text-xs text-[#33363D]"
      dir={i18n.dir()}
    >
      {/* Header */}
      <div className="rounded border border-[#E5E5E2] p-4 mb-4">
        <div className="flex justify-between">
          <div className="w-1/2">
            {company?.logo && (
              <img
                src={company.logo}
                alt="Logo"
                className="max-h-20 w-auto object-contain mb-2"
              />
            )}
            <h2 className="text-base font-semibold">{company?.company_name}</h2>
            <p className="text-[#6B6F76]">{company?.address}</p>
            <p className="text-[#6B6F76]">
              {t("DOCS.PHONE")}: {company?.phone}
            </p>
            <p className="text-[#6B6F76]">
              {t("DOCS.EMAIL")}: {company?.email}
            </p>
          </div>
          <div className="w-2/5 text-start">
            <h3 className="text-[11px] uppercase tracking-wide text-[#6B6F76] mb-1">
              {isIncome ? t("DOCS.RECEIPT_VOUCHER") : t("DOCS.PAYMENT_VOUCHER")}
            </h3>
            <p className="font-mono tabular-nums text-base font-semibold mb-2">
              #{payment.id}
            </p>
            <div
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-2"
              style={{ borderTop: "1px dashed #C9C8C2" }}
            >
              <p className="text-[10px] uppercase text-[#6B6F76] whitespace-nowrap">
                {t("DOCS.INVOICE_DATE")} :
              </p>
              <p className="font-mono tabular-nums text-[13px]">
                {payment.date}
              </p>
            </div>
          </div>
        </div>
        <div
          className={`h-[1px] mt-4 ${isIncome ? "bg-emerald-500" : "bg-[#9C7B45]"}`}
        />
      </div>

      {/* Party Info */}
      <div className="rounded border border-[#E5E5E2] p-4 mb-4">
        <div className="flex justify-between gap-6">
          <div className="w-1/2">
            <h4 className="text-[11px] uppercase text-[#6B6F76] mb-2">
              {isIncome ? t("DOCS.RECEIVED_FROM") : t("DOCS.PAID_TO")}
            </h4>
            <p className="font-medium">{payment.party_name || t("ui.other")}</p>
          </div>
          <div className="w-[1px] bg-[#E5E5E2]" />
          <div className="w-1/2">
            <h4 className="text-[11px] uppercase text-[#6B6F76] mb-2">
              {t("DOCS.FUND")}
            </h4>
            <p className="font-medium">
              {payment.fund_name}{" "}
              <span className="text-[#6B6F76]">
                ({payment.fund_currency_code})
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Amount block */}
      <div className="rounded border border-[#E5E5E2] p-6 mb-4">
        <div className="flex justify-between items-baseline pb-3 border-b-2 border-[#33363D]">
          <span className="text-[11px] uppercase tracking-wide text-[#6B6F76]">
            {t("DOCS.AMOUNT")}
          </span>
          <span className="font-mono tabular-nums text-2xl font-semibold">
            {formatMoney(payment.amount, primaryCurrency)}
          </span>
        </div>
        {primaryCurrencyRecord && (
          <div className="mt-2 text-[11px] italic text-[#6B6F76]">
            {amountToWords(
              payment.amount,
              i18n.language,
              primaryCurrencyRecord,
              company?.language
            )}
          </div>
        )}

        <div className="mt-3 space-y-1.5">
          {showFundAmount && (
            <div className="flex justify-between text-[11px] text-[#6B6F76]">
              <span>{t("DOCS.COLLECTED_AMOUNT")}</span>
              <span className="font-mono tabular-nums">
                {formatMoney(
                  payment.amount_fund_currency,
                  payment.fund_currency_code,
                  payment.fund_currency_symbol
                )}
              </span>
            </div>
          )}
          {showFundAmount && fundCurrencyRecord && (
            <div className="text-[10px] italic text-[#8A8E96]">
              {amountToWords(
                payment.amount_fund_currency,
                i18n.language,
                fundCurrencyRecord,
                company?.language
              )}
            </div>
          )}
          {rateDiffers && (
            <div className="flex justify-between text-[11px] text-[#6B6F76]">
              <span>{t("DOCS.EXCHANGE_RATE")}</span>
              <span className="font-mono tabular-nums">
                {payment.effective_rate}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Allocations (which invoices this payment covers) */}
      {allocations.length > 0 && (
        <div className="rounded border border-[#E5E5E2] p-4 mb-4">
          <h4 className="text-[11px] uppercase text-[#6B6F76] mb-2">
            {t("DOCS.FOR_INVOICE")}
          </h4>
          <div className="space-y-1">
            {allocations.map((a) => (
              <div
                key={a.id}
                className="flex justify-between text-[11px] text-[#33363D]"
              >
                <span>
                  {invoiceTypeLabel(a.invoice_type)} #{a.invoice_id}
                </span>
                <span className="font-mono tabular-nums">
                  {formatMoney(
                    a.amount,
                    payment.fund_currency_code,
                    payment.fund_currency_symbol
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {payment.note && (
        <div className="rounded border border-[#E5E5E2] p-4">
          <span className="text-[#6B6F76]">{t("DOCS.NOTES")} :</span>
          <p className="text-[#6B6F76] whitespace-pre-wrap mt-1">
            {payment.note}
          </p>
        </div>
      )}
    </div>
  );
}
