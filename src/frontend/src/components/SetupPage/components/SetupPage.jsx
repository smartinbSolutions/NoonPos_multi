import {
  AlertCircle,
  Check,
  Phone,
  Mail,
  MapPin,
  Save,
  Camera,
  KeyRound,
  User,
  Languages,
  ArrowLeft,
  ArrowRight,
  X,
  Eye,
  EyeOff,
  Search,
  Loader2,
} from "lucide-react";
import useSetupPage, { STEPS } from "../hooks/useSetupPage";
import appLogo from "../../../assets/logo.png";
import { getAssetUrl } from "../../../Global/assetUrl";
import { useTranslation } from "react-i18next";
import RecoveryKeyModal from "../../Auth/component/RecoveryKeyModal";

const LANGUAGES = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
];

export default function CompanySettings({ onSetupComplete }) {
  const { t } = useTranslation();
  const {
    countries,
    step,
    furthestStep,
    goNext,
    goBack,
    goToStep,
    handleSave,
    currencies,
    currencyQuery,
    setCurrencyQuery,
    loading,
    handleLogo,
    handleLogoDrop,
    removeLogo,
    dragActive,
    setDragActive,
    handleCurrencySelect,
    handleLanguageSelect,
    handleChange,
    fileInputRef,
    saving,
    errors,
    form,
    showPin,
    setShowPin,
    showPinConfirm,
    setShowPinConfirm,
    recoveryKey,
    completeRecoveryKeyDisplay,
  } = useSetupPage({ onSetupComplete });

  const isRtl = form.language === "ar";

  const inputClass =
    "h-10 w-full rounded-lg border border-[#dbe4ff] bg-white/90 px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";
  const errorInputClass =
    "border-red-300 bg-red-50/60 focus:border-red-400 focus:ring-red-100";
  const labelClass =
    "mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600";
  const requiredMark = <span className="text-red-500">*</span>;
  const fieldClass = (name) =>
    `${inputClass} ${errors[name] ? errorInputClass : ""}`;
  const errorText = (name) =>
    errors[name] ? (
      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
        <AlertCircle size={12} />
        {errors[name]}
      </p>
    ) : null;

  const stepLabels = {
    language: t("screens.setupPage.language"),
    profile: t("screens.setupPage.profile"),
    contact: t("screens.setupPage.contact"),
    admin: t("screens.setupPage.adminAccount"),
    currency: t("screens.setupPage.baseCurrency"),
  };

  const pinsMatch =
    form.admin_pin &&
    form.admin_pin_confirm &&
    form.admin_pin === form.admin_pin_confirm &&
    /^\d{6}$/.test(form.admin_pin);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#eef3ff]">
        <div className="flex flex-col items-center gap-4">
          <img
            src={appLogo}
            alt={t("app.name")}
            className="h-16 w-16 rounded-2xl"
          />
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#cbd7ff] border-t-[#4663ff]" />
        </div>
      </div>
    );
  }

  const isLast = step === STEPS.length - 1;

  return (
    <>
      <main className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] px-4 py-5 text-slate-900 sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-3xl flex-col justify-center">
          <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/80 shadow-[0_20px_60px_rgba(70,99,255,0.12)] backdrop-blur">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-[#e5ebff] bg-[#f8faff] px-6 py-5">
              <img
                src={appLogo}
                alt={t("screens.setupPage.title")}
                className="h-10 w-10 rounded-xl shadow-sm"
              />
              <div>
                <p className="text-[10px] font-bold uppercase  text-[#4663ff]">
                  {t("app.name")}
                </p>
                <h1 className="text-lg font-black leading-tight text-slate-950">
                  {t("screens.setupPage.title")}
                </h1>
              </div>
            </div>

            {/* Progress stepper */}
            <div className="border-b border-[#e5ebff] bg-white px-6 py-4">
              <div className="flex items-center">
                {STEPS.map((key, i) => {
                  const isDone = i < step;
                  const isCurrent = i === step;
                  const isReachable = i <= furthestStep;

                  return (
                    <div key={key} className="flex flex-1 items-center">
                      <button
                        type="button"
                        onClick={() => isReachable && goToStep(i)}
                        disabled={!isReachable}
                        className="flex flex-col items-center gap-1.5 focus:outline-none"
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black transition ${
                            isDone
                              ? "bg-[#4663ff] text-white"
                              : isCurrent
                                ? "bg-[#4663ff] text-white ring-4 ring-[#4663ff]/15"
                                : "bg-[#eef3ff] text-slate-400"
                          } ${isReachable && !isCurrent ? "cursor-pointer hover:ring-2 hover:ring-[#4663ff]/20" : ""}`}
                        >
                          {isDone ? <Check size={14} /> : i + 1}
                        </span>
                        <span
                          className={`hidden text-[10px] font-semibold sm:block ${
                            isCurrent ? "text-[#4663ff]" : "text-slate-400"
                          }`}
                        >
                          {stepLabels[key]}
                        </span>
                      </button>
                      {i < STEPS.length - 1 && (
                        <span
                          className={`mx-1.5 h-0.5 flex-1 rounded-full transition ${
                            i < step ? "bg-[#4663ff]" : "bg-[#eef3ff]"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step content */}
            <div
              key={step}
              className="min-h-[340px] animate-[stepIn_0.25s_ease] p-6 sm:p-7"
            >
              <style>{`
                @keyframes stepIn {
                  from { opacity: 0; transform: translateY(6px); }
                  to { opacity: 1; transform: translateY(0); }
                }
              `}</style>

              {/* Step: language */}
              {STEPS[step] === "language" && (
                <div>
                  <h2 className="mb-1 text-base font-black text-slate-950">
                    {t("screens.setupPage.languagePrompt")}
                  </h2>
                  <p className="mb-5 text-xs text-slate-500">
                    {t("screens.setupPage.languageHint")}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {LANGUAGES.map((lang) => {
                      const active = form.language === lang.code;
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => handleLanguageSelect(lang.code)}
                          className={`relative flex flex-col items-center gap-2 rounded-xl border p-5 transition ${
                            active
                              ? "border-[#4663ff] bg-[#4663ff] text-white shadow-md shadow-[#4663ff]/20"
                              : "border-[#e5ebff] bg-[#f8faff] text-slate-700 hover:border-[#b9c6ff]"
                          }`}
                        >
                          {active && (
                            <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-white/20">
                              <Check size={10} />
                            </span>
                          )}
                          <Languages
                            size={20}
                            className={active ? "" : "text-[#4663ff]/60"}
                          />
                          <span className="text-sm font-bold">
                            {lang.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step: profile */}
              {STEPS[step] === "profile" && (
                <div>
                  <h2 className="mb-5 text-base font-black text-slate-950">
                    {t("screens.setupPage.companyProfile")}
                  </h2>

                  <div className="mb-4 grid gap-3 md:grid-cols-2">
                    <label>
                      <span className={labelClass}>
                        {t("screens.company.companyName")} {requiredMark}
                      </span>
                      <input
                        name="company_name"
                        value={form.company_name}
                        onChange={handleChange}
                        placeholder={t("screens.company.companyName")}
                        className={fieldClass("company_name")}
                        autoFocus
                      />
                      {errorText("company_name")}
                    </label>

                    <label>
                      <span className={labelClass}>{t("ui.latinName")}</span>
                      <input
                        name="company_latin_name"
                        value={form.company_latin_name}
                        onChange={handleChange}
                        placeholder={t("ui.latinName")}
                        className={inputClass}
                      />
                    </label>
                  </div>

                  <span className={labelClass}>
                    {t("screens.setupPage.logo")}
                  </span>
                  <div
                    onClick={() => fileInputRef.current.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleLogoDrop}
                    className={`group relative flex h-28 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition ${
                      dragActive
                        ? "border-[#4663ff] bg-[#eef3ff]"
                        : "border-[#dbe4ff] bg-[#f8faff] hover:border-[#b9c6ff]"
                    }`}
                  >
                    {form.logo ? (
                      <>
                        <img
                          src={getAssetUrl(form.logo)}
                          alt={t("screens.setupPage.logo")}
                          className="max-h-full max-w-[70%] object-contain"
                        />
                        <button
                          type="button"
                          onClick={removeLogo}
                          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow hover:text-red-500"
                        >
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-slate-400">
                        <Camera size={20} className="text-[#4663ff]/50" />
                        <span className="text-[11px] font-medium">
                          {t("screens.setupPage.logoDropHint")}
                        </span>
                      </div>
                    )}
                    <input
                      type="file"
                      hidden
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleLogo}
                    />
                  </div>
                </div>
              )}

              {/* Step: contact */}

              {STEPS[step] === "contact" && (
                <div>
                  <h2 className="mb-5 text-base font-black text-slate-950">
                    {t("screens.setupPage.contactDetails")}
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label>
                      <span className={labelClass}>
                        <Phone size={12} />
                        {t("ui.phone")} {requiredMark}
                      </span>
                      <input
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder={t("ui.phone")}
                        className={fieldClass("phone")}
                        autoFocus
                      />
                      {errorText("phone")}
                    </label>

                    <label>
                      <span className={labelClass}>
                        <Mail size={12} />
                        {t("ui.email")}
                      </span>
                      <input
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder={t("ui.email")}
                        className={fieldClass("email")}
                      />
                      {errorText("email")}
                    </label>

                    <label>
                      <span className={labelClass}>
                        <MapPin size={12} />
                        {t("ui.country")} {requiredMark}
                      </span>
                      <select
                        name="country"
                        value={form.country}
                        onChange={handleChange}
                        className={fieldClass("country")}
                      >
                        <option value="" disabled>
                          {t("screens.setupPage.selectCountry")}
                        </option>
                        {countries.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {errorText("country")}
                    </label>

                    <label className="md:col-span-2">
                      <span className={labelClass}>
                        <MapPin size={12} />
                        {t("ui.address")}
                      </span>
                      <textarea
                        name="address"
                        value={form.address}
                        onChange={handleChange}
                        placeholder={t("ui.address")}
                        className={`${fieldClass("address")} h-20 resize-none py-2`}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Step: admin */}
              {STEPS[step] === "admin" && (
                <div>
                  <h2 className="text-base font-black text-slate-950">
                    {t("screens.setupPage.adminAccount")}
                  </h2>
                  <p className="mb-5 text-xs text-slate-500">
                    {t("screens.setupPage.adminAccountHint")}
                  </p>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label>
                      <span className={labelClass}>
                        <User size={12} />
                        {t("screens.setupPage.adminUsername")} {requiredMark}
                      </span>
                      <input
                        name="admin_username"
                        value={form.admin_username}
                        onChange={handleChange}
                        placeholder={t("screens.setupPage.adminUsername")}
                        className={fieldClass("admin_username")}
                        autoFocus
                      />
                      {errorText("admin_username")}
                    </label>

                    <label>
                      <span className={labelClass}>
                        <KeyRound size={12} />
                        {t("screens.setupPage.adminPin")} {requiredMark}
                      </span>
                      <div className="relative">
                        <input
                          name="admin_pin"
                          type={showPin ? "text" : "password"}
                          inputMode="numeric"
                          maxLength={6}
                          value={form.admin_pin}
                          onChange={handleChange}
                          placeholder="••••••"
                          className={`${fieldClass("admin_pin")} pr-9`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin((s) => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      {errorText("admin_pin")}
                    </label>

                    <label>
                      <span className={labelClass}>
                        <KeyRound size={12} />
                        {t("screens.setupPage.adminPinConfirm")} {requiredMark}
                      </span>
                      <div className="relative">
                        <input
                          name="admin_pin_confirm"
                          type={showPinConfirm ? "text" : "password"}
                          inputMode="numeric"
                          maxLength={6}
                          value={form.admin_pin_confirm}
                          onChange={handleChange}
                          placeholder="••••••"
                          className={`${fieldClass("admin_pin_confirm")} pr-9`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPinConfirm((s) => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPinConfirm ? (
                            <EyeOff size={15} />
                          ) : (
                            <Eye size={15} />
                          )}
                        </button>
                      </div>
                      {errorText("admin_pin_confirm")}
                    </label>
                  </div>

                  {pinsMatch && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                      <Check size={13} />
                      {t("screens.setupPage.pinsMatch")}
                    </p>
                  )}
                </div>
              )}

              {/* Step: currency */}
              {STEPS[step] === "currency" && (
                <div>
                  <h2 className="mb-5 text-base font-black text-slate-950">
                    {t("screens.setupPage.baseCurrency")} {requiredMark}
                  </h2>

                  <div className="relative mb-4">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      value={currencyQuery}
                      onChange={(e) => setCurrencyQuery(e.target.value)}
                      placeholder={t("screens.setupPage.searchCurrency")}
                      className={`${inputClass} pl-9`}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {currencies.map((c) => {
                      const active = form.base_currency_id === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleCurrencySelect(c)}
                          className={`relative rounded-xl border p-2.5 text-end transition ${
                            active
                              ? "border-[#4663ff] bg-[#4663ff] text-white shadow-md shadow-[#4663ff]/20"
                              : "border-[#e5ebff] bg-[#f8faff] text-slate-700 hover:border-[#b9c6ff]"
                          }`}
                        >
                          {active && (
                            <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/20">
                              <Check size={10} />
                            </span>
                          )}
                          <div className="text-lg font-black">{c.symbol}</div>
                          <div className="mt-0.5 text-xs font-bold">
                            {c.code}
                          </div>
                        </button>
                      );
                    })}
                    {currencies.length === 0 && (
                      <p className="col-span-full py-4 text-center text-xs text-slate-400">
                        {t("screens.setupPage.noCurrencyMatch")}
                      </p>
                    )}
                  </div>
                  {errorText("base_currency_id")}
                </div>
              )}
            </div>

            {/* Footer nav */}
            <div className="flex items-center justify-between border-t border-[#e5ebff] bg-white/90 px-6 py-4">
              <button
                onClick={goBack}
                disabled={step === 0}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-slate-500 transition hover:bg-[#eef3ff] disabled:cursor-not-allowed disabled:opacity-0"
              >
                {isRtl ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}
                {t("common.back")}
              </button>

              <span className="text-[11px] font-semibold text-slate-400">
                {t("screens.setupPage.stepOf", {
                  current: step + 1,
                  total: STEPS.length,
                })}
              </span>

              {isLast ? (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#4663ff] px-5 text-sm font-bold text-white shadow-md shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  {saving
                    ? t("common.saving")
                    : t("screens.setupPage.saveSetup")}
                </button>
              ) : (
                <button
                  onClick={goNext}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#4663ff] px-5 text-sm font-bold text-white shadow-md shadow-[#4663ff]/20 transition hover:bg-[#3854e8]"
                >
                  {t("common.next")}
                  {isRtl ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
      <RecoveryKeyModal
        recoveryKey={recoveryKey}
        onClose={completeRecoveryKeyDisplay}
      />
    </>
  );
}
