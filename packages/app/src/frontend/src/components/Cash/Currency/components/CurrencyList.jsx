import React, { useState } from "react";
import useCurrency from "../hooks/useCurrency";
import { Edit2, Plus, Save, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import DeleteModal from "../../../../Global/DeleteModel";
import NumberInput from "../../../../Global/NumberInput";

const CurrencyList = () => {
  const { t } = useTranslation();
  const {
    saving,
    currencies,
    handleDeleteCurrency,
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
  } = useCurrency();
  const [deleteCurrency, setDeleteCurrency] = useState(null);

  const pageClass =
    "min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900";
  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 p-6 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur";
  const inputClass =
    "rounded-xl border border-[#dbe4ff] bg-white/90 px-3 py-2 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";
  const primaryButtonClass =
    "flex items-center justify-center gap-2 rounded-xl bg-[#4663ff] p-2 text-sm font-bold text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:opacity-50";

  return (
    <div className={pageClass}>
      <div className="max-w-6xl mx-auto grid xl:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-5">
          <div className={`${panelClass} flex items-center justify-between`}>
            <div>
              <p className="mb-1 text-xs font-bold uppercase  text-[#4663ff]">
                {t("ui.setup")}
              </p>
              <h2 className="text-2xl font-black text-slate-950">
                {t("screens.currency.title")}
              </h2>
              <p className="text-sm text-slate-500">
                {t("screens.currency.subtitle")}
              </p>
            </div>

            <div className="text-right">
              <div className="text-3xl font-black text-[#4663ff]">
                {currencies.length}
              </div>
              <div className="text-xs font-semibold text-slate-500">
                {t("screens.currency.total")}
              </div>
            </div>
          </div>

          <div className={panelClass}>
            {actionError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </div>
            )}

            {/* Header row */}
            {/* Header row */}
            <div className="mb-2 grid grid-cols-[1fr_1fr_90px_100px_1fr_88px] gap-3 px-4 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <span>{t("ui.name")}</span>
              <span>{t("screens.units.latinPlaceholder")}</span>
              <span>{t("ui.code")}</span>
              <span>{t("ui.rate")}</span>
              <span>
                {t("screens.currency.minorNamePlaceholder", "Minor unit")}
              </span>
              <span>{t("common.actions")}</span>
            </div>

            <div className="space-y-2">
              {currencies.map((currency) =>
                editingId === currency.id ? (
                  <form
                    key={currency.id}
                    onSubmit={submitEdit}
                    className="rounded-2xl border border-[#cbd7ff] bg-[#f8faff] p-4 shadow-sm animate-fadeIn"
                  >
                    <input
                      required
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                      className={`mb-3 w-full ${inputClass}`}
                      placeholder={t("screens.currency.namePlaceholder")}
                    />

                    <div className="grid grid-cols-2 gap-2 mb-3">
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
                        placeholder={t("ui.code")}
                      />
                      <input
                        required
                        value={editing.symbol}
                        onChange={(e) =>
                          setEditing({ ...editing, symbol: e.target.value })
                        }
                        className={inputClass}
                        placeholder={t("ui.symbol")}
                      />
                      {currency.isPrimary === 0 && (
                        <NumberInput
                          required
                          value={editing.exchangeRate}
                          onChange={(val) =>
                            setEditing({ ...editing, exchangeRate: val })
                          }
                          className={inputClass}
                          placeholder={t("ui.rate")}
                        />
                      )}
                      <input
                        value={editing.minorName}
                        onChange={(e) =>
                          setEditing({ ...editing, minorName: e.target.value })
                        }
                        className={inputClass}
                        placeholder={t(
                          "screens.currency.minorNamePlaceholder",
                          "Minor unit name"
                        )}
                      />
                      <input
                        value={editing.minorLatinName}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            minorLatinName: e.target.value,
                          })
                        }
                        className={inputClass}
                        placeholder={t(
                          "screens.currency.minorLatinPlaceholder",
                          "Minor unit (Latin)"
                        )}
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
                    key={currency.id}
                    className="grid grid-cols-[1fr_1fr_90px_100px_1fr_88px] items-center gap-3 rounded-2xl border border-[#e5ebff] bg-white px-4 py-3 text-center transition hover:border-[#cbd7ff] hover:shadow-md hover:shadow-[#4663ff]/8"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-bold text-slate-900">
                        {currency.name}
                      </span>
                      {currency.isPrimary === 1 && (
                        <span className="rounded-md bg-[#eef3ff] px-1.5 py-0.5 text-[10px] font-bold text-[#4663ff]">
                          {t("ui.primary", "Primary")}
                        </span>
                      )}
                    </div>

                    <span className="text-sm text-slate-500">
                      {currency.latinName || "—"}
                    </span>

                    <span className="mx-auto inline-flex w-fit rounded-lg bg-[#eef3ff] px-2 py-1 text-xs font-bold text-[#4663ff]">
                      {currency.code}
                    </span>

                    <span className="text-sm font-semibold text-emerald-700">
                      {currency.exchangeRate}
                    </span>

                    <span className="text-sm text-slate-500">
                      {currency.minorName || currency.minorLatinName || "—"}
                    </span>

                    <div className="flex justify-center gap-1">
                      <button
                        onClick={() => startEdit(currency)}
                        className="rounded-xl p-2 text-slate-500 hover:bg-[#eef3ff] hover:text-[#4663ff]"
                      >
                        <Edit2 size={15} />
                      </button>
                      {currency.isPrimary === 0 && (
                        <button
                          onClick={() => setDeleteCurrency(currency)}
                          className="rounded-xl p-2 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}

              {currencies.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-gray-400 mb-2 text-sm">
                    {t("screens.currency.empty")}
                  </div>
                  <div className="text-xs text-gray-400">
                    {t("screens.currency.emptyHint")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sticky top-6 h-fit rounded-[28px] border border-white/80 bg-white/80 p-6 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur">
          <h3 className="mb-1 text-lg font-black text-slate-950">
            {t("screens.currency.createTitle")}
          </h3>
          <p className="mb-5 text-sm text-slate-500">
            {t("screens.currency.createSubtitle")}
          </p>

          <form onSubmit={submitDraft} className="space-y-3">
            <input
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={`w-full ${inputClass}`}
              placeholder={t("screens.currency.namePlaceholder")}
            />
            <input
              value={draft.latinName}
              onChange={(e) =>
                setDraft({ ...draft, latinName: e.target.value })
              }
              className={`w-full ${inputClass}`}
              placeholder={t("screens.units.latinPlaceholder")}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                className={inputClass}
                placeholder={t("ui.code")}
              />
              <input
                required
                value={draft.symbol}
                onChange={(e) => setDraft({ ...draft, symbol: e.target.value })}
                className={inputClass}
                placeholder={t("ui.symbol")}
              />
            </div>
            <NumberInput
              required
              value={draft.exchangeRate}
              onChange={(val) => setDraft({ ...draft, exchangeRate: val })}
              className={`w-full ${inputClass}`}
              placeholder={t("ui.exchangeRate")}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={draft.minorName}
                onChange={(e) =>
                  setDraft({ ...draft, minorName: e.target.value })
                }
                className={inputClass}
                placeholder={t(
                  "screens.currency.minorNamePlaceholder",
                  "Minor unit name"
                )}
              />
              <input
                value={draft.minorLatinName}
                onChange={(e) =>
                  setDraft({ ...draft, minorLatinName: e.target.value })
                }
                className={inputClass}
                placeholder={t(
                  "screens.currency.minorLatinPlaceholder",
                  "Minor unit (Latin)"
                )}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className={`w-full ${primaryButtonClass}`}
            >
              <Plus size={16} />
              {t("screens.currency.addButton")}
            </button>
          </form>
        </div>
      </div>
      <DeleteModal
        open={Boolean(deleteCurrency)}
        onClose={() => setDeleteCurrency(null)}
        onConfirm={async () => {
          await handleDeleteCurrency(deleteCurrency);
          setDeleteCurrency(null);
        }}
        title={t("deleteModal.title")}
        message={t("deleteModal.message")}
      />
    </div>
  );
};

export default CurrencyList;
