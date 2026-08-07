import { useEffect, useState } from "react";
import { Check, Clipboard, KeyRound, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function RecoveryKeyModal({ recoveryKey, onClose }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setCopied(false);
    setConfirmed(false);
  }, [recoveryKey]);

  if (!recoveryKey) return null;

  const copyKey = async () => {
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#1c2340]/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-key-title"
        className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-[#e9edfb] bg-white shadow-[0_30px_90px_rgba(38,54,148,0.18)]"
      >
        <div className="flex items-start gap-3 border-b border-[#e9edfb] bg-[#f8faff] px-6 py-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#4663ff]">
            <KeyRound size={22} />
          </div>
          <div>
            <h2
              id="recovery-key-title"
              className="text-lg font-black text-[#1c2340]"
            >
              {t("screens.recovery.newKeyTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("screens.recovery.displayOnce")}
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <span>{t("screens.recovery.noOfflineRecovery")}</span>
          </div>

          <div className="rounded-2xl border border-[#e9edfb] bg-[#f8faff] p-4">
            <code className="block break-all text-center text-lg font-black tracking-wide text-[#1c2340]">
              {recoveryKey}
            </code>
          </div>

          <button
            type="button"
            onClick={copyKey}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#4663ff] bg-white text-sm font-bold text-[#4663ff] transition hover:bg-[#eef3ff]"
          >
            {copied ? <Check size={17} /> : <Clipboard size={17} />}
            {copied
              ? t("screens.recovery.copied")
              : t("screens.recovery.copyKey")}
          </button>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#e9edfb] p-3 text-sm text-slate-700 transition hover:bg-[#f8faff]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#4663ff]"
            />
            <span>{t("screens.recovery.copyConfirmation")}</span>
          </label>
        </div>

        <div className="border-t border-[#e9edfb] bg-[#f8faff] px-6 py-4">
          <button
            type="button"
            disabled={!confirmed}
            onClick={onClose}
            className="h-11 w-full rounded-2xl bg-[#4663ff] text-sm font-black text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#4663ff]"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
