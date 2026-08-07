import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";

export default function PrintSalesByProduct() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const { money } = usePrimaryCurrency();

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const showAll = searchParams.get("showAll") === "true";

  const [rows, setRows] = useState(null);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.api.getSalesReport({
        startDate,
        endDate,
        productLimit: showAll ? null : 20,
      }),
      window.api.getCompanySetting(),
    ]).then(([reportRes, companyRes]) => {
      if (!cancelled) {
        setRows(reportRes?.success === false ? [] : reportRes.byProduct);
        setCompany(companyRes?.settings || null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, showAll]);

  if (!rows) return null;

  // Running column totals — a printed table with no footer sum forces the
  // reader to add 20+ rows by hand, so we compute it here same as the
  // invoice document sums its line items into a grand total.
  const totalQuantity = rows.reduce(
    (sum, r) => sum + Number(r.quantity || 0),
    0
  );
  const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue || 0), 0);
  const totalCost = rows.reduce((sum, r) => sum + Number(r.cost || 0), 0);
  const totalMargin = totalRevenue - totalCost;

  return (
    <div
      className="w-[210mm] min-h-[297mm] mx-auto bg-white p-8 text-xs text-[#33363D]"
      dir={i18n.dir()}
    >
      {/* Header — identical structure to PrintProfitLossReport's header */}
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
              {t("DOCS.SALES_BY_PRODUCT_REPORT")}
            </h3>
            <p className="font-mono tabular-nums text-base font-semibold mb-2">
              {startDate} → {endDate}
            </p>
            <div
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-2"
              style={{ borderTop: "1px dashed #C9C8C2" }}
            >
              <p className="text-[10px] uppercase text-[#6B6F76] whitespace-nowrap">
                {t("DOCS.GENERATED_ON")} :
              </p>
              <p className="font-mono tabular-nums text-[13px]">
                {new Date().toISOString().slice(0, 10)}
              </p>
            </div>
          </div>
        </div>
        <div className="h-[1px] bg-[#9C7B45] mt-4" />
      </div>

      {/* Product breakdown table — same table chrome as PrintSalesInvoice's
          product table (border-b-[#33363D] header rule, row dividers) */}
      <div className="rounded border border-[#E5E5E2] p-4 mb-4">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#33363D]">
              <th className="p-2 text-start font-medium">
                {t("DOCS.PRODUCT")}
              </th>
              <th className="p-2 text-start font-medium">
                {t("DOCS.QUANTITY")}
              </th>
              <th className="p-2 text-start font-medium">
                {t("DOCS.REVENUE")}
              </th>
              <th className="p-2 text-start font-medium">{t("DOCS.COST")}</th>
              <th className="p-2 text-start font-medium">{t("DOCS.MARGIN")}</th>
              <th className="p-2 text-start font-medium">
                {t("DOCS.MARGIN_PERCENT")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.product_id} className="border-b border-[#E5E5E2]">
                <td className="p-2">{row.name}</td>
                <td className="p-2 font-mono tabular-nums">{row.quantity}</td>
                <td className="p-2 font-mono tabular-nums">
                  {money(row.revenue)}
                </td>
                <td className="p-2 font-mono tabular-nums text-[#9B3B3B]">
                  {money(row.cost)}
                </td>
                <td className="p-2 font-mono tabular-nums font-medium">
                  {money(row.margin)}
                </td>
                <td className="p-2 font-mono tabular-nums">
                  {row.marginPercent.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Column totals — same dark grand-total box treatment as the invoice
          and P&L documents, just holding four figures instead of one since
          there's no single headline number for a breakdown table. */}
      <div className="rounded-lg bg-[#33363D] px-4 py-3.5 flex justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#C9C8C2]">
            {t("DOCS.QUANTITY")}
          </p>
          <p className="font-mono tabular-nums text-base font-semibold text-white">
            {totalQuantity}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#C9C8C2]">
            {t("DOCS.REVENUE")}
          </p>
          <p className="font-mono tabular-nums text-base font-semibold text-white">
            {money(totalRevenue)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#C9C8C2]">
            {t("DOCS.COST")}
          </p>
          <p className="font-mono tabular-nums text-base font-semibold text-white">
            {money(totalCost)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#C9C8C2]">
            {t("DOCS.MARGIN")}
          </p>
          <p className="font-mono tabular-nums text-base font-semibold text-white">
            {money(totalMargin)}
          </p>
        </div>
      </div>
    </div>
  );
}
