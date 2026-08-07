import React, { useMemo, useState } from "react";
import {
  Search,
  Save,
  X,
  Edit2,
  Trash2,
  Plus,
  CalendarDays,
  Wallet,
  Receipt,
  Eye,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import useExpenseCategory from "../hooks/useExpenseCategory";
import DeleteModal from "../../../Global/DeleteModel";
import usePrimaryCurrency from "../../../Global/usePrimaryCurrency";
import { useNavigate } from "react-router-dom";

const RANK_ACCENTS = [
  { bg: "bg-[#1c2340]", text: "text-white" },
  { bg: "bg-[#4663ff]", text: "text-white" },
  { bg: "bg-[#8fa4ff]", text: "text-white" },
];

const ExpenseCategoryList = () => {
  const { t } = useTranslation();
  const { money } = usePrimaryCurrency();
  const navigate = useNavigate();

  const {
    expenseCategory,
    saving,
    actionError,
    draft,
    setDraft,
    editing,
    setEditing,
    editingId,
    setEditingId,
    submitDraft,
    submitEdit,
    startEdit,
    handleDeleteExpenseCategory,
    dateRange,
    setDateRange,
    clearDateRange,
  } = useExpenseCategory();

  const [search, setSearch] = useState("");
  const [deleteCategory, setDeleteCategory] = useState(null);

  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur overflow-hidden";
  const inputClass =
    "w-full rounded-xl border border-[#dbe4ff] bg-white/90 px-3 py-2.5 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";
  const primaryButtonClass =
    "flex items-center justify-center gap-2 rounded-xl bg-[#4663ff] py-2.5 text-sm font-bold text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:opacity-50";

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return expenseCategory || [];

    return (expenseCategory || []).filter((c) =>
      `${c.name}`.toLowerCase().includes(term)
    );
  }, [expenseCategory, search]);

  const totalSpentAll = useMemo(
    () =>
      (expenseCategory || []).reduce(
        (sum, c) => sum + Number(c.total_spent || 0),
        0
      ),
    [expenseCategory]
  );

  const maxSpent = useMemo(
    () =>
      Math.max(
        1,
        ...(expenseCategory || []).map((c) => Number(c.total_spent || 0))
      ),
    [expenseCategory]
  );

  const hasDateFilter = Boolean(dateRange.startDate || dateRange.endDate);

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <div className="mx-auto grid max-w-6xl gap-5 xl:grid-cols-[1fr_320px]">
        {/* LIST PANEL */}
        <div className={panelClass}>
          {/* HERO */}
          <div className="p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-xs font-bold uppercase text-[#4663ff]">
                  {t("ui.setup")}
                </p>
                <h1 className="text-3xl font-black leading-tight text-slate-950">
                  {t("screens.expensesCategory.categoryTitle")}
                </h1>
              </div>

              <div className="relative">
                <Search
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  size={15}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("common.search")}
                  className={`${inputClass} w-64 pl-10`}
                />
              </div>
            </div>

            {/* NUMBERS STRIP */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white px-3.5 py-2.5">
                <CalendarDays size={15} className="shrink-0 text-[#4663ff]" />
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) =>
                    setDateRange((prev) => ({
                      ...prev,
                      startDate: e.target.value,
                    }))
                  }
                  className="bg-transparent text-sm text-slate-700 outline-none"
                />
                <span className="text-slate-300">–</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) =>
                    setDateRange((prev) => ({
                      ...prev,
                      endDate: e.target.value,
                    }))
                  }
                  className="bg-transparent text-sm text-slate-700 outline-none"
                />
                {hasDateFilter && (
                  <button
                    type="button"
                    onClick={clearDateRange}
                    className="ml-1 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="rounded-2xl bg-[#1c2340] px-4 py-2.5 text-white">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase opacity-70">
                  <Wallet size={12} />
                  {t("screens.expensesCategory.totalSpent")}
                </div>
                <div className="mt-0.5 text-lg font-black tabular-nums">
                  {money(totalSpentAll)}
                </div>
              </div>
            </div>
          </div>

          {actionError && (
            <div className="mx-7 mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {actionError}
            </div>
          )}

          {/* LIST — ranked, with proportional spend bars */}
          <div className="divide-y divide-[#eef1ff] border-t border-[#e5ebff]">
            {filtered.map((cat, index) => {
              const spent = Number(cat.total_spent || 0);
              const barPercent = Math.max(2, (spent / maxSpent) * 100);
              const rankAccent = RANK_ACCENTS[index] || {
                bg: "bg-slate-100",
                text: "text-slate-500",
              };

              if (editingId === cat.id) {
                return (
                  <form
                    key={cat.id}
                    onSubmit={submitEdit}
                    className="flex flex-wrap items-center gap-2 bg-[#f8faff] px-6 py-4"
                  >
                    <input
                      autoFocus
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                      className={`${inputClass} flex-1 min-w-[160px]`}
                      placeholder={t("screens.expensesCategory.categoryName")}
                    />
                    <input
                      value={editing.latinName}
                      onChange={(e) =>
                        setEditing({ ...editing, latinName: e.target.value })
                      }
                      className={`${inputClass} flex-1 min-w-[160px]`}
                      placeholder={t("ui.latinName")}
                    />
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 rounded-xl bg-[#4663ff] px-3.5 py-2.5 text-xs font-bold text-white hover:bg-[#3854e8]"
                    >
                      <Save size={14} />
                      {t("common.save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-xl border border-[#dbe4ff] bg-white p-2.5 text-slate-500 hover:bg-[#eef3ff]"
                    >
                      <X size={14} />
                    </button>
                  </form>
                );
              }

              return (
                <div
                  key={cat.id}
                  className="group px-6 py-4 transition hover:bg-[#f8faff]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black ${rankAccent.bg} ${rankAccent.text}`}
                      >
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">
                          {cat.name}
                        </p>
                        <p className="flex items-center gap-1 truncate text-xs font-semibold text-slate-400">
                          <Receipt size={11} />
                          {t("screens.expensesCategory.itemsCount")}:{" "}
                          {cat.items_count || 0}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <p className="text-xl font-black tabular-nums text-slate-900">
                        {money(spent)}
                      </p>

                      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          onClick={() =>
                            navigate(`/expense-category/${cat.id}`)
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-[#4663ff]"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => startEdit(cat)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-[#4663ff]"
                        >
                          <Edit2 size={15} />
                        </button>

                        {Number(cat.total_items_count || 0) === 0 ? (
                          <button
                            onClick={() => setDeleteCategory(cat)}
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-red-500 transition hover:bg-white"
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : (
                          <span
                            title={t("screens.expensesCategory.inUseHint")}
                            className="flex h-9 w-9 items-center justify-center text-slate-300"
                          >
                            <Trash2 size={15} />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Proportional spend bar — relative weight vs. the
                      biggest category, purely visual, no new data. */}
                  <div className="ms-[46px] mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#4663ff]/70 transition-all"
                      style={{ width: `${barPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-14 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#4663ff]">
                  <Receipt size={22} />
                </div>
                <p className="font-bold text-slate-600">
                  {t("screens.expensesCategory.emptyCategories")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* CREATE SIDE PANEL */}
        <div className={`${panelClass} h-fit p-6`}>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-950">
            <Plus size={17} className="text-[#4663ff]" />
            {t("screens.expensesCategory.createCategory")}
          </h3>

          <form onSubmit={submitDraft} className="space-y-3">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass}
              placeholder={t("screens.expensesCategory.categoryName")}
            />
            <input
              value={draft.latinName}
              onChange={(e) =>
                setDraft({ ...draft, latinName: e.target.value })
              }
              className={inputClass}
              placeholder={t("ui.latinName")}
            />
            <button
              disabled={saving}
              className={`w-full ${primaryButtonClass}`}
            >
              <Plus size={15} />
              {t("screens.expensesCategory.addButton")}
            </button>
          </form>
        </div>
      </div>

      <DeleteModal
        open={Boolean(deleteCategory)}
        onClose={() => setDeleteCategory(null)}
        onConfirm={async () => {
          await handleDeleteExpenseCategory(deleteCategory.id);
          setDeleteCategory(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />
    </div>
  );
};

export default ExpenseCategoryList;
