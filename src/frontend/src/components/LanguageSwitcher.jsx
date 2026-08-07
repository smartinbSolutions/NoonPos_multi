import { Globe2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { languages } from "../i18n";

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-2 text-xs text-gray-300">
      <Globe2 size={16} className="shrink-0 text-gray-400" />
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={i18n.language}
        onChange={(event) => i18n.changeLanguage(event.target.value)}
        className="w-full bg-transparent text-xs outline-none"
        aria-label={t("common.language")}
      >
        {languages.map((language) => (
          <option key={language.code} value={language.code} className="text-gray-900">
            {t(language.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
