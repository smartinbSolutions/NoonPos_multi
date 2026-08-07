import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ar from "./locales/ar.json";
import tr from "./locales/tr.json";

export const languages = [
  { code: "en", labelKey: "languages.en", dir: "ltr" },
  { code: "ar", labelKey: "languages.ar", dir: "rtl" },
  { code: "tr", labelKey: "languages.tr", dir: "ltr" },
];

const resources = {
  en: { translation: en },
  ar: { translation: ar },
  tr: { translation: tr },
};

const savedLanguage = localStorage.getItem("language");
const defaultLanguage = languages.some((language) => language.code === savedLanguage)
  ? savedLanguage
  : "en";

i18n.use(initReactI18next).init({
  resources,
  lng: defaultLanguage,
  fallbackLng: "en",
  supportedLngs: languages.map((language) => language.code),
  interpolation: {
    escapeValue: false,
  },
});

const applyDocumentLanguage = (languageCode) => {
  const language = languages.find((item) => item.code === languageCode) || languages[0];

  document.documentElement.lang = language.code;
  document.documentElement.dir = language.dir;
  localStorage.setItem("language", language.code);
};

applyDocumentLanguage(defaultLanguage);
i18n.on("languageChanged", applyDocumentLanguage);

export default i18n;
