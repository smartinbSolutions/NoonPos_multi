import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  FileSpreadsheet,
  FileText,
  X,
  CalendarDays,
  AlertCircle,
  Loader2,
  Globe,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDefaultDateRange } from "./dateDefaults";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
  { code: "tr", label: "Türkçe" },
];

const ExportModal = ({
  isOpen,
  onClose,
  onExportExcel,
  onExportPdf,
  exporting = false,
  exportError = "",
  title,
}) => {
  const { t, i18n } = useTranslation();
  const [startDate, setStartDate] = useState(
    () => getDefaultDateRange().startDate
  );
  const [endDate, setEndDate] = useState(() => getDefaultDateRange().endDate);
  const [language, setLanguage] = useState(i18n.language?.slice(0, 2) || "en");

  if (!isOpen) return null;

  const handleExport = (format) => {
    const range = { startDate, endDate, language };
    if (format === "excel") onExportExcel?.(range);
    else onExportPdf?.(range);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            {title || t("common.exportData", "Export Data")}
          </h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 mb-5">
          <label className="text-xs font-semibold uppercase  text-gray-500">
            {t("common.dateRange", "Date Range")}
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <CalendarDays size={15} className="text-[#4663ff] shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-transparent text-sm text-gray-700 outline-none"
            />
            <span className="text-gray-400">–</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-transparent text-sm text-gray-700 outline-none"
            />
          </div>
          <p className="text-xs text-gray-400">
            {t(
              "common.exportDateRangeHint",
              "Leave empty to export all records"
            )}
          </p>
        </div>

        <div className="space-y-2 mb-5">
          <label className="text-xs font-semibold uppercase  text-gray-500">
            {t("common.exportLanguage", "Document Language")}
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <Globe size={15} className="text-[#4663ff] shrink-0" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-transparent text-sm text-gray-700 outline-none"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {exportError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
            <AlertCircle size={14} />
            {exportError}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => handleExport("excel")}
            disabled={exporting}
            className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileSpreadsheet size={16} />
            )}
            {t("common.exportExcel", "Excel")}
          </button>

          <button
            onClick={() => handleExport("pdf")}
            disabled={exporting}
            className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-sm font-bold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            {t("common.exportPdf", "PDF")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ExportModal;
