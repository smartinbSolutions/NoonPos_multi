// packages/app/src/renderer/components/tags/TagFormModal.jsx

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

const ENTITY_TYPES = [
  "product",
  "customer",
  "supplier",
  "partner",
  "sales_invoice",
  "sales_return",
  "sales_quotation",
  "purchase_invoice",
  "purchase_return",
  "expense",
  // "payment",
];

const DEFAULT_COLORS = [
  "#4663ff", // brand blue
  "#9C7B45", // gold
  "#22c55e", // green
  "#ef4444", // red
  "#f59e0b", // amber
  "#0ea5e9", // sky
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#d946ef", // fuchsia
  "#eab308", // yellow
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f43f5e", // rose
  "#64748b", // slate
  "#78716c", // stone
];

export default function TagFormModal({ tag, onClose, onSave }) {
  const { t } = useTranslation();
  const isEdit = Boolean(tag?.id);

  const [name, setName] = useState(tag?.name || "");
  const [latinName, setLatinName] = useState(tag?.latinName || "");
  const [color, setColor] = useState(tag?.color || DEFAULT_COLORS[0]);
  const [scope, setScope] = useState(tag?.scope ?? "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("screens.tags.errors.nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);

    const res = await onSave({
      name: name.trim(),
      latinName: latinName.trim() || null,
      color,
      scope: scope || null,
    });

    setSaving(false);
    if (res && !res.success && !res.pendingConfirm) {
      setError(t(`errors.${res.error}`, res.error));
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_80px_rgba(70,99,255,0.18)] backdrop-blur">
        <button
          onClick={onClose}
          className="absolute end-4 top-4 text-[#1c2340]/50 hover:text-[#1c2340]"
        >
          <X size={18} />
        </button>

        <h2 className="mb-5 font-black text-[#1c2340]">
          {isEdit ? t("screens.tags.editTag") : t("screens.tags.addTag")}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-[#1c2340]/60">
              {t("screens.tags.fields.name")}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[14px] border border-[#1c2340]/10 bg-white px-3 py-2 text-[#1c2340] outline-none focus:border-[#4663ff]"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#1c2340]/60">
              {t("screens.tags.fields.latinName")}
            </label>
            <input
              value={latinName}
              onChange={(e) => setLatinName(e.target.value)}
              dir="ltr"
              className="w-full rounded-[14px] border border-[#1c2340]/10 bg-white px-3 py-2 text-[#1c2340] outline-none focus:border-[#4663ff]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#1c2340]/60">
              {t("screens.tags.fields.scope")}
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full rounded-[14px] border border-[#1c2340]/10 bg-white px-3 py-2 text-[#1c2340] outline-none focus:border-[#4663ff]"
            >
              <option value="">{t("screens.tags.scopes.global")}</option>
              {ENTITY_TYPES.map((et) => (
                <option key={et} value={et}>
                  {t(`screens.tags.scopes.${et}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#1c2340]/60">
              {t("screens.tags.fields.color")}
            </label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-8 w-8 rounded-full border-2"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "#1c2340" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-sm font-bold text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[14px] px-4 py-2 font-bold text-[#1c2340]/60 hover:bg-[#1c2340]/5"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-[14px] bg-[#4663ff] px-4 py-2 font-bold text-white shadow-[0_12px_30px_rgba(70,99,255,0.35)] disabled:opacity-50"
            >
              {t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
