import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast, ToastContainer } from "react-toastify";
import {
  ArrowRight,
  Printer,
  Trash2,
  CloudSync,
  CalendarDays,
} from "lucide-react";

import { formatMoney } from "../../../../Global/FormatNumber";
import DeleteModal from "../../../../Global/DeleteModel";
import GoTo from "../../../../Global/GoTo";
import BackButton from "../../../../Global/BackButton";

const FundTransferDocumentPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";

  const [transfer, setTransfer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const api = window.api;

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getFundTransfer(id).then((data) => {
      if (active) {
        setTransfer(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [id]);

  const handleDelete = async () => {
    const res = await api.deleteFundTransfer(id);
    if (res.success) {
      toast.success(t("screens.funds.transferDeleted"));
      navigate(-1);
    } else {
      toast.error(res.message || t("screens.funds.transferDeleteFailed"));
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

  if (!transfer) {
    return (
      <div className={pageClass}>
        <div className="mx-auto max-w-3xl py-16 text-center text-slate-500">
          {t("screens.funds.transferNotFound")}
        </div>
      </div>
    );
  }

  const sameRate = transfer.exchange_rate === transfer.effective_rate;

  return (
    <div className={pageClass}>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <BackButton />

          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
            >
              <Printer size={16} />
              {t("common.print")}
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
          <div className="p-7">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-[#4663ff]">
              <CloudSync size={14} />
              {t("screens.funds.fund_transfer")}
            </p>
            <h1 className="text-3xl font-black text-slate-950">
              #{transfer.id}
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
              <CalendarDays size={14} />
              {new Date(transfer.date).toLocaleString()}
            </p>
          </div>

          {/* FLOW — numbers-first, both funds clickable */}
          <div className="flex items-center gap-4 border-t border-[#e5ebff] bg-[#f8faff] p-7">
            <div className="flex-1 rounded-2xl border border-red-100 bg-white p-6 text-center">
              <p className="text-xs font-bold uppercase text-red-500">
                {t("screens.funds.from")}
              </p>
              <GoTo type="fund" id={transfer.from_fund_id}>
                <p className=" font-black text-slate-900">
                  {transfer.from_fund_name}
                </p>
              </GoTo>
              <p className=" text-2xl font-black tabular-nums text-red-600">
                {formatMoney(transfer.deduct_amount, {
                  code: transfer.from_fund_currency_code,
                  symbol: transfer.from_fund_currency_symbol,
                })}
              </p>
            </div>

            <ArrowRight
              size={20}
              className={`shrink-0 text-slate-300 ${isRtl ? "rotate-180" : ""}`}
            />

            <div className="flex-1 rounded-2xl border border-emerald-100 bg-white p-6 text-center">
              <p className="text-xs font-bold uppercase text-emerald-600">
                {t("screens.funds.to")}
              </p>
              <GoTo type="fund" id={transfer.to_fund_id}>
                <p className=" font-black text-slate-900">
                  {transfer.to_fund_name}
                </p>
              </GoTo>
              <p className=" text-2xl font-black tabular-nums text-emerald-700">
                {formatMoney(transfer.receive_amount, {
                  code: transfer.to_fund_currency_code,
                  symbol: transfer.to_fund_currency_symbol,
                })}
              </p>
            </div>
          </div>

          {/* RATE */}
          <div className="grid grid-cols-2 gap-6 border-t border-[#e5ebff] p-7 text-sm">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase text-slate-400">
                {t("screens.funds.exchangeRate")}
              </p>
              <p className="mt-1 text-lg font-black tabular-nums text-slate-800">
                {Number(transfer.exchange_rate).toFixed(4)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase text-slate-400">
                {t("screens.funds.effectiveRate")}
              </p>
              <p className="mt-1 flex items-center gap-2 text-lg font-black tabular-nums text-slate-800">
                {Number(transfer.effective_rate).toFixed(4)}
                {!sameRate && (
                  <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600">
                    {t("screens.funds.rateDiffers")}
                  </span>
                )}
              </p>
            </div>
          </div>

          {transfer.note && (
            <div className="border-t border-[#e5ebff] p-7 text-sm">
              <p className="text-xs font-bold uppercase text-slate-400">
                {t("ui.note")}
              </p>
              <p className="mt-1 text-slate-700">{transfer.note}</p>
            </div>
          )}
        </section>
      </div>

      <DeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t("deleteModal.transferTitle")}
        message={t("deleteModal.transferMessage")}
      />

      <ToastContainer />
    </div>
  );
};

export default FundTransferDocumentPage;
