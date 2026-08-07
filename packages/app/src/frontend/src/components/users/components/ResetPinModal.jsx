import { useEffect, useState } from "react";
import { AlertCircle, KeyRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ResetPinModal({
  user,
  administratorId,
  onClose,
  onSuccess,
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    administratorPin: "",
    newPin: "",
    confirmPin: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setForm({ administratorPin: "", newPin: "", confirmPin: "" });
    setError("");
  }, [user]);
  if (!user) return null;

  const inputClass =
    "h-11 w-full rounded-2xl border border-[#e9edfb] bg-white px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(form.newPin) || form.newPin !== form.confirmPin)
      return setError(t("screens.recovery.pinError"));
    setSaving(true);
    const result = await window.api.resetUserPin({
      userId: user.id,
      administratorId,
      administratorPin: form.administratorPin,
      newPin: form.newPin,
    });
    setSaving(false);
    if (result?.success) onSuccess();
    else
      setError(
        result?.error || t("errors.updateFailed", { field: t("ui.user") })
      );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1c2340]/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-[#e9edfb] bg-white shadow-[0_30px_90px_rgba(38,54,148,0.18)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e9edfb] bg-[#f8faff] px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#4663ff]">
              <KeyRound size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#1c2340]">
                {t("screens.users.resetPinTitle", { name: user.username })}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("screens.users.resetPinNotice")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-[#4663ff]">
              {t("screens.users.yourAuthorization", "Your authorization")}
            </p>
            <input
              required
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={form.administratorPin}
              onChange={(e) =>
                setForm({ ...form, administratorPin: e.target.value })
              }
              placeholder={t("screens.users.yourPin")}
              className={inputClass}
            />
          </div>

          <div className="h-px bg-[#eef1ff]" />

          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-[#4663ff]">
              {t("screens.users.newPinSection", "New PIN")}
            </p>
            <div className="grid grid-cols-2 gap-3">
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
                onChange={(e) =>
                  setForm({ ...form, confirmPin: e.target.value })
                }
                placeholder={t("screens.recovery.confirmPin")}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-[#e9edfb] bg-[#f8faff] px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-11 rounded-2xl border border-[#e9edfb] bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#4663ff] px-5 text-sm font-black text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("screens.users.resetPin")}
          </button>
        </div>
      </form>
    </div>
  );
}
