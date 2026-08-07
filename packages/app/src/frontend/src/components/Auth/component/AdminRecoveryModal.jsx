import { useState } from "react";
import { AlertCircle, KeyRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function AdminRecoveryModal({ open, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    username: "",
    recoveryKey: "",
    newPin: "",
    confirmPin: "",
  });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(form.newPin) || form.newPin !== form.confirmPin) {
      setError(t("screens.recovery.pinError"));
      return;
    }
    setSaving(true);
    const result = await window.api.recoverAdminPin(form);
    setSaving(false);
    if (result?.success) setDone(true);
    else setError(t("screens.recovery.genericError"));
  };

  const inputClass =
    "h-11 w-full rounded-2xl border border-[#e9edfb] bg-white px-3 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1c2340]/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-[28px] border border-[#e9edfb] bg-white p-6 shadow-[0_30px_90px_rgba(38,54,148,0.18)]">
        <button
          onClick={onClose}
          className="absolute end-4 top-4 rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
        >
          <X size={18} />
        </button>

        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#4663ff]">
          <KeyRound size={20} />
        </div>
        <h2 className="text-xl font-black text-[#1c2340]">
          {t("screens.recovery.title")}
        </h2>

        {done ? (
          <div className="mt-4">
            <p className="text-sm text-emerald-700">
              {t("screens.recovery.success")}
            </p>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-2xl bg-[#4663ff] py-3 text-sm font-black text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8]"
            >
              {t("screens.recovery.returnToLogin")}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <p className="text-sm text-slate-500">
              {t("screens.recovery.regularUserNotice")}
            </p>
            {error && (
              <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </p>
            )}
            <input
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder={t("screens.recovery.adminUsername")}
              className={inputClass}
            />
            <input
              required
              type="password"
              value={form.recoveryKey}
              onChange={(e) =>
                setForm({ ...form, recoveryKey: e.target.value.trim() })
              }
              placeholder={t("screens.recovery.recoveryKey")}
              className={inputClass}
            />
            <input
              required
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={form.newPin}
              onChange={(e) => setForm({ ...form, newPin: e.target.value })}
              placeholder={t("screens.recovery.newPin")}
              className={inputClass}
            />
            <input
              required
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={form.confirmPin}
              onChange={(e) => setForm({ ...form, confirmPin: e.target.value })}
              placeholder={t("screens.recovery.confirmPin")}
              className={inputClass}
            />
            <button
              disabled={saving}
              className="w-full rounded-2xl bg-[#4663ff] py-3 text-sm font-black text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? t("common.saving") : t("screens.recovery.resetPin")}
            </button>
            <p className="text-xs text-slate-400">
              {t("screens.recovery.noOfflineRecovery")}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
