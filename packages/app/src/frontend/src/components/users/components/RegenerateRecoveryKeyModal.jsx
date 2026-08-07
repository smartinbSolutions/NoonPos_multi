import { useEffect, useState } from "react";
import {
  AlertCircle,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export default function RegenerateRecoveryKeyModal({
  open,
  administratorId,
  onClose,
  onSuccess,
}) {
  const { t } = useTranslation();
  const [administratorPin, setAdministratorPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAdministratorPin("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (!/^\d{6}$/.test(administratorPin)) {
      setError(t("errors.pinInvalid"));
      return;
    }

    setSaving(true);
    try {
      const result = await window.api.regenerateRecoveryKey({
        administratorId,
        administratorPin,
      });

      if (result?.success) {
        onSuccess(result.recoveryKey);
        return;
      }

      setError(result?.error || t("screens.recovery.genericError"));
    } catch (err) {
      setError(err?.message || t("screens.recovery.genericError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1c2340]/60 backdrop-blur-sm"
        onClick={saving ? undefined : onClose}
      />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="regenerate-key-title"
        className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-[#e9edfb] bg-white shadow-[0_30px_90px_rgba(38,54,148,0.18)]"
      >
        {/* Header — icon in amber, since this whole action is a warning-class action, not a routine one */}
        <div className="flex items-start justify-between gap-4 border-b border-[#e9edfb] bg-[#fffaf0] px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <ShieldAlert size={22} />
            </div>
            <div>
              <h2
                id="regenerate-key-title"
                className="text-lg font-black text-[#1c2340]"
              >
                {t("screens.recovery.regenerateTitle")}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("screens.recovery.regenerateNotice")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label={t("common.close")}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* What happens — spelled out as consequences, not a vague hint */}
          <div>
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-amber-700">
              {t("screens.recovery.whatHappensSection", "What this does")}
            </p>
            <ul className="space-y-1.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-600" />
                {t(
                  "screens.recovery.consequenceOldKeyDies",
                  "Your current recovery key stops working immediately."
                )}
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-600" />
                {t(
                  "screens.recovery.consequenceOneChance",
                  "The new key is shown once — save it somewhere safe."
                )}
              </li>
            </ul>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Confirmation — the actual gate */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-[#4663ff]">
              <ShieldCheck size={13} />
              {t("screens.recovery.confirmSection", "Confirm it's you")}
            </p>
            <label>
              <span className="mb-1.5 block text-xs font-bold text-slate-600">
                {t("screens.users.yourPin")}
              </span>
              <input
                autoFocus
                required
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={administratorPin}
                onChange={(event) => {
                  setAdministratorPin(event.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                placeholder={t("screens.users.pinPlaceholder")}
                className="h-12 w-full rounded-2xl border border-[#e9edfb] bg-white px-3.5 text-center font-mono text-lg tracking-[0.3em] outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10"
              />
            </label>
          </div>
        </div>

        <div className="flex gap-3 border-t border-[#e9edfb] bg-[#f8faff] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-11 flex-1 rounded-2xl border border-[#e9edfb] bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving || administratorPin.length !== 6}
            className="h-11 flex-1 rounded-2xl bg-amber-600 text-sm font-black text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? t("common.saving")
              : t("screens.recovery.regenerateConfirm", "Yes, regenerate key")}
          </button>
        </div>
      </form>
    </div>
  );
}
