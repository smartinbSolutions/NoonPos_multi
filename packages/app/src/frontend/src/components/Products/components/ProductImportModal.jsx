import React, { useState } from "react";
import {
  X,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ProductImportModal({ isOpen, onClose, onImported }) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const api = window.api;

  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    setError("");
    try {
      const res = await api.downloadProductImportTemplate();
      if (!res.success && !res.canceled) {
        setError(res.error || t("errors.downloadFailed"));
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const res = await api.importProducts();

      if (res.canceled) return;
      if (!res.success) {
        setError(res.error || t("errors.importFailed"));
        return;
      }
      setResult(res);
      onImported?.();
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setError("");
    onClose();
  };

  const hasIssues =
    result &&
    (result.skippedProducts.length > 0 ||
      result.skippedBarcodes.length > 0 ||
      result.skippedUnits.length > 0 ||
      result.skippedTags.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
        style={{ direction: isRtl ? "rtl" : "ltr" }}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b bg-gray-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-[#eef3ff] p-2 text-[#4663ff]">
              <FileSpreadsheet size={20} />
            </div>
            <h2 className="font-black text-slate-900">
              {t("screens.products.importProducts")}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="rounded-xl p-2 hover:bg-gray-200 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {!result ? (
            <>
              <div className="rounded-2xl border border-[#e5ebff] bg-[#f8faff] p-4">
                <p className="mb-3 text-sm text-slate-600">
                  {t("screens.products.importHelper")}
                </p>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={downloading}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#dbe4ff] bg-white text-sm font-bold text-[#4663ff] transition hover:bg-[#eef3ff] disabled:opacity-50"
                >
                  <Download size={16} />
                  {downloading
                    ? t("common.saving")
                    : t("screens.products.downloadTemplate")}
                </button>
              </div>

              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4663ff] text-sm font-black text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:opacity-50"
              >
                <Upload size={16} />
                {importing
                  ? t("common.loading")
                  : t("screens.products.uploadAndImport")}
              </button>

              {error && (
                <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
            </>
          ) : (
            <>
              {/* RESULTS COUNTER */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-emerald-50 p-4 text-center">
                  <p className="text-2xl font-black text-emerald-700">
                    {result.created.length}
                  </p>
                  <p className="text-xs font-semibold text-emerald-600">
                    {t("screens.products.created")}
                  </p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-4 text-center">
                  <p className="text-2xl font-black text-amber-700">
                    {result.skippedProducts.length}
                  </p>
                  <p className="text-xs font-semibold text-amber-600">
                    {t("screens.products.skippedProducts")}
                  </p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-4 text-center">
                  <p className="text-2xl font-black text-amber-700">
                    {result.skippedBarcodes.length}
                  </p>
                  <p className="text-xs font-semibold text-amber-600">
                    {t("screens.products.skippedBarcodes")}
                  </p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-4 text-center">
                  <p className="text-2xl font-black text-amber-700">
                    {result.skippedUnits.length}
                  </p>
                  <p className="text-xs font-semibold text-amber-600">
                    {t("screens.products.skippedUnits")}
                  </p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-4 text-center">
                  <p className="text-2xl font-black text-amber-700">
                    {result.skippedTags.length}
                  </p>
                  <p className="text-xs font-semibold text-amber-600">
                    {t("screens.products.skippedTags", "Skipped Tags")}
                  </p>
                </div>
              </div>

              {result.created.length > 0 && (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 size={16} />
                  {t("screens.products.importSuccess")}
                </div>
              )}

              {/* ISSUES LIST */}
              {hasIssues && (
                <div className="space-y-2">
                  {result.skippedProducts.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <p className="mb-2 text-xs font-black uppercase  text-amber-700">
                        {t("screens.products.skippedProducts")}
                      </p>
                      <div className="space-y-1.5">
                        {result.skippedProducts.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="font-bold text-slate-700">
                              {t("ui.row")} {item.row} · {item.name}
                            </span>
                            <span className="shrink-0 text-amber-700 font-medium">
                              {item.reason
                                ? t(`errors.${item.reason}`)
                                : t("ui.noReason")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.skippedBarcodes.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <p className="mb-2 text-xs font-black uppercase  text-amber-700">
                        {t("screens.products.skippedBarcodes")}
                      </p>
                      <div className="space-y-1.5">
                        {result.skippedBarcodes.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="font-bold text-slate-700">
                              {t("ui.row")} {item.row} · {item.barcode}
                            </span>
                            <span className="shrink-0 text-amber-700 font-medium">
                              {item.reason
                                ? t(`errors.${item.reason}`)
                                : t("ui.noReason")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.skippedUnits.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <p className="mb-2 text-xs font-black uppercase  text-amber-700">
                        {t("screens.products.skippedUnits")}
                      </p>
                      <div className="space-y-1.5">
                        {result.skippedUnits.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="font-bold text-slate-700">
                              {t("ui.row")} {item.row} · {item.name}
                            </span>
                            <span className="shrink-0 text-amber-700 font-medium">
                              {item.reason
                                ? t(`errors.${item.reason}`)
                                : t("ui.noReason")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.skippedTags.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <p className="mb-2 text-xs font-black uppercase  text-amber-700">
                        {t("screens.products.skippedTags", "Skipped Tags")}
                      </p>
                      <div className="space-y-1.5">
                        {result.skippedTags.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="font-bold text-slate-700">
                              {t("ui.row")} {item.row} · {item.name} ({item.tag}
                              )
                            </span>
                            <span className="shrink-0 text-amber-700 font-medium">
                              {item.reason
                                ? t(`errors.${item.reason}`)
                                : t("ui.noReason")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setResult(null)}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#4663ff] text-sm font-black text-white hover:bg-[#3854e8] transition"
              >
                <Upload size={16} />
                {t("screens.products.importAnother")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
