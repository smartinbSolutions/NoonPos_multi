import React, { useState } from "react";
import { Eye, Pen, Search, Trash2, Wallet2 } from "lucide-react";
import useSuppliersList from "../hooks/useSuppliersList";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../Global/DeleteModel";
import AddPayment from "../../Cash/Payment/components/AddPayment";
import Pagination from "../../../Global/Pagination";
import ContactListHeader from "../../../Global/Contactlistheader";
import { ToastContainer } from "react-toastify";

// dir="ltr" font-mono tabular-nums wrapper, per the app's RTL-number convention.
// TODO: swap for the shared <Num> component if you'd rather keep one source of truth.
const Num = ({ children, className = "" }) => (
  <span dir="ltr" className={`font-mono tabular-nums ${className}`}>
    {children}
  </span>
);

const StatCard = ({ label, value, tone = "neutral" }) => {
  const toneClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "success"
        ? "text-emerald-600"
        : "text-slate-900";

  return (
    <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-[0_10px_30px_rgba(70,99,255,0.06)]">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-xl font-black ${toneClass}`}>
        <Num>{value}</Num>
      </p>
    </div>
  );
};

const SettlementBar = ({ paid, total }) => {
  const ratio = total > 0 ? Math.min(1, Math.max(0, paid / total)) : 1;
  return (
    <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-emerald-500"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
};

const BalanceCell = ({ total, paid, balance, money, t }) => {
  const isSettled = balance <= 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            isSettled
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {isSettled ? t("ui.settled") || "Settled" : t("ui.owing") || "Owing"}
        </span>
        <span
          className={`text-base font-black ${
            isSettled ? "text-emerald-600" : "text-red-500"
          }`}
        >
          <Num>{money(balance)}</Num>
        </span>
      </div>

      <SettlementBar paid={paid} total={total} />

      <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
        <span>
          <Num>{money(paid)}</Num> {t("ui.paid") || "paid"}
        </span>
        <span className="text-slate-300">/</span>
        <span>
          <Num>{money(total)}</Num> {t("screens.contacts.purchases") || "total"}
        </span>
      </div>
    </div>
  );
};

