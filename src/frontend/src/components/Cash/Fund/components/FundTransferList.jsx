import React, { useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ArrowRightLeft,
  Trash2,
  Edit2,
  Eye,
  CalendarDays,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import useFundTransfersList from "../hooks/useFundTransfersList";
import DeleteModal from "../../../../Global/DeleteModel";
import Pagination from "../../../../Global/Pagination";
import FundTransferModal from "./FundTransferModal";
import GoTo from "../../../../Global/GoTo";
import { formatMoney } from "../../../../Global/FormatNumber";
import { useNavigate } from "react-router-dom";

const FundTransferList = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const navigate = useNavigate();

  const {
    transfers,
    loading,
    actionError,
    handleDeleteTransfer,
    refetch,

    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
  } = useFundTransfersList();

  const [deleteTransfer, setDeleteTransfer] = useState(null);

  const [openTransferModal, setOpenTransferModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);

  const openCreateModal = () => {
    setSelectedTransfer(null);
    setOpenTransferModal(true);
  };

  const openEditModal = (transfer) => {
    setSelectedTransfer(transfer);
    setOpenTransferModal(true);
  };

  const pageClass =
    "min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900";
  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur overflow-hidden";
  const primaryButtonClass =
    "flex items-center justify-center gap-2 rounded-xl bg-[#4663ff] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:opacity-50";

  const FlowArrow = isRtl ? ArrowLeft : ArrowRight;

  return (
    <div className={pageClass}>
      <div className="mx-auto max-w-6xl space-y-5">
        {/* HERO */}
        <section className={panelClass}>
          <div className="flex items-center justify-between gap-4 p-7">
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-[#4663ff]">
                {t("ui.setup")}
              </p>
              <h1 className="text-3xl font-black leading-tight text-slate-950">
                {t("screens.transfer.title")}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {t("screens.transfer.subtitle")}
              </p>
            </div>

            <button onClick={openCreateModal} className={primaryButtonClass}>
              <ArrowRightLeft size={16} />
              {t("screens.transfer.newTransfer")}
            </button>
          </div>

          {actionError && (
            <div className="mx-7 mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {actionError}
            </div>
          )}
        </section>

        {/* LIST */}
        <section className={panelClass}>
          {loading ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-400">
              {t("common.loading")}
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#4663ff]">
                <ArrowRightLeft size={22} />
              </div>
              <p className="font-bold text-slate-600">
                {t("screens.transfer.noTransfers")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#eef1ff]">
              {transfers.map((tr) => {
                const isCrossCurrency =
                  tr.from_fund_currency !== tr.to_fund_currency;
                const rateDiffers =
                  Number(tr.effective_rate) !== Number(tr.exchange_rate);

                return (
                  <div
                    key={tr.id}
                    className="flex flex-col gap-4 px-6 py-5 transition hover:bg-[#f8faff] lg:flex-row lg:items-center lg:justify-between"
                  >
                    {/* FLOW — the focal point: two amounts either side of an arrow */}
                    <div className="flex flex-1 items-center gap-4">
                      <div className="flex-1 rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3">
                        <GoTo type="fund" id={tr.from_fund_id}>
                          <p className="truncate font-bold text-slate-900">
                            {tr.from_fund_name}
                          </p>
                        </GoTo>
                        <p className="mt-0.5 text-lg font-black tabular-nums text-red-600">
                          -{formatMoney(tr.deduct_amount)}{" "}
                          <span className="text-xs font-bold text-red-400">
                            {tr.from_fund_currency}
                          </span>
                        </p>
                      </div>

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef3ff] text-[#4663ff]">
                        <FlowArrow size={18} />
                      </div>

                      <div className="flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                        <GoTo type="fund" id={tr.to_fund_id}>
                          <p className="truncate font-bold text-slate-900">
                            {tr.to_fund_name}
                          </p>
                        </GoTo>
                        <p className="mt-0.5 text-lg font-black tabular-nums text-emerald-700">
                          +{formatMoney(tr.receive_amount)}{" "}
                          <span className="text-xs font-bold text-emerald-500">
                            {tr.to_fund_currency}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* META — rate, date, note */}
                    <div className="flex flex-col gap-1.5 lg:w-64 lg:shrink-0">
                      {isCrossCurrency && (
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-1.5 text-xs">
                          <span className="font-semibold text-slate-400">
                            {t("ui.fundRate", "Rate")}
                          </span>
                          <span className="font-bold tabular-nums text-slate-700">
                            {Number(tr.exchange_rate).toFixed(4)}
                            {rateDiffers && (
                              <span className="ms-1.5 text-[#4663ff]">
                                ({Number(tr.effective_rate).toFixed(4)})
                              </span>
                            )}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                        <CalendarDays size={12} />
                        {tr.date ? new Date(tr.date).toLocaleString() : "-"}
                      </div>

                      {tr.note && (
                        <p className="truncate text-xs italic text-slate-400">
                          {tr.note}
                        </p>
                      )}
                    </div>

                    {/* ACTIONS */}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => navigate(`/funds/transfers/${tr.id}`)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-[#4663ff] transition hover:bg-[#eef3ff]"
                        title={t("common.view")}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => openEditModal(tr)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        title={t("common.edit")}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteTransfer(tr)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50"
                        title={t("common.delete")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(newLimit) => {
              setLimit(newLimit);
              setPage(1);
            }}
          />
        </section>
      </div>

      <FundTransferModal
        isOpen={openTransferModal}
        onClose={() => {
          setOpenTransferModal(false);
          setSelectedTransfer(null);
        }}
        transfer={selectedTransfer}
        refetchList={refetch}
      />

      <DeleteModal
        open={Boolean(deleteTransfer)}
        onClose={() => setDeleteTransfer(null)}
        onConfirm={async () => {
          await handleDeleteTransfer(deleteTransfer);
          setDeleteTransfer(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />
    </div>
  );
};

export default FundTransferList;
