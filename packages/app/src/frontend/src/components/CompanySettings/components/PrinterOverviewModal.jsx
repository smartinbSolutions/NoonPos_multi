// packages/app/src/renderer/features/settings/components/PrinterOverviewModal.jsx
import { createPortal } from "react-dom";
import {
  X,
  Printer,
  MonitorSmartphone,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import useAllPrinterSettings from "../hooks/useAllPrinterSettings";

function formatLastSeen(value, locale) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString(locale);
  } catch {
    return value;
  }
}

function TerminalRow({ terminal }) {
  const { t, i18n } = useTranslation();
  const printers = terminal.printers || [];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4663ff]/10 text-[#4663ff]">
            <MonitorSmartphone size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-800">
              {terminal.terminal_name ||
                t(
                  "screens.printerOverview.unnamedTerminal",
                  "Unnamed terminal",
                )}
            </p>
            <p className="text-[11px] text-gray-400">
              {t("screens.printerOverview.lastSeen", "Last seen")}:{" "}
              {formatLastSeen(terminal.last_seen_at, i18n.language) ||
                t("screens.printerOverview.never", "Never")}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[#eef3ff] px-2.5 py-1 text-[11px] font-bold text-[#4663ff]">
          {t("screens.printerOverview.printerCount", "{{count}} printer", {
            count: printers.length,
          })}
        </span>
      </div>

      {printers.length > 0 && (
        <div className="mt-3 space-y-2">
          {printers.map((printer) => (
            <div
              key={printer.id}
              className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Printer size={13} className="shrink-0 text-gray-400" />
                <span className="truncate text-xs font-bold text-gray-700">
                  {printer.label || printer.device_name}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {printer.is_default ? (
                  <span className="flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-indigo-700">
                    <CheckCircle2 size={10} />
                    {t("screens.printers.default", "Default")}
                  </span>
                ) : null}
                <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
                  {printer.paper_size}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {printers.length === 0 && (
        <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs font-bold text-gray-400">
          {t("screens.printerOverview.noPrinters", "No printer configured yet")}
        </p>
      )}
    </div>
  );
}

export default function PrinterOverviewModal({
  isOpen,
  onClose,
  administratorId,
}) {
  const { t } = useTranslation();
  const { terminals, loading, error, refresh } = useAllPrinterSettings({
    enabled: isOpen,
    administratorId,
  });

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1c2340]/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(28,35,64,0.35)]">
        <div className="flex items-center justify-between border-b border-[#e9edfb] bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_100%)] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#4663ff]/10 text-[#4663ff]">
              <MonitorSmartphone size={18} />
            </span>
            <div>
              <h2 className="text-base font-black text-slate-950">
                {t("screens.printerOverview.title", "Printer overview")}
              </h2>
              <p className="text-xs text-slate-500">
                {t(
                  "screens.printerOverview.subtitle",
                  "See every terminal's printer configuration in one place.",
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              title={t("common.refresh", "Refresh")}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-[#eef3ff] hover:text-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-[#eef3ff] hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error === "ADMIN_REQUIRED" ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700">
              {t(
                "screens.printerOverview.adminRequired",
                "Only administrators can view this screen.",
              )}
            </p>
          ) : error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700">
              {t("errors.loadFailed", "Load error")}
            </p>
          ) : loading ? (
            <p className="text-xs text-slate-400">{t("common.loading")}</p>
          ) : terminals.length === 0 ? (
            <p className="text-xs text-slate-400">
              {t("screens.printerOverview.empty", "No terminals seen yet.")}
            </p>
          ) : (
            <div className="space-y-3">
              {terminals.map((terminal) => (
                <TerminalRow key={terminal.device_id} terminal={terminal} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
