import React from "react";
import { Wallet2, Clock, MessageSquareText } from "lucide-react";
import usePrimaryCurrency from "./usePrimaryCurrency";
import { useTranslation } from "react-i18next";

const splitDateTime = (value) => {
  if (!value) return { dateLabel: "-", fullLabel: "" };
  const [datePart, timePart] = String(value).split(/[ T]/);
  return {
    dateLabel: datePart || "-",
    fullLabel: timePart ? `${datePart} ${timePart.slice(0, 8)}` : datePart,
  };
};

const HoverDate = ({ dateLabel, fullLabel }) => (
  <span className="group relative inline-flex cursor-help items-center gap-1.5">
    {dateLabel}
    <Clock size={12} className="text-slate-300 group-hover:text-[#4663ff]" />
    <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
      {fullLabel}
    </span>
  </span>
);

export default function PaymentHistoryList({ payments = [] }) {
  const { t } = useTranslation();
  const { money } = usePrimaryCurrency();

  if (!payments.length) return null;

  return (
    <section className="overflow-hidden rounded-[28px] bg-white shadow">
      <div className="flex items-center gap-3 border-b p-5">
        <Wallet2 className="text-[#4663ff]" size={18} />
        <h2 className="text-lg font-black">
          {t("ui.paymentHistory") || "Payment History"}
        </h2>
        <span className="rounded-full bg-[#eef3ff] px-2 py-0.5 text-xs font-bold text-[#4663ff]">
          {payments.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-[#f8faff] text-xs font-bold uppercase  text-slate-500">
            <tr>
              <th className="p-4 text-left">{t("ui.date")}</th>
              <th className="p-4 text-left">{t("ui.fund")}</th>
              <th className="p-4 text-right">{t("ui.amount")}</th>
              <th className="p-4 text-right">
                {t("ui.fundCurrency") || "Fund Currency"}
              </th>
              <th className="p-4 text-right">
                {t("ui.exchangeRate") || "Rate"}
              </th>
              <th className="p-4 text-center"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#e5ebff]">
            {payments.map((p) => {
              const { dateLabel, fullLabel } = splitDateTime(p.createdAt);
              const rateDiffers =
                Number(p.exchange_rate) !== Number(p.effective_rate);

              return (
                <tr key={p.id} className="hover:bg-[#f8faff]">
                  <td className="p-4 text-slate-500">
                    <HoverDate dateLabel={dateLabel} fullLabel={fullLabel} />
                  </td>

                  <td className="p-4 font-bold text-slate-700">
                    {p.fund_name || "-"}
                  </td>

                  <td className="p-4 text-right font-black text-emerald-700">
                    {money(p.amount)}
                  </td>

                  <td className="p-4 text-right text-slate-500">
                    {p.amount_fund_currency ? (
                      <span>
                        {p.currency_code || ""}{" "}
                        {Number(p.amount_fund_currency).toLocaleString()}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>

                  <td className="p-4 text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-semibold text-slate-600">
                        {Number(p.exchange_rate).toFixed(4)}
                      </span>
                      {rateDiffers && (
                        <span className="text-[11px] text-amber-600">
                          {t("ui.effective") || "eff."}{" "}
                          {Number(p.effective_rate).toFixed(4)}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-4 text-center">
                    {p.note && (
                      <span className="group relative inline-flex cursor-help items-center">
                        <MessageSquareText
                          size={14}
                          className="text-slate-400 hover:text-[#4663ff]"
                        />
                        <span className="pointer-events-none absolute bottom-full right-0 z-[9999] mb-2 w-72 max-w-[90vw] whitespace-normal rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium leading-relaxed text-white opacity-0 shadow-2xl transition-opacity group-hover:opacity-100">
                          {p.note}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
