import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Globe,
  Save,
  Image as ImageIcon,
  Clock,
} from "lucide-react";
import useUpdateCompanySettings from "../hooks/useUpdateCompanySettings";
import { getAssetUrl } from "../../../Global/assetUrl";
import { useTranslation } from "react-i18next";
import { ToastContainer } from "react-toastify";
import { COUNTRIES } from "../../../Global/countries";

export default function CompanyGeneralInfo() {
  const { t } = useTranslation();
  const { handleSave, handleLogo, handleChange, form, saving, loading } =
    useUpdateCompanySettings();

  const inputClass =
    "w-full pl-10 pr-4 h-11 rounded-2xl border border-[#e9edfb] bg-white text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";
  const plainInputClass =
    "w-full h-11 rounded-2xl border border-[#e9edfb] bg-white px-4 text-sm outline-none transition focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10";
  const labelClass = "mb-1.5 block text-xs font-bold text-slate-500";
  const sectionLabelClass =
    "mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-[#4663ff]";

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#4663ff]">
            {t("ui.setup")}
          </p>
          <h1 className="text-2xl font-black text-slate-950">
            {t("screens.company.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("screens.company.subtitle")}
          </p>
        </div>

        <div className="space-y-4">
          {/* Identity card — logo + name, the "who you are" summary */}
          <div className="overflow-hidden rounded-[28px] border border-[#e9edfb] bg-white shadow-[0_18px_60px_rgba(70,99,255,0.08)]">
            <div className="flex items-center gap-5 p-6">
              <label className="group relative cursor-pointer">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-[#e9edfb] bg-[#f8faff] transition group-hover:border-[#4663ff]/40">
                  {form.logo ? (
                    <img
                      src={getAssetUrl(form.logo)}
                      alt={t("screens.setupPage.logo")}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={30} className="text-slate-300" />
                  )}
                </div>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-[#1c2340]/0 text-[10px] font-bold text-white opacity-0 transition group-hover:bg-[#1c2340]/50 group-hover:opacity-100">
                  {t("common.change", "Change")}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogo}
                />
              </label>

              <div className="min-w-0">
                <h2 className="truncate text-xl font-black text-slate-950">
                  {form.company_name || t("screens.company.fallbackName")}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t("screens.company.companyGeneralInfo")}
                </p>
              </div>
            </div>
          </div>

          {/* Company details */}
          <div className="rounded-[28px] border border-[#e9edfb] bg-white p-6 shadow-[0_18px_60px_rgba(70,99,255,0.08)]">
            <p className={sectionLabelClass}>
              <Building2 size={13} />
              {t("screens.company.detailsSection", "Company details")}
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  {t("screens.company.companyName")}
                </label>
                <div className="relative">
                  <Building2
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-350"
                  />
                  <input
                    name="company_name"
                    value={form.company_name}
                    onChange={handleChange}
                    placeholder={t("screens.company.companyName")}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>{t("ui.latinName")}</label>
                <div className="relative">
                  <Globe
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-350"
                  />
                  <input
                    name="company_latin_name"
                    value={form.company_latin_name}
                    onChange={handleChange}
                    placeholder={t("ui.latinName")}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>{t("ui.address")}</label>
                <div className="relative">
                  <MapPin
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-350"
                  />
                  <input
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    placeholder={t("screens.company.companyAddress")}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  {t("ui.country")} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <MapPin
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-350"
                  />
                  <select
                    name="country"
                    value={form.country || ""}
                    // onChange={handleChange}
                    className={inputClass}
                    disabled
                  >
                    <option value="" disabled>
                      {t("screens.setupPage.selectCountry")}
                    </option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="rounded-[28px] border border-[#e9edfb] bg-white p-6 shadow-[0_18px_60px_rgba(70,99,255,0.08)]">
            <p className={sectionLabelClass}>
              <Phone size={13} />
              {t("screens.company.contactSection", "Contact")}
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>{t("ui.phone")}</label>
                <div className="relative">
                  <Phone
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-350"
                  />
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder={t("screens.company.phoneNumber")}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>{t("ui.email")}</label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-350"
                  />
                  <input
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder={t("screens.company.emailAddress")}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Regional preferences */}
          <div className="rounded-[28px] border border-[#e9edfb] bg-white p-6 shadow-[0_18px_60px_rgba(70,99,255,0.08)]">
            <p className={sectionLabelClass}>
              <Globe size={13} />
              {t("screens.company.regionalSection", "Regional preferences")}
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>{t("common.language")}</label>
                <select
                  name="language"
                  value={form.language}
                  onChange={handleChange}
                  className={plainInputClass}
                >
                  <option value="en">{t("languages.en")}</option>
                  <option value="ar">{t("languages.ar")}</option>
                  <option value="tr">{t("languages.tr")}</option>
                </select>
                <p className="mt-1.5 text-xs text-slate-400">
                  {t(
                    "screens.company.languageHint",
                    "Also switches the app's interface language once saved."
                  )}
                </p>
              </div>

              <div>
                <label className={labelClass}>{t("ui.timezone")}</label>
                <div className="relative">
                  <Clock
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-350"
                  />
                  <input
                    name="timezone"
                    value={form.timezone}
                    onChange={handleChange}
                    placeholder={t("ui.timezone")}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky save bar */}
        <div className="sticky bottom-4 mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-2xl bg-[#4663ff] px-6 py-3 text-sm font-black text-white shadow-[0_12px_32px_rgba(70,99,255,0.35)] transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? t("common.saving") : t("screens.company.saveSettings")}
          </button>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}
