import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";

// Mirror of PrintSalesByProduct.jsx, scoped to the customer breakdown
// instead. Kept as a separate component rather than one parameterized
// component, since the columns genuinely differ (no cost/margin here) —
// forcing them into one generic table would mean conditional columns
// everywhere, same reasoning PrintSalesInvoice already uses for its
// hasAnyTax/hasAnyDiscount conditional columns, just at the component level
// instead of the column level.
export default function PrintSalesByCustomer() {
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
        customerLimit: showAll ? null : 20,
      }),
      window.api.getCompanySetting(),
    ]).then(([reportRes, companyRes]) => {
      if (!cancelled) {
        setRows(reportRes?.success === false ? [] : reportRes.byCustomer);
        setCompany(companyRes?.settings || null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, showAll]);

  if (!rows) return null;

  const totalInvoices = rows.reduce(
    (sum, r) => sum + Number(r.invoiceCount || 0),
    0
  );
  const totalPurchased = rows.reduce(
    (sum, r) => sum + Number(r.totalPurchased || 0),
    0
  );

  return (
    <div
      className="w-[210mm] min-h-[297mm] mx-auto bg-white p-8 text-xs text-[#33363D]"
      dir={i18n.dir()}
    >
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
              {t("DOCS.SALES_BY_CUSTOMER_REPORT")}
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

      <div className="rounded border border-[#E5E5E2] p-4 mb-4">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#33363D]">
              <th className="p-2 text-start font-medium">
                {t("DOCS.CUSTOMER")}
              </th>
              <th className="p-2 text-start font-medium">
                {t("DOCS.INVOICES")}
              </th>
              <th className="p-2 text-start font-medium">
                {t("DOCS.TOTAL_PURCHASED")}
              </th>
              <th className="p-2 text-start font-medium">
                {t("DOCS.AVG_ORDER_VALUE")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.customer_id ?? row.name}
                className="border-b border-[#E5E5E2]"
              >
                <td className="p-2">{row.name}</td>
                <td className="p-2 font-mono tabular-nums">
                  {row.invoiceCount}
                </td>
                <td className="p-2 font-mono tabular-nums font-medium">
                  {money(row.totalPurchased)}
                </td>
                <td className="p-2 font-mono tabular-nums">
                  {money(row.averageOrderValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg bg-[#33363D] px-4 py-3.5 flex justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#C9C8C2]">
            {t("DOCS.INVOICES")}
          </p>
          <p className="font-mono tabular-nums text-base font-semibold text-white">
            {totalInvoices}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#C9C8C2]">
            {t("DOCS.TOTAL_PURCHASED")}
          </p>
          <p className="font-mono tabular-nums text-base font-semibold text-white">
            {money(totalPurchased)}
          </p>
        </div>
      </div>
    </div>
  );
}
