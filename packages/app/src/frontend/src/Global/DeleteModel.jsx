import { useEffect } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

const DeleteModal = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  loading = false,
  subTitle = "common.delete",
  btnTxt = "common.delete",
}) => {
  const { t } = useTranslation();
  const modalTitle = title || t("deleteModal.title");
  const modalMessage = message || t("deleteModal.message");

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-red-100 bg-white shadow-2xl animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start justify-between gap-4 border-b border-red-100 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <AlertTriangle size={22} />
            </div>

            <div>
              <h2 className="text-lg font-black text-slate-950">
                {modalTitle}
              </h2>
              <p className="mt-1 text-xs font-semibold text-red-600">
                {t(subTitle)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-6">
          <p className="text-sm leading-6 text-slate-600">{modalMessage}</p>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-black text-white shadow-lg shadow-red-200 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={16} />
            {loading ? t("common.loading") : t(btnTxt)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;
