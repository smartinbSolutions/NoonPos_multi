import React, { useMemo, useState } from "react";
import useUnit from "../hooks/useUnit";
import { Edit2, Plus, Save, Trash2, X, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../Global/DeleteModel";

const UnitList = () => {
  const { t } = useTranslation();
  const {
    saving,
    units,
    handleDeleteUnit,
    startEdit,
    submitEdit,
    setEditing,
    editing,
    setEditingId,
    editingId,
    setDraft,
    draft,
    submitDraft,
    actionError,
  } = useUnit();

  const [search, setSearch] = useState("");
  const [deleteUnit, setDeleteUnit] = useState(null);
  const pageClass =
    "min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900";
  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 p-6 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur";
  const inputClass =
    "rounded-xl border border-[#dbe4ff] bg-white/90 px-3 p-2 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";
  const primaryButtonClass =
    "flex items-center justify-center gap-2 rounded-xl bg-[#4663ff] p-2 text-sm font-bold text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:opacity-50";

  const filteredUnits = useMemo(() => {
    return units.filter((u) =>
      `${u.name} ${u.latinName} ${u.code}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [units, search]);

  return (
    <div className={pageClass}>
      <div className="max-w-6xl mx-auto grid xl:grid-cols-[1fr_300px] gap-6">
        <div className={panelClass}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="mb-1 text-xs font-bold uppercase  text-[#4663ff]">
                {t("ui.setup")}
              </p>
              <h2 className="text-2xl font-black text-slate-950">
                {t("screens.units.title")}
              </h2>
              <p className="text-sm text-slate-500">
                {t("screens.units.subtitle")}
              </p>
            </div>

            <div className="relative">
              <Search
                className="absolute left-3 top-2.5 text-slate-400"
                size={16}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("screens.units.search")}
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          {actionError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {actionError}
            </div>
          )}

          {/* Header row — makes the list read as an actual table */}
          <div className="mb-2 grid grid-cols-[1fr_1fr_140px_auto] gap-3 px-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <span>{t("ui.name")}</span>
            <span>{t("screens.units.latinPlaceholder")}</span>
            <span>{t("screens.units.codePlaceholder")}</span>
            <span className="text-right">{t("common.actions")}</span>
          </div>

          <div className="space-y-2">
            {filteredUnits.map((unit) =>
              editingId === unit.id ? (
                <form
                  key={unit.id}
                  onSubmit={submitEdit}
                  className="rounded-2xl border border-[#cbd7ff] bg-[#f8faff] p-4 shadow-sm animate-fadeIn"
                >
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <input
                      required
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                      className={inputClass}
                      placeholder={t("screens.units.namePlaceholder")}
                    />
                    <input
                      value={editing.latinName}
                      onChange={(e) =>
                        setEditing({ ...editing, latinName: e.target.value })
                      }
                      className={inputClass}
                      placeholder={t("screens.units.latinPlaceholder")}
                    />
                    <input
                      required
                      value={editing.code}
                      onChange={(e) =>
                        setEditing({ ...editing, code: e.target.value })
                      }
                      className={inputClass}
                      placeholder={t("screens.units.codePlaceholder")}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button className={primaryButtonClass}>
                      <Save size={15} />
                      {t("common.save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-xl border border-[#dbe4ff] bg-white p-2 text-slate-500 hover:bg-[#eef3ff]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  key={unit.id}
                  className="grid grid-cols-[1fr_1fr_140px_auto] items-center gap-3 rounded-2xl border border-[#e5ebff] bg-white px-4 py-3 transition hover:border-[#cbd7ff] hover:shadow-md hover:shadow-[#4663ff]/8"
                >
                  <span className="font-bold text-slate-900">{unit.name}</span>
                  <span className="text-sm text-slate-500">
                    {unit.latinName || "—"}
                  </span>
                  <span className="inline-flex w-fit rounded-lg bg-[#eef3ff] px-2 py-1 text-xs font-bold text-[#4663ff]">
                    {unit.code}
                  </span>

                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => startEdit(unit)}
                      className="rounded-xl p-2 text-slate-500 hover:bg-[#eef3ff] hover:text-[#4663ff]"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => setDeleteUnit(unit)}
                      className="rounded-xl p-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            )}

            {filteredUnits.length === 0 && (
              <div className="text-center text-sm text-gray-500 py-12">
                {t("screens.units.empty")}
              </div>
            )}
          </div>
        </div>

        <div className="sticky top-6 h-fit rounded-[28px] border border-white/80 bg-white/80 p-6 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur">
          <h3 className="mb-1 text-lg font-black text-slate-950">
            {t("screens.units.createTitle")}
          </h3>
          <p className="mb-5 text-sm text-slate-500">
            {t("screens.units.createSubtitle")}
          </p>

          <form onSubmit={submitDraft} className="space-y-3">
            <input
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={`w-full ${inputClass}`}
              placeholder={t("screens.units.namePlaceholder")}
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                value={draft.latinName}
                onChange={(e) =>
                  setDraft({ ...draft, latinName: e.target.value })
                }
                className={inputClass}
                placeholder={t("screens.units.latinPlaceholder")}
              />
              <input
                required
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                className={inputClass}
                placeholder={t("screens.units.codePlaceholder")}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className={`w-full ${primaryButtonClass}`}
            >
              <Plus size={16} />
              {t("screens.units.addButton")}
            </button>
          </form>
        </div>
      </div>
      <DeleteModal
        open={Boolean(deleteUnit)}
        onClose={() => setDeleteUnit(null)}
        onConfirm={async () => {
          await handleDeleteUnit(deleteUnit);
          setDeleteUnit(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />
    </div>
  );
};

export default UnitList;
