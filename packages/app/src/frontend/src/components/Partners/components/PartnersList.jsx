import React, { useMemo, useState } from "react";
import usePartnersList from "../hooks/usePartnersList";
import { useTranslation } from "react-i18next";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { Edit2, Eye, HandCoins, Trash2 } from "lucide-react";
import DeleteModal from "../../../Global/DeleteModel";
import AddPayment from "../../Cash/Payment/components/AddPayment";
import ContactListHeader from "../../../Global/Contactlistheader";
import Pagination from "../../../Global/Pagination";
import { ToastContainer } from "react-toastify";
import TagList from "../../Tags/components/TagList";
import TagPickerField from "../../Tags/components/TagPickerField";

const BalanceCell = ({ deposited, withdrawn, balance, money, t }) => {
  const isSettled = balance <= 0;

  return (
    <span className="group relative inline-flex cursor-help items-center justify-end">
      <span
        className={`font-black tabular-nums ${
          isSettled ? "text-red-500" : " text-emerald-600"
        }`}
      >
        {money(balance)}
      </span>

      <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-1.5 w-48 whitespace-normal rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        <span className="flex justify-between">
          <span className="text-slate-300">
            {t("screens.ledger.totalDeposit")}
          </span>
          <span className="font-bold">{money(deposited)}</span>
        </span>
        <span className="mt-1 flex justify-between">
          <span className="text-slate-300">
            {t("screens.ledger.totalWithdrawal")}
          </span>
          <span className="font-bold text-emerald-300">{money(withdrawn)}</span>
        </span>
      </span>
    </span>
  );
};

