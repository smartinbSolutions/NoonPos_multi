// PrintSalesQuotation.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";

export default function PrintSalesQuotation() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { money } = usePrimaryCurrency();

  const [quotation, setQuotation] = useState(null);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.api.getSalesQuotationById(id),
      window.api.getCompanySetting(),
    ]).then(([quotationData, companyRes]) => {
      if (!cancelled) {
        setQuotation(quotationData);
        setCompany(companyRes?.settings || null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!quotation) return null;

  const items = quotation.items || [];
  const hasAnyTax =
    items.some((i) => Number(i.tax_rate) > 0) || Number(quotation.taxValue) > 0;
  const hasAnyDiscount =
    items.some((i) => Number(i.discount) > 0) || Number(quotation.discount) > 0;

  const itemDiscountTotal = items.reduce(
    (sum, item) => sum + Number(item.discount || 0),
    0
  );
  const hasAnyCode = items.some((i) => i.product_code);
  // Group item-level tax by tax_id, same treatment as quotation.taxes[]
  const itemTaxGroups = Object.values(
    items.reduce((groups, item) => {
      if (!item.tax_id || Number(item.taxValue || 0) <= 0) return groups;
      const key = item.tax_id;
      if (!groups[key]) {
        groups[key] = {
          tax_id: item.tax_id,
          tax_name: item.tax_name,
          tax_rate: item.tax_rate,
          tax_value: 0,
        };
      }
      groups[key].tax_value += Number(item.taxValue || 0);
      return groups;
    }, {})
  );

  const itemTaxTotal = itemTaxGroups.reduce((sum, g) => sum + g.tax_value, 0);
  const hasDeductions = itemDiscountTotal > 0 || Number(quotation.discount) > 0;

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
              {t("DOCS.QUOTATION_NO")}
              <span className="ms-2 bg-[#33363D] text-white text-[9px] px-1.5 py-0.5 rounded">
                {t(`DOCS.QUOTATION_STATUS_${quotation.status?.toUpperCase()}`)}
              </span>
            </h3>
            <p className="font-mono tabular-nums text-base font-semibold mb-2">
              {quotation.quotation_name}
            </p>
            <div
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-2"
              style={{ borderTop: "1px dashed #C9C8C2" }}
            >
              <p className="text-[10px] uppercase text-[#6B6F76] whitespace-nowrap">
                {t("DOCS.QUOTATION_DATE")} :
              </p>
              <p className="font-mono tabular-nums text-[13px]">
                {quotation.date}
              </p>
            </div>
          </div>
        </div>
        <div className="h-[1px] bg-[#9C7B45] mt-4" />
      </div>

      {/* Party Info */}
      <div className="rounded border border-[#E5E5E2] p-4 mb-4">
        <div className="flex justify-between gap-6">
          <div className="w-1/2">
            <h4 className="text-[11px] uppercase text-[#6B6F76] mb-2">
              {t("DOCS.ISSUED_TO")}
            </h4>
            <p className="font-medium">
              {quotation.customer_name || t("DOCS.NO_CUSTOMER")}
            </p>
            <p className="text-[#6B6F76]">{quotation.customer_phone}</p>
          </div>
          <div className="w-[1px] bg-[#E5E5E2]" />
          <div className="w-1/2">
            <h4 className="text-[11px] uppercase text-[#6B6F76] mb-2">
              {t("DOCS.ISSUED_BY")}
            </h4>
            <p className="font-medium">{quotation.created_by_name}</p>
          </div>
        </div>
      </div>

      {/* Product Table */}
      <div className="rounded border border-[#E5E5E2] p-4 mb-4">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#33363D]">
              {hasAnyCode && (
                <th className="p-2 text-start font-medium">{t("DOCS.CODE")}</th>
              )}
              <th className="p-2 text-start font-medium">
                {t("DOCS.PRODUCT")}
              </th>
              <th className="p-2 text-start font-medium">
                {t("DOCS.QUANTITY")}
              </th>
              <th className="p-2 text-start font-medium">
                {t("DOCS.UNIT_PRICE")}
              </th>
              {hasAnyDiscount && (
                <th className="p-2 text-start font-medium">
                  {t("DOCS.DISCOUNT")}
                </th>
              )}
              {hasAnyTax && (
                <th className="p-2 text-start font-medium">{t("DOCS.TAX")}</th>
              )}
              <th className="p-2 text-start font-medium">{t("DOCS.TOTAL")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const afterDiscount =
                Number(item.total || 0) - Number(item.discount || 0);
              const lineTotal =
                afterDiscount + Number(item.tax_value ?? item.taxValue ?? 0);

              return (
                <tr key={item.id} className="border-b border-[#E5E5E2]">
                  {hasAnyCode && (
                    <td className="p-2 font-mono tabular-nums text-[#6B6F76]">
                      {item.product_code || "—"}
                    </td>
                  )}
                  <td className="p-2">
                    {item.product_name || item.name}
                    {item.description && (
                      <div className="text-[10px] text-[#6B6F76] whitespace-pre-wrap mt-0.5">
                        {item.description}
                      </div>
                    )}
                  </td>
                  <td className="p-2 font-mono tabular-nums">
                    {item.quantity} {item.unit_name}
                  </td>
                  <td className="p-2 font-mono tabular-nums">
                    {money(item.price)}
                  </td>
                  {hasAnyDiscount && (
                    <td className="p-2 font-mono tabular-nums text-[#9B3B3B]">
                      {Number(item.discount || 0) > 0 ? (
                        <>
                          {item.discount_rate
                            ? `[${item.discount_rate}%] `
                            : ""}
                          {money(item.discount)}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {hasAnyTax && (
                    <td className="p-2 font-mono tabular-nums">
                      {Number(item.taxValue || 0) > 0 ? (
                        <>
                          {item.tax_rate}% ({money(item.taxValue)})
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  <td className="p-2 font-mono tabular-nums font-medium">
                    {money(lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="rounded border border-[#E5E5E2] p-6 flex justify-between gap-8">
        <div className="w-1/2 pe-3">
          {quotation.description && (
            <>
              <span className="text-[#6B6F76]">{t("DOCS.NOTES")} :</span>
              <p className="text-[#6B6F76] whitespace-pre-wrap">
                {quotation.description}
              </p>
            </>
          )}
        </div>

        <div className="w-1/2 max-w-[300px] ms-auto">
          {/* Subtotal — the anchor figure everything else adjusts from */}
          <div className="flex justify-between items-baseline pb-3 border-b-2 border-[#33363D]">
            <span className="text-[11px] uppercase tracking-wide text-[#6B6F76]">
              {t("DOCS.TOTAL")}
            </span>
            <span className="font-mono tabular-nums text-base font-semibold">
              {money(quotation.subtotal)}
            </span>
          </div>

          {/* Deductions — discounts, tinted red-ish, always subtracting */}
          {hasDeductions && (
            <div className="mt-2 rounded bg-[#FBF2F2] px-3 py-2 space-y-1.5">
              {itemDiscountTotal > 0 && (
                <div className="flex justify-between text-[11px] text-[#9B3B3B]">
                  <span>{t("DOCS.ITEM_DISCOUNT")}</span>
                  <span className="font-mono tabular-nums">
                    −{money(itemDiscountTotal)}
                  </span>
                </div>
              )}
              {quotation.discount > 0 && (
                <div className="flex justify-between text-[11px] text-[#9B3B3B]">
                  <span>
                    {t("DOCS.DISCOUNT")}
                    {quotation.discount_rate
                      ? ` [${quotation.discount_rate}%]`
                      : ""}
                  </span>
                  <span className="font-mono tabular-nums">
                    −{money(quotation.discount)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Additions — taxes, tinted gold-ish, always adding */}
          {hasAnyTax && (
            <div className="mt-2 rounded bg-[#FBF7EF] px-3 py-2 space-y-1.5">
              {itemTaxGroups.map((g) => (
                <div
                  key={`item-tax-${g.tax_id}`}
                  className="flex justify-between gap-2 text-[11px] text-[#8A6A32]"
                >
                  <span className="flex-1 min-w-0 break-words">
                    {g.tax_name} {g.tax_rate}%
                  </span>
                  <span className="font-mono tabular-nums shrink-0 whitespace-nowrap">
                    +{money(g.tax_value)}
                  </span>
                </div>
              ))}
              {(quotation.taxes || []).map((tax) => (
                <div
                  key={`quotation-tax-${tax.id}`}
                  className="flex justify-between gap-2 text-[11px] text-[#8A6A32]"
                >
                  <span className="flex-1 min-w-0 break-words">
                    {tax.tax_name} {tax.tax_rate}%
                  </span>
                  <span className="font-mono tabular-nums shrink-0 whitespace-nowrap">
                    +{money(tax.tax_value)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-[11px] font-medium text-[#8A6A32] pt-1.5 border-t border-[#EADFC5]">
                <span>{t("DOCS.TOTAL_TAX")}</span>
                <span className="font-mono tabular-nums">
                  +{money(itemTaxTotal + Number(quotation.taxValue || 0))}
                </span>
              </div>
            </div>
          )}

          {/* Grand total — the answer to the whole page */}
          <div className="mt-4 rounded-lg bg-[#33363D] px-4 py-3.5 flex justify-between items-baseline">
            <span className="text-[11px] uppercase tracking-wide text-[#C9C8C2]">
              {t("DOCS.TOTAL_WITH_TAX")}
            </span>
            <span className="font-mono tabular-nums text-2xl font-semibold text-white">
              {money(quotation.net_total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
