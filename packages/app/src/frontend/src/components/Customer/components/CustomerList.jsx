import React, { useState } from "react";
import { Eye, Edit2, Trash2, HandCoins } from "lucide-react";
import useCustomerList from "../hooks/useCustomerList";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../Global/DeleteModel";
import AddPayment from "../../Cash/Payment/components/AddPayment";
import ContactListHeader from "../../../Global/Contactlistheader";
import Pagination from "../../../Global/Pagination";
import { ToastContainer } from "react-toastify";
import TagList from "../../Tags/components/TagList";
import TagPickerField from "../../Tags/components/TagPickerField";

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
    <div className="flex flex-col items-center gap-1">
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
          <Num>{money(total)}</Num> {t("screens.contacts.sales") || "total"}
        </span>
      </div>
    </div>
  );
};

export const CustomerList = () => {
  const { t } = useTranslation();
  const {
    saving,
    customers,
    stats,
    counts,
    handleDeleteCustomer,
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
    selecteCustomer,
    setSelecteCustomer,
    refetch,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    balanceFilter,
    setBalanceFilter,
    tagsByCustomer,
  } = useCustomerList();

  const { money } = usePrimaryCurrency();

  const [search, setSearch] = useState("");
  const [deleteCustomer, setDeleteCustomer] = useState(null);
  const pageClass =
    "min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900";
  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur overflow-hidden";
  const inputClass =
    "rounded-xl border border-[#dbe4ff] bg-white/90 px-3 py-2 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";

  // Search stays client-side (name/phone/address on the current page);
  // balance filtering is server-side, so it isn't duplicated here.
  const filteredCustomer = (customers || []).filter((s) =>
    `${s.name} ${s.phone} ${s.address} ${s.total} ${s.total_paid}`
      .toLowerCase()
      .includes(search.toLowerCase()),
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
            label={t("ui.customers") || "Customers"}
            value={stats.count}
          />
          <StatCard
            label={t("screens.contacts.sales") || "Total sales"}
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
            title={t("ui.customers")}
            subtitle={t("screens.contacts.customersSubtitle")}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("screens.contacts.searchCustomer")}
            createTitle={t("screens.contacts.createCustomer")}
            createSubtitle={t("screens.contacts.addCustomerContact")}
            draft={draft}
            setDraft={setDraft}
            onSubmit={submitDraft}
            saving={saving}
            actionError={actionError}
            submitLabel={t("screens.contacts.addCustomer")}
            t={t}
            type="customer"
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

          {filteredCustomer.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-10">
              {t("screens.contacts.noCustomers")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-center text-sm">
                <thead className="bg-[#f8faff] text-xs font-bold uppercase  text-slate-500">
                  <tr>
                    <th className="px-5 py-4 text-center">{t("ui.name")}</th>
                    <th className="px-5 py-4 text-center">{t("ui.phone")}</th>
                    <th className="px-5 py-4 text-center">{t("ui.address")}</th>
                    <th className="px-5 py-4 text-center">{t("ui.balance")}</th>
                    <th className="px-5 py-4 text-center">
                      {t("screens.tags.title") || "Tags"}
                    </th>
                    <th className="px-5 py-4 text-center">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#eef1ff]">
                  {filteredCustomer.map((customer) => {
                    const sales = customer.total || 0;
                    const paid = customer.total_paid || 0;
                    const balance = customer.balance ?? sales - paid;

                    if (editingId === customer.id) {
                      return (
                        <tr key={customer.id} className="bg-[#f8faff]">
                          <td className="px-5 py-3">
                            <input
                              required
                              form={`edit-customer-${customer.id}`}
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
                              form={`edit-customer-${customer.id}`}
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
                              form={`edit-customer-${customer.id}`}
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
                          <td className="px-5 py-3 text-center">
                            <span className="text-xs font-medium text-slate-400">
                              {t(
                                "screens.contacts.balanceLockedWhileEditing",
                              ) || "Balance unchanged"}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <TagPickerField
                              scope="customer"
                              entityType="customer"
                              entityId={customer.id}
                              selectedIds={editing.tagIds || []}
                              onChange={(ids) =>
                                setEditing({ ...editing, tagIds: ids })
                              }
                            />
                          </td>
                          <td className="px-5 py-3">
                            <form
                              id={`edit-customer-${customer.id}`}
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
                        key={customer.id}
                        className="transition hover:bg-[#f8faff]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4663ff] text-xs font-bold text-white shadow-md shadow-[#4663ff]/20">
                              {customer.name?.charAt(0)?.toUpperCase() || "C"}
                            </div>
                            <span className="font-bold text-slate-900">
                              {customer.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {customer.phone || t("ui.noPhone")}
                        </td>
                        <td className="px-5 py-3 max-w-[200px] truncate text-slate-500">
                          {customer.address || t("ui.noAddress")}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <BalanceCell
                            total={sales}
                            paid={paid}
                            balance={balance}
                            money={money}
                            t={t}
                          />
                        </td>
                        <td className="px-5 py-3">
                          <TagList
                            tags={tagsByCustomer[customer.id] || []}
                            limit={2}
                          />
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() =>
                                navigate(`/payment/customer/${customer.id}`)
                              }
                              className="rounded-xl p-2 text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                              title={t("screens.funds.viewMovements")}
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => {
                                setSelecteCustomer(customer);
                                setOpenPaymentModel(true);
                              }}
                              className="rounded-xl p-2 text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                              title={t("ui.payment")}
                            >
                              <HandCoins size={16} />
                            </button>
                            <button
                              onClick={() => startEdit(customer)}
                              className="rounded-xl p-2 text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff]"
                              title={t("common.edit")}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => setDeleteCustomer(customer)}
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
        party={selecteCustomer?.id}
        partyName={selecteCustomer?.name}
        mode="customer"
        refetchList={refetch}
      />

      <DeleteModal
        open={Boolean(deleteCustomer)}
        onClose={() => setDeleteCustomer(null)}
        onConfirm={async () => {
          await handleDeleteCustomer(deleteCustomer);
          setDeleteCustomer(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />
      <ToastContainer />
    </div>
  );
};
