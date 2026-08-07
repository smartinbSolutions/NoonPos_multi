import { useEffect, useState } from "react";
import {
  AlertCircle,
  KeyRound,
  Save,
  ShieldCheck,
  User,
  UserCog,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

const emptyForm = {
  username: "",
  full_name: "",
  role: "pos",
  pin: "",
  pin_confirm: "",
};

const UserFormModal = ({
  open,
  onClose,
  onSubmit,
  user,
  saving,
  actionError,
}) => {
  const { t } = useTranslation();
  const isEdit = Boolean(user);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(
        user
          ? {
              username: user.username || "",
              full_name: user.full_name || "",
              role: user.role || "pos",
              pin: "",
              pin_confirm: "",
            }
          : emptyForm
      );
      setErrors({});
    }
  }, [open, user]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const inputClass =
    "h-11 w-full rounded-2xl border border-[#e9edfb] bg-white px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";
  const errorInputClass =
    "border-red-300 bg-red-50/60 focus:border-red-400 focus:ring-red-100";
  const labelClass =
    "mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-600";
  const fieldClass = (name) =>
    `${inputClass} ${errors[name] ? errorInputClass : ""}`;
  const sectionLabelClass =
    "mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-[#4663ff]";

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((er) => ({ ...er, [name]: "" }));
  };

  const validate = () => {
    const next = {};
    if (!form.username.trim())
      next.username = t("errors.valueRequired", { field: t("ui.username") });

    if (!isEdit || form.pin) {
      if (!/^\d{6}$/.test(form.pin || "")) next.pin = t("errors.pinInvalid");
      if (form.pin !== form.pin_confirm)
        next.pin_confirm = t("errors.pinMismatch");
    }

    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    await onSubmit({
      username: form.username.trim(),
      full_name: form.full_name.trim(),
      role: form.role,
      ...(form.pin ? { pin: form.pin } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[#1c2340]/60 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-[28px] border border-[#e9edfb] bg-white shadow-[0_30px_90px_rgba(38,54,148,0.18)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e9edfb] bg-[#f8faff] px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#4663ff]">
              <UserCog size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#1c2340]">
                {isEdit
                  ? t("screens.users.editTitle")
                  : t("screens.users.createTitle")}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {isEdit
                  ? t("screens.users.editSubtitle")
                  : t("screens.users.createSubtitle")}
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

        <form onSubmit={handleSubmit}>
          <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
            {actionError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
                <AlertCircle size={16} className="shrink-0" />
                {actionError}
              </div>
            )}

            {/* Section: identity */}
            <div>
              <p className={sectionLabelClass}>
                <User size={13} />
                {t("screens.users.identitySection", "Identity")}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 sm:col-span-1">
                  <span className={labelClass}>
                    {t("screens.users.username")}
                  </span>
                  <input
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    placeholder={t("screens.users.username")}
                    className={fieldClass("username")}
                  />
                  {errors.username && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                      <AlertCircle size={12} />
                      {errors.username}
                    </p>
                  )}
                </label>

                <label className="col-span-2 sm:col-span-1">
                  <span className={labelClass}>
                    {t("screens.users.fullName")}
                  </span>
                  <input
                    name="full_name"
                    value={form.full_name}
                    onChange={handleChange}
                    placeholder={t("screens.users.fullName")}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>

            <div className="h-px bg-[#eef1ff]" />

            {/* Section: access */}
            <div>
              <p className={sectionLabelClass}>
                <ShieldCheck size={13} />
                {t("screens.users.accessSection", "Access level")}
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                {["admin", "pos"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, role: r }))}
                    className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border text-sm font-bold transition ${
                      form.role === r
                        ? "border-[#4663ff] bg-[#4663ff] text-white shadow-md shadow-[#4663ff]/25"
                        : "border-[#e9edfb] bg-white text-slate-600 hover:border-[#b9c6ff] hover:bg-[#f6f8fd]"
                    }`}
                  >
                    {t(`screens.users.role_${r}`)}
                    <span
                      className={`text-[10px] font-medium ${
                        form.role === r ? "text-white/80" : "text-slate-400"
                      }`}
                    >
                      {r === "admin"
                        ? t("screens.users.roleAdminHint", "Full access")
                        : t("screens.users.rolePosHint", "Checkout only")}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {!isEdit && (
              <>
                <div className="h-px bg-[#eef1ff]" />

                {/* Section: PIN */}
                <div>
                  <p className={sectionLabelClass}>
                    <KeyRound size={13} />
                    {t("screens.users.pinSection", "Login PIN")}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className={labelClass}>
                        {t("screens.users.pin")}
                      </span>
                      <input
                        name="pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={form.pin}
                        onChange={handleChange}
                        placeholder={t("screens.users.pinPlaceholder")}
                        className={fieldClass("pin")}
                      />
                      {errors.pin && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                          <AlertCircle size={12} />
                          {errors.pin}
                        </p>
                      )}
                    </label>

                    <label>
                      <span className={labelClass}>
                        {t("screens.users.pinConfirm")}
                      </span>
                      <input
                        name="pin_confirm"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={form.pin_confirm}
                        onChange={handleChange}
                        placeholder={t("screens.users.pinPlaceholder")}
                        className={fieldClass("pin_confirm")}
                      />
                      {errors.pin_confirm && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                          <AlertCircle size={12} />
                          {errors.pin_confirm}
                        </p>
                      )}
                    </label>
                  </div>
                </div>
              </>
            )}
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
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#4663ff] px-5 text-sm font-black text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserFormModal;
