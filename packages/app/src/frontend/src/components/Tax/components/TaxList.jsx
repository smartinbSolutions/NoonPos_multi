import React, { useMemo, useState } from "react";
import { Edit2, Plus, Save, Trash2, X, Search } from "lucide-react";
import useTax from "../hooks/useTax";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../Global/DeleteModel";
import NumberInput from "../../../Global/NumberInput";

const CATEGORY_OPTIONS = ["product", "invoice", "both"];

const TaxList = () => {
  const { t } = useTranslation();
  const {
    saving,
    taxes,
    handleDeleteTax,
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
  } = useTax();

  const [search, setSearch] = useState("");
  const [deleteTax, setDeleteTax] = useState(null);
  const pageClass =
    "min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900";
  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur";
  const inputClass =
    "rounded-xl border border-[#dbe4ff] bg-white/90 px-3 py-2 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";
  const primaryButtonClass =
    "flex items-center justify-center gap-2 rounded-xl bg-[#4663ff] py-2 text-sm font-bold text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:opacity-50";

  const rowGridClass = "grid grid-cols-[2fr_110px_140px_88px] gap-3";

  const categoryBadgeClass = {
    product: "bg-[#eef3ff] text-[#4663ff]",
    invoice: "bg-amber-100 text-amber-700",
    both: "bg-slate-100 text-slate-700",
  };

  const filteredTaxes = useMemo(() => {
    return taxes.filter((t) =>
      `${t.name} ${t.rate}`.toLowerCase().includes(search.toLowerCase())
    );
  }, [taxes, search]);

  return (
    <div className={pageClass}>
      <div className="max-w-6xl mx-auto grid xl:grid-cols-[1fr_300px] gap-6">
        <div className={`${panelClass} overflow-hidden`}>
          <div className="p-5 border-b flex items-center justify-between">
            <div>
              <p className="mb-1 text-xs font-bold uppercase  text-[#4663ff]">
                {t("ui.setup")}
              </p>
              <h2 className="text-2xl font-black text-slate-950">
                {t("screens.taxes.title")}
              </h2>
              <p className="text-sm text-slate-500">
                {t("screens.taxes.subtitle")}
              </p>
            </div>

            <div className="relative">
              <Search
                className="absolute left-3 top-2.5 text-slate-400"
                size={15}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("screens.taxes.search")}
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          {actionError && (
            <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {actionError}
            </div>
          )}

          <div
            className={`${rowGridClass} border-b bg-[#f8faff] px-5 py-3 text-center text-xs font-bold uppercase text-slate-400`}
          >
            <span>{t("ui.name")}</span>
            <span>{t("ui.rate")}</span>
            <span>{t("screens.taxes.category")}</span>
            <span>{t("common.actions")}</span>
          </div>

          <div>
            {filteredTaxes.map((tax) =>
              editingId === tax.id ? (
                <form
                  key={tax.id}
                  onSubmit={submitEdit}
                  className={`${rowGridClass} items-center border-b bg-[#f8faff] px-5 py-3`}
                >
                  <input
                    required
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                    className={inputClass}
                  />

                  <NumberInput
                    required
                    value={editing.rate}
                    onChange={(val) => setEditing({ ...editing, rate: val })}
                    max={100}
                    className={inputClass}
                  />

                  <select
                    value={editing.category}
                    onChange={(e) =>
                      setEditing({ ...editing, category: e.target.value })
                    }
                    className={inputClass}
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {t(`screens.taxes.categoryOption.${option}`)}
                      </option>
                    ))}
                  </select>

                  <div className="flex justify-center gap-2">
                    <button className="rounded-xl bg-[#4663ff] p-2 text-white shadow-lg shadow-[#4663ff]/20">
                      <Save size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-xl border border-[#dbe4ff] bg-white p-2 text-slate-500 hover:bg-[#eef3ff]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  key={tax.id}
                  className={`${rowGridClass} items-center border-b px-5 py-3 text-center transition hover:bg-[#f8faff]`}
                >
                  <div className="text-sm font-bold text-slate-900">
                    {tax.name}
                  </div>

                  <div className="flex justify-center">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      {tax.rate}%
                    </span>
                  </div>

                  <div className="flex justify-center">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        categoryBadgeClass[tax.category] ||
                        categoryBadgeClass.product
                      }`}
                    >
                      {t(
                        `screens.taxes.categoryOption.${tax.category || "product"}`
                      )}
                    </span>
                  </div>

                  <div className="flex justify-center gap-1">
                    <button
                      onClick={() => startEdit(tax)}
                      className="rounded-xl p-2 text-slate-500 hover:bg-[#eef3ff] hover:text-[#4663ff]"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTax(tax)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            )}

            {filteredTaxes.length === 0 && (
              <div className="p-10 text-center text-gray-400 text-sm">
                {t("screens.taxes.empty")}
              </div>
            )}
          </div>
        </div>

        <div className="sticky top-6 h-fit rounded-[28px] border border-white/80 bg-white/80 p-6 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur">
          <h3 className="mb-1 text-lg font-black text-slate-950">
            {t("screens.taxes.createTitle")}
          </h3>
          <p className="mb-5 text-sm text-slate-500">
            {t("screens.taxes.createSubtitle")}
          </p>

          <form onSubmit={submitDraft} className="space-y-3">
            <input
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={`w-full ${inputClass}`}
              placeholder={t("screens.taxes.namePlaceholder")}
            />

            <NumberInput
              required
              value={draft.rate}
              onChange={(val) => setDraft({ ...draft, rate: val })}
              max={100}
              className={`w-full ${inputClass}`}
              placeholder={t("screens.taxes.ratePlaceholder")}
            />

            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className={`w-full ${inputClass}`}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`screens.taxes.categoryOption.${option}`)}
                </option>
              ))}
            </select>

            <button
              disabled={saving}
              className={`w-full ${primaryButtonClass}`}
            >
              <Plus size={15} />
              {t("screens.taxes.addButton")}
            </button>
          </form>
        </div>
      </div>
      <DeleteModal
        open={Boolean(deleteTax)}
        onClose={() => setDeleteTax(null)}
        onConfirm={async () => {
          await handleDeleteTax(deleteTax);
          setDeleteTax(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />
    </div>
  );
};

export default TaxList;
