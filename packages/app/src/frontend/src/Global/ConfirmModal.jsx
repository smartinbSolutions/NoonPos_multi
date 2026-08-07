import { AlertCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirming,
}) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_32px_100px_rgba(15,23,42,0.28)]">
        <div className="flex items-start gap-3 p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <AlertCircle size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black text-slate-950">{title}</h3>
            <p className="mt-1 text-sm leading-5 text-slate-500">{message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t("common.close")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#e9edfb] bg-white/80 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel || t("common.no")}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#4663ff] px-4 text-sm font-black text-white shadow-md shadow-[#4663ff]/25 transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirming
              ? t("common.saving")
              : confirmLabel || t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