const PartnersList = () => {
  const { t } = useTranslation();
  const {
    saving,
    partners,
    handleDeletePartner,
    submitDraft,
    startEdit,
    submitEdit,
    setEditing,
    editing,
    setEditingId,
    editingId,
    setDraft,
    draft,
    actionError,
    navigate,
    selectePartner,
    setSelectePartner,
    refetch,
    openPaymentModel,
    setOpenPaymentModel,
    remainingPercentage,

    // pagination
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    tagsByPartner,
  } = usePartnersList();
  const { money } = usePrimaryCurrency();

  const [search, setSearch] = useState("");
  const [deletePartners, setDeletePartners] = useState(null);
  const pageClass =
    "min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900";
  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur overflow-hidden";
  const inputClass =
    "rounded-xl border border-[#dbe4ff] bg-white/90 px-3 py-2 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";

  const filteredpartners = useMemo(() => {
    return partners.filter((s) =>
      `${s.name} ${s.phone} ${s.address} ${s.total_deposit} ${s.total_withdrawal}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  }, [partners, search]);

  return (
    <div className={pageClass}>
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <div className={panelClass}>
          <ContactListHeader
            eyebrow={t("ui.contacts")}
            title={t("ui.partners")}
            subtitle={t("screens.contacts.partnerSubtitle")}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("screens.contacts.searchPartner")}
            createTitle={t("screens.contacts.createPartner")}
            createSubtitle={t("screens.contacts.addPartnerContact")}
            draft={draft}
            setDraft={setDraft}
            onSubmit={submitDraft}
            saving={saving}
            actionError={actionError}
            submitLabel={t("screens.contacts.addPartner")}
            t={t}
            type="partner"
            remainingPercentage={remainingPercentage}
          />

          {filteredpartners.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-10">
              {t("screens.contacts.noPartner")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-[#f8faff] text-xs font-bold uppercase  text-slate-500">
                  <tr>
                    <th className="px-5 py-4 text-center">{t("ui.name")}</th>
                    <th className="px-5 py-4 text-center">{t("ui.phone")}</th>
                    <th className="px-5 py-4 text-center">{t("ui.address")}</th>
                    <th className="px-5 py-4 text-center">{t("ui.balance")}</th>
                    <th className="px-5 py-4 text-center">
                      {t("ui.percentage")}
                    </th>
                    <th className="px-5 py-4 text-center">
                      {t("screens.tags.title") || "Tags"}
                    </th>
                    <th className="px-5 py-4 text-center">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#eef1ff]">
                  {filteredpartners.map((partner) => {
                    // Partners don't have invoices — their balance is driven
                    // by deposits (money put into the fund) vs withdrawals
                    // (money taken out), not total/total_paid.
                    const deposited = partner.total_deposit || 0;
                    const withdrawn = partner.total_withdrawal || 0;
                    const balance = deposited - withdrawn;

                    if (editingId === partner.id) {
                      return (
                        <tr key={partner.id} className="bg-[#f8faff]">
                          <td className="px-5 py-4" colSpan={6}>
                            <form onSubmit={submitEdit} className="space-y-3">
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                    {t("ui.name")}
                                  </label>
                                  <input
                                    required
                                    value={editing.name}
                                    onChange={(e) =>
                                      setEditing({
                                        ...editing,
                                        name: e.target.value,
                                      })
                                    }
                                    className={`${inputClass} w-full`}
                                    placeholder={t("ui.name")}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                    {t("ui.phone")}
                                  </label>
                                  <input
                                    value={editing.phone}
                                    onChange={(e) =>
                                      setEditing({
                                        ...editing,
                                        phone: e.target.value,
                                      })
                                    }
                                    className={`${inputClass} w-full`}
                                    placeholder={t("ui.phone")}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                    {t("ui.address")}
                                  </label>
                                  <input
                                    value={editing.address}
                                    onChange={(e) =>
                                      setEditing({
                                        ...editing,
                                        address: e.target.value,
                                      })
                                    }
                                    className={`${inputClass} w-full`}
                                    placeholder={t("ui.address")}
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                  {t("ui.percentage")}
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={editing.percentage}
                                  onChange={(e) =>
                                    setEditing({
                                      ...editing,
                                      percentage: e.target.value,
                                    })
                                  }
                                  className={`${inputClass} w-full`}
                                  placeholder="0"
                                />
                                <span className="text-[10px] text-slate-400">
                                  {t("screens.contacts.maxPercentageAllowed", {
                                    value:
                                      remainingPercentage +
                                      (editing.percentage || 0),
                                  })}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                  {t("screens.tags.title")}
                                </label>
                                <TagPickerField
                                  scope="partner"
                                  entityType="partner"
                                  entityId={partner.id}
                                  selectedIds={editing.tagIds || []}
                                  onChange={(ids) =>
                                    setEditing({ ...editing, tagIds: ids })
                                  }
                                />
                              </div>

                              <div className="flex items-center justify-end gap-2 border-t border-[#e5ebff] pt-3">
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
                                >
                                  {t("common.cancel")}
                                </button>
                                <button className="rounded-xl bg-[#4663ff] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#4663ff]/20 transition hover:bg-[#3854e8]">
                                  {t("common.save")}
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={partner.id}
                        className="transition hover:bg-[#f8faff]"
                      >
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4663ff] text-xs font-bold text-white shadow-md shadow-[#4663ff]/20">
                              {partner.name?.charAt(0)?.toUpperCase() || "P"}
                            </div>
                            <span className="font-bold text-slate-900">
                              {partner.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-center">
                          {partner.phone || t("ui.noPhone")}
                        </td>
                        <td className="px-5 py-3 max-w-[200px] truncate text-slate-500 text-center">
                          {partner.address || t("ui.noAddress")}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <BalanceCell
                            deposited={deposited}
                            withdrawn={withdrawn}
                            balance={balance}
                            money={money}
                            t={t}
                          />
                        </td>
                        <td className="px-5 py-3 text-center font-bold text-slate-700">
                          {partner.percentage ?? 0}%
                        </td>
                        <td className="px-5 py-3 text-center">
                          <TagList
                            tags={tagsByPartner[partner.id] || []}
                            limit={2}
                          />
                        </td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() =>
                                navigate(`/payment/partner/${partner.id}`)
                              }
                              className="rounded-xl p-2 text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                              title={t("screens.funds.viewMovements")}
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => {
                                setSelectePartner(partner);
                                setOpenPaymentModel(true);
                              }}
                              className="rounded-xl p-2 text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                              title={t("ui.payment")}
                            >
                              <HandCoins size={16} />
                            </button>
                            <button
                              onClick={() => startEdit(partner)}
                              className="rounded-xl p-2 text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                              title={t("common.edit")}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => setDeletePartners(partner)}
                              className="rounded-xl p-2 text-red-500 transition hover:bg-red-50"
                              title={t("common.delete")}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
            </div>
          )}
        </div>
      </div>

      <AddPayment
        isOpen={openPaymentModel}
        onClose={() => setOpenPaymentModel(false)}
        invoice={null}
        party={selectePartner?.id}
        partyName={selectePartner?.name}
        mode="partner"
        refetchList={refetch}
      />

      <DeleteModal
        open={Boolean(deletePartners)}
        onClose={() => setDeletePartners(null)}
        onConfirm={async () => {
          await handleDeletePartner(deletePartners);
          setDeletePartners(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />
      <ToastContainer />
    </div>
  );
};

export default PartnersList;