export const SuppliersList = () => {
  const { t } = useTranslation();
  const {
    saving,
    suppliers,
    stats,
    counts,
    handleDeleteSupplier,
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
    openPaymentModel,
    setOpenPaymentModel,
    selecteSupplier,
    setSelecteSupplier,
    refetch,

    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    balanceFilter,
    setBalanceFilter,
  } = useSuppliersList();
  const { money } = usePrimaryCurrency();

  const [search, setSearch] = useState("");
  const [deleteSupplier, setDeleteSupplier] = useState(null);

  const pageClass =
    "min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900";
  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur overflow-hidden";
  const inputClass =
    "rounded-xl border border-[#dbe4ff] bg-white/90 px-3 py-2 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";

  // Search stays client-side (name/phone/address text match on the current page);
  // balance filtering is server-side now, so it isn't duplicated here.
  const filteredSuppliers = (suppliers || []).filter((s) =>
    `${s.name} ${s.phone} ${s.address} ${s.total} ${s.total_paid}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const filterChipClass = (key) =>
    `rounded-full px-3 py-1.5 text-xs font-bold transition ${
      balanceFilter === key
        ? "bg-[#4663ff] text-white shadow-md shadow-[#4663ff]/20"
        : "bg-white/80 text-slate-500 border border-[#dbe4ff] hover:bg-[#eef3ff]"
    }`;

  return (
    <div className={pageClass}>
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label={t("ui.suppliers") || "Suppliers"}
            value={stats.count}
          />
          <StatCard
            label={t("screens.contacts.purchases") || "Total payable"}
            value={money(stats.totalPayable)}
          />
          <StatCard
            label={t("ui.paid") || "Total paid"}
            value={money(stats.totalPaid)}
            tone="success"
          />
          <StatCard
            label={t("ui.balance") || "Net outstanding"}
            value={money(stats.netOutstanding)}
            tone={stats.netOutstanding > 0 ? "danger" : "success"}
          />
        </div>

        <div className={panelClass}>
          <ContactListHeader
            eyebrow={t("ui.contacts")}
            title={t("ui.suppliers")}
            subtitle={t("screens.contacts.suppliersSubtitle")}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("screens.contacts.searchSupplier")}
            createTitle={t("screens.contacts.createSupplier")}
            createSubtitle={t("screens.contacts.addSupplierContact")}
            draft={draft}
            setDraft={setDraft}
            onSubmit={submitDraft}
            saving={saving}
            actionError={actionError}
            submitLabel={t("screens.contacts.addSupplier")}
            t={t}
          />

          <div className="flex items-center gap-2 border-b border-[#eef1ff] px-5 py-3">
            <button
              className={filterChipClass("all")}
              onClick={() => setBalanceFilter("all")}
            >
              {t("common.all") || "All"} ({counts.all})
            </button>
            <button
              className={filterChipClass("owing")}
              onClick={() => setBalanceFilter("owing")}
            >
              {t("ui.owing") || "Owing"} ({counts.owing})
            </button>
            <button
              className={filterChipClass("settled")}
              onClick={() => setBalanceFilter("settled")}
            >
              {t("ui.settled") || "Settled"} ({counts.settled})
            </button>
          </div>

          {filteredSuppliers.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-10">
              {t("screens.contacts.noSuppliers")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#f8faff] text-xs font-bold uppercase  text-slate-500">
                  <tr>
                    <th className="px-5 py-4 text-start">{t("ui.name")}</th>
                    <th className="px-5 py-4 text-start">{t("ui.phone")}</th>
                    <th className="px-5 py-4 text-start">{t("ui.address")}</th>
                    <th className="px-5 py-4 text-end">{t("ui.balance")}</th>
                    <th className="px-5 py-4 text-start">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#eef1ff]">
                  {filteredSuppliers.map((supplier) => {
                    const supplierTotal = supplier.total || 0;
                    const paid = supplier.total_paid || 0;
                    const balance = supplier.balance ?? supplierTotal - paid;

                    if (editingId === supplier.id) {
                      return (
                        <tr key={supplier.id} className="bg-[#f8faff]">
                          <td className="px-5 py-3">
                            <input
                              required
                              form={`edit-supplier-${supplier.id}`}
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
                          </td>
                          <td className="px-5 py-3">
                            <input
                              form={`edit-supplier-${supplier.id}`}
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
                          </td>
                          <td className="px-5 py-3">
                            <input
                              form={`edit-supplier-${supplier.id}`}
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
                          </td>
                          <td className="px-5 py-3 text-end">
                            <span className="text-xs font-medium text-slate-400">
                              {t(
                                "screens.contacts.balanceLockedWhileEditing"
                              ) || "Balance unchanged"}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <form
                              id={`edit-supplier-${supplier.id}`}
                              onSubmit={submitEdit}
                              className="flex items-center gap-1"
                            >
                              <button className="flex items-center gap-1.5 rounded-xl bg-[#4663ff] px-3 py-2 text-xs font-bold text-white hover:bg-[#3854e8]">
                                {t("common.save")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="rounded-xl border border-[#dbe4ff] bg-white p-2 text-slate-500 hover:bg-[#eef3ff]"
                              >
                                <span>&times;</span>
                              </button>
                            </form>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={supplier.id}
                        className="transition hover:bg-[#f8faff]"
                      >
                        <td className="px-5 py-3 text-start">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4663ff] text-xs font-bold text-white shadow-md shadow-[#4663ff]/20">
                              {supplier.name?.charAt(0)?.toUpperCase() || "S"}
                            </div>
                            <span className="font-bold text-slate-900">
                              {supplier.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-start text-slate-500">
                          {supplier.phone || t("ui.noPhone")}
                        </td>
                        <td className="px-5 py-3 text-start max-w-[200px] truncate text-slate-500">
                          {supplier.address || t("ui.noAddress")}
                        </td>
                        <td className="px-5 py-3 text-end">
                          <BalanceCell
                            total={supplierTotal}
                            paid={paid}
                            balance={balance}
                            money={money}
                            t={t}
                          />
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-start gap-1">
                            <button
                              onClick={() =>
                                navigate(`/payment/supplier/${supplier.id}`)
                              }
                              className="rounded-xl p-2 text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                              title={t("screens.funds.viewMovements")}
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => {
                                setSelecteSupplier(supplier);
                                setOpenPaymentModel(true);
                              }}
                              className="rounded-xl p-2 text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                              title={t("ui.payment")}
                            >
                              <Wallet2 size={16} />
                            </button>
                            <button
                              onClick={() => startEdit(supplier)}
                              className="rounded-xl p-2 text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                              title={t("common.edit")}
                            >
                              <Pen size={16} />
                            </button>
                            <button
                              onClick={() => setDeleteSupplier(supplier)}
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
        party={selecteSupplier?.id}
        partyName={selecteSupplier?.name}
        mode="supplier"
        refetchList={refetch}
      />

      <DeleteModal
        open={Boolean(deleteSupplier)}
        onClose={() => setDeleteSupplier(null)}
        onConfirm={async () => {
          await handleDeleteSupplier(deleteSupplier);
          setDeleteSupplier(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />
      <ToastContainer />
    </div>
  );
};
