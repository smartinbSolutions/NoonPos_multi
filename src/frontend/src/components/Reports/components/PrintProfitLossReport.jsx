import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";

// Print route for the P&L report — mirrors PrintSalesInvoice.jsx's layout
// language exactly (same color tokens, same card/border structure) so the
// two documents feel like they came from the same system, even though one
// is a report and the other is an invoice.
//
// Per your call: PRINT-ONLY shows current-period numbers — no previous-period
// comparison, no trend chart. Route receives startDate/endDate as query
// params (not a route param like PrintSalesInvoice's :id) since a report
// isn't identified by a single record id.
export default function PrintProfitLossReport() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const { money } = usePrimaryCurrency();

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const [report, setReport] = useState(null);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.api.getProfitLossReport({ startDate, endDate }),
      window.api.getCompanySetting(),
    ]).then(([reportRes, companyRes]) => {
      if (!cancelled) {
        setReport(reportRes?.success === false ? null : reportRes);
        setCompany(companyRes?.settings || null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  if (!report) return null;

  const { current, expenseBreakdown, range } = report;
  const hasExpenseBreakdown = (expenseBreakdown || []).length > 0;
  const hasReturns = Number(current.sales.returns) > 0;

  return (
    <div
      className="w-[210mm] min-h-[297mm] mx-auto bg-white p-8 text-xs text-[#33363D]"
      dir={i18n.dir()}
    >
      {/* Header — identical structure to PrintSalesInvoice's header card:
          logo+company on the left, document identity on the right, gold
          divider underneath. "Invoice no." slot is replaced by the date
          range, since a report has a period instead of a number. */}
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
              {t("DOCS.PROFIT_LOSS_REPORT")}
            </h3>
            <p className="font-mono tabular-nums text-base font-semibold mb-2">
              {range.startDate} → {range.endDate}
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

      {/* Expense breakdown table — same table structure/borders as
          PrintSalesInvoice's product table. Only rendered when there's
          data, same as that document's conditional discount/tax columns. */}
      {hasExpenseBreakdown && (
        <div className="rounded border border-[#E5E5E2] p-4 mb-4">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#33363D]">
                <th className="p-2 text-start font-medium">
                  {t("DOCS.EXPENSE_CATEGORY")}
                </th>
                <th className="p-2 text-start font-medium">
                  {t("DOCS.ITEM_COUNT")}
                </th>
                <th className="p-2 text-start font-medium">
                  {t("DOCS.AMOUNT")}
                </th>
              </tr>
            </thead>
            <tbody>
              {expenseBreakdown.map((cat) => (
                <tr
                  key={cat.category_id ?? cat.name}
                  className="border-b border-[#E5E5E2]"
                >
                  <td className="p-2">{cat.name}</td>
                  <td className="p-2 font-mono tabular-nums">
                    {cat.items_count}
                  </td>
                  <td className="p-2 font-mono tabular-nums font-medium">
                    {money(cat.total_spent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals — mirrors PrintSalesInvoice's totals block exactly:
          subtotal row -> tinted deduction sections -> grand total dark box.
          Revenue plays the role "subtotal" played on the invoice; COGS and
          Expenses both use the red deduction tint (they're both things
          subtracted from revenue); Net profit is the dark grand-total box. */}
      <div className="rounded border border-[#E5E5E2] p-6">
        <div className="w-full max-w-[400px] ms-auto">
          {/* Revenue — the anchor figure, same role as invoice subtotal */}
          <div className="flex justify-between items-baseline pb-3 border-b-2 border-[#33363D]">
            <span className="text-[11px] uppercase tracking-wide text-[#6B6F76]">
              {t("DOCS.REVENUE")}
            </span>
            <span className="font-mono tabular-nums text-base font-semibold">
              {money(current.sales.total)}
            </span>
          </div>

          {hasReturns && (
            <div className="mt-2 rounded bg-[#FBF2F2] px-3 py-2 space-y-1.5">
              <div className="flex justify-between text-[11px] text-[#9B3B3B]">
                <span>
                  {t("DOCS.SALES_RETURNS")}
                  <span className="text-[#B98080]">
                    {" "}
                    ({current.sales.returnCount})
                  </span>
                </span>
                <span className="font-mono tabular-nums">
                  −{money(current.sales.returns)}
                </span>
              </div>
            </div>
          )}

          {/* Cost of goods sold — deduction tint, same as invoice discounts */}
          <div className="mt-2 rounded bg-[#FBF2F2] px-3 py-2 space-y-1.5">
            <div className="flex justify-between text-[11px] text-[#9B3B3B]">
              <span>{t("DOCS.COST_OF_GOODS_SOLD")}</span>
              <span className="font-mono tabular-nums">
                −{money(current.profitLoss.cogs)}
              </span>
            </div>
          </div>

          {/* Gross profit — subtotal-style row, same weight as invoice's
              running totals between sections */}
          <div className="flex justify-between text-[11px] font-medium pt-3 mt-2 border-t border-dashed border-[#C9C8C2]">
            <span className="uppercase tracking-wide text-[#6B6F76]">
              {t("DOCS.GROSS_PROFIT")}
            </span>
            <span className="font-mono tabular-nums text-sm font-semibold">
              {money(current.profitLoss.grossProfit)}
            </span>
          </div>

          {/* Expenses — deduction tint again */}
          <div className="mt-2 rounded bg-[#FBF2F2] px-3 py-2 space-y-1.5">
            <div className="flex justify-between text-[11px] text-[#9B3B3B]">
              <span>{t("DOCS.EXPENSES")}</span>
              <span className="font-mono tabular-nums">
                −{money(current.expense.total)}
              </span>
            </div>
          </div>

          {/* Net profit — grand total dark box, identical treatment to the
              invoice's "total with tax" box */}
          <div className="mt-4 rounded-lg bg-[#33363D] px-4 py-3.5 flex justify-between items-baseline">
            <span className="text-[11px] uppercase tracking-wide text-[#C9C8C2]">
              {t("DOCS.NET_PROFIT")}
            </span>
            <span className="font-mono tabular-nums text-2xl font-semibold text-white">
              {money(current.profitLoss.netProfit)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
