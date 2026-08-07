import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { COUNTRIES } from "../../../Global/countries";

const currencies = [
  {
    id: "1",
    name: "Syrian Pound",
    code: "SYP",
    symbol: "\u00a3",
    minorName: "قرش",
    minorLatinName: "Piastre",
  },
  {
    id: "2",
    name: "US Dollar",
    code: "USD",
    symbol: "$",
    minorName: "سنت",
    minorLatinName: "Cent",
  },
  {
    id: "3",
    name: "Turkish Lira",
    code: "TRY",
    symbol: "\u20ba",
    minorName: "كوروش",
    minorLatinName: "Kuruş",
  },
  {
    id: "4",
    name: "Euro",
    code: "EUR",
    symbol: "\u20ac",
    minorName: "سنت",
    minorLatinName: "Cent",
  },
  {
    id: "5",
    name: "British Pound",
    code: "GBP",
    symbol: "\u00a3",
    minorName: "بنس",
    minorLatinName: "Pence",
  },
];

const defaultCurrency = currencies[0];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const STEPS = ["language", "profile", "contact", "admin", "currency"];

const useSetupPage = ({ onSetupComplete } = {}) => {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [showPin, setShowPin] = useState(false);
  const [showPinConfirm, setShowPinConfirm] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [currencyQuery, setCurrencyQuery] = useState("");

  const [form, setForm] = useState({
    company_name: "",
    currency_name: defaultCurrency.name,
    company_latin_name: "",
    phone: "",
    address: "",
    email: "",
    country: "",
    language: "ar",
    timezone: "UTC",
    base_currency_id: defaultCurrency.id,
    logo: "",
    code: defaultCurrency.code,
    symbol: defaultCurrency.symbol,
    minor_name: defaultCurrency.minorName,
    minor_latin_name: defaultCurrency.minorLatinName,
    admin_username: "",
    admin_pin: "",
    admin_pin_confirm: "",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await window.api.getCompanySetting();
        if (res?.exists) {
          setForm((prev) => ({ ...prev, ...res.settings }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (form.language && i18n.language !== form.language) {
      i18n.changeLanguage(form.language);
    }
    document.documentElement.dir = form.language === "ar" ? "rtl" : "ltr";
  }, [form.language, i18n]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };

  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
    });

  const applyLogoFile = async (file) => {
    if (!file || !file.type?.startsWith("image/")) return;
    try {
      const base64 = await toBase64(file);
      const savedPath = await window.api.saveLogo({
        base64,
        name: `${Date.now()}-${file.name}`,
      });
      setForm((prev) => ({ ...prev, logo: savedPath }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogo = (e) => applyLogoFile(e.target.files?.[0]);

  const handleLogoDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    applyLogoFile(e.dataTransfer.files?.[0]);
  };

  const removeLogo = (e) => {
    e.stopPropagation();
    setForm((prev) => ({ ...prev, logo: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCurrencySelect = (currency) => {
    setForm((prev) => ({
      ...prev,
      base_currency_id: currency.id,
      currency_name: currency.name,
      code: currency.code,
      symbol: currency.symbol,
      minor_name: currency.minorName,
      minor_latin_name: currency.minorLatinName,
    }));
    setErrors((current) => ({ ...current, base_currency_id: "" }));
  };

  const handleLanguageSelect = (langCode) => {
    setForm((prev) => ({ ...prev, language: langCode }));
  };

  const filteredCurrencies = useMemo(() => {
    const q = currencyQuery.trim().toLowerCase();
    if (!q) return currencies;
    return currencies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [currencyQuery]);

  // Per-step validation so "Next" can be gated without validating
  // fields the user hasn't reached yet.
  const validateStep = (index) => {
    const nextErrors = {};
    const key = STEPS[index];

    if (key === "profile" && !form.company_name?.trim()) {
      nextErrors.company_name = t("errors.nameRequired", {
        field: t("screens.company.companyName"),
      });
    }

    if (key === "contact") {
      if (!form.phone?.trim()) {
        nextErrors.phone = t("errors.valueRequired", { field: t("ui.phone") });
      }
      if (form.email?.trim() && !EMAIL_RE.test(form.email.trim())) {
        nextErrors.email = t("errors.emailInvalid");
      }
      if (!form.country?.trim()) {
        nextErrors.country = t("errors.valueRequired", {
          field: t("ui.country"),
        });
      }
    }

    if (key === "admin") {
      if (!form.admin_username?.trim()) {
        nextErrors.admin_username = t("errors.valueRequired", {
          field: t("screens.setupPage.adminUsername"),
        });
      }
      if (!/^\d{6}$/.test(form.admin_pin || "")) {
        nextErrors.admin_pin = t("errors.pinInvalid");
      }
      if (form.admin_pin !== form.admin_pin_confirm) {
        nextErrors.admin_pin_confirm = t("errors.pinMismatch");
      }
    }

    if (key === "currency" && !form.base_currency_id) {
      nextErrors.base_currency_id = t("errors.valueRequired", {
        field: t("screens.company.baseCurrency"),
      });
    }

    return nextErrors;
  };

  const goNext = () => {
    const stepErrors = validateStep(step);
    if (Object.keys(stepErrors).length > 0) {
      setErrors((current) => ({ ...current, ...stepErrors }));
      return false;
    }
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setFurthestStep((f) => Math.max(f, next));
    return true;
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  // Only lets users jump to steps they've already reached/completed.
  const goToStep = (index) => {
    if (index <= furthestStep) setStep(index);
  };

  const handleSave = async () => {
    // Validate every step in case the user edited an earlier field
    // after having already moved on.
    let allErrors = {};
    for (let i = 0; i < STEPS.length; i++) {
      allErrors = { ...allErrors, ...validateStep(i) };
    }

    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      const firstBadStep = STEPS.findIndex(
        (_, i) => Object.keys(validateStep(i)).length > 0
      );
      if (firstBadStep !== -1) {
        setStep(firstBadStep);
        setFurthestStep((f) => Math.max(f, firstBadStep));
      }
      return;
    }

    try {
      setSaving(true);
      const res = await window.api.createCompanySetting({
        company_name: form.company_name,
        company_latin_name: form.company_latin_name,
        phone: form.phone,
        address: form.address,
        email: form.email,
        country: form.country,
        logo: form.logo,
        language: form.language,
        timezone: form.timezone,
        base_currency_id: form.base_currency_id,
        currency_name: form.currency_name,
        code: form.code,
        symbol: form.symbol,
        minor_name: form.minor_name,
        minor_latin_name: form.minor_latin_name,
        admin_username: form.admin_username,
        admin_pin: form.admin_pin,
      });
      if (res?.success) {
        if (res.recoveryKey) {
          setRecoveryKey(res.recoveryKey);
          return;
        }
        onSetupComplete?.();
        navigate("/", { replace: true });
      } else if (res?.error) {
        setErrors((current) => ({ ...current, admin_pin: res.error }));
        setStep(STEPS.indexOf("admin"));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return {
    countries: COUNTRIES,
    step,
    furthestStep,
    goNext,
    goBack,
    goToStep,
    handleSave,
    currencies: filteredCurrencies,
    currencyQuery,
    setCurrencyQuery,
    errors,
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
    form,
    setForm,
    showPin,
    setShowPin,
    showPinConfirm,
    setShowPinConfirm,
    recoveryKey,
    completeRecoveryKeyDisplay: () => {
      setRecoveryKey("");
      onSetupComplete?.();
      navigate("/", { replace: true });
    },
  };
};

export default useSetupPage;
