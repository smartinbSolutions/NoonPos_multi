import { createPortal } from "react-dom";
import {
  X,
  Printer,
  CheckCircle2,
  XCircle,
  Trash2,
  Search,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import usePrinterSettings from "../hooks/usePrinterSettings";

function PrinterCard({ printer, hook }) {
  const { t } = useTranslation();
  const {
    savingId,
    testingId,
    testResults,
    savePrinter,
    deletePrinter,
    testPrinter,
    setAsDefault,
    canSetDefault,
  } = hook;

  const isSaving = savingId === printer.device_name;
  const isTesting = testingId === printer.device_name;
  const result = testResults[printer.device_name];
  const canBeDefault = canSetDefault(printer.device_name);

  const update = (patch) => savePrinter({ ...printer, ...patch });

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-gray-800">
              {printer.device_name}
            </p>
            {printer.is_default ? (
              <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-indigo-700">
                {t("screens.printers.default", "Default")}
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => deletePrinter(printer.id, printer.device_name)}
          className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
          title={t("common.delete")}
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
            {t("screens.printers.paperSize", "Paper size")}
          </label>
          <select
            value={printer.paper_size}
            onChange={(e) => update({ paper_size: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="58mm">58mm</option>
            <option value="80mm">80mm</option>
            <option value="a4">A4</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
            {t("screens.printers.mode", "Mode")}
          </label>
          <select
            value={printer.backend}
            onChange={(e) => update({ backend: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="electron">
              {t("screens.printers.modeStandard", "Standard")}
            </option>
            <option value="raw_escpos">
              {t("screens.printers.modeCompat", "Compatibility mode")}
            </option>
          </select>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs font-bold text-gray-600">
        <input
          type="checkbox"
          checked={Boolean(printer.has_cutter)}
          onChange={(e) => update({ has_cutter: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
        />
        {t("screens.printers.hasCutter", "This printer has an auto-cutter")}
      </label>

      {result ? (
        <div
          className={`mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold ${
            result.success
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {result.success ? (
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          ) : (
            <XCircle size={14} className="mt-0.5 shrink-0" />
          )}
          <span className="break-words">
            {result.success
              ? t("screens.printers.testSuccess", "Test print sent")
              : result.error}
          </span>
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => testPrinter(printer.device_name)}
          disabled={isTesting || isSaving}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isTesting
            ? t("screens.printers.testing", "Testing...")
            : t("screens.printers.testPrint", "Test print")}
        </button>

        {!printer.is_default ? (
          <button
            type="button"
            onClick={() => setAsDefault(printer)}
            disabled={!canBeDefault || isSaving}
            title={
              canBeDefault
                ? undefined
                : t(
                    "screens.printers.testRequiredHint",
                    "Run a successful test print first",
                  )
            }
            className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("screens.printers.setDefault", "Set as default")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function PrinterSettingsModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const hook = usePrinterSettings({ enabled: isOpen });
  const {
    savedPrinters,
    detectedPrinters,
    detecting,
    loading,
    detectPrinters,
    addDetectedPrinter,
  } = hook;

  if (!isOpen) return null;

  const undetectedYet = detectedPrinters.filter(
    (p) => !savedPrinters.some((s) => s.device_name === p.name),
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#1c2340]/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(28,35,64,0.35)]">
        <div className="flex items-center justify-between border-b border-[#e9edfb] bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_100%)] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#4663ff]/10 text-[#4663ff]">
              <Printer size={18} />
            </span>
            <div>
              <h2 className="text-base font-black text-slate-950">
                {t("screens.printers.title", "Receipt printers")}
              </h2>
              <p className="text-xs text-slate-500">
                {t(
                  "screens.printers.hint",
                  "Detect a printer, run a test print, then set it as the default.",
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-[#eef3ff] hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <button
            type="button"
            onClick={detectPrinters}
            disabled={detecting}
            className="flex items-center gap-1.5 rounded-xl border border-[#4663ff]/20 bg-[#eef3ff] px-3 py-2 text-xs font-bold text-[#4663ff] transition hover:bg-[#4663ff]/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search size={14} />
            {detecting
              ? t("screens.printers.detecting", "Detecting...")
              : t("screens.printers.detect", "Detect printers")}
          </button>

          {undetectedYet.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {undetectedYet.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => addDetectedPrinter(p.name)}
                  className="rounded-md bg-[#eef3ff] px-2 py-1 text-[11px] font-bold text-[#4663ff] shadow-sm transition hover:bg-[#4663ff]/10"
                >
                  + {p.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-5">
            {loading ? (
              <p className="text-xs text-slate-400">{t("common.loading")}</p>
            ) : savedPrinters.length > 0 ? (
              <div className="space-y-3">
                {savedPrinters.map((printer) => (
                  <PrinterCard key={printer.id} printer={printer} hook={hook} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                {t("screens.printers.empty", "No printers configured yet.")}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-[#e9edfb] bg-[#f8faff] px-6 py-4">
          {/* <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-[#4663ff] px-6 py-2.5 text-sm font-black text-white shadow-[0_12px_32px_rgba(70,99,255,0.35)] transition hover:bg-[#3854e8]"
          >
            {t("common.done", "Done")}
          </button> */}
        </div>
      </div>
    </div>,
    document.body,
  );
}
