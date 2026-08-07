import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

const useUpdateCompanySettings = () => {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxes, setTaxes] = useState([]);

  const [form, setForm] = useState({
    company_name: "",
    company_latin_name: "",
    phone: "",
    address: "",
    email: "",
    country: "",
    language: "en",
    timezone: "UTC",
    base_currency_id: null,
    logo: "",
    allow_negative_stock: false,
    minimum_stock: 0,
    pos_invoice_tax_mode: "manual",
    default_pos_taxes: [],
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [res, taxRes] = await Promise.all([
          window.api.getCompanySetting(),
          window.api.getTaxes().catch(() => []),
        ]);

        if (res?.exists) {
          setForm((prev) => ({
            ...prev,
            ...res.settings,
            allow_negative_stock: Boolean(res.settings.allow_negative_stock),
            minimum_stock: Number(res.settings.minimum_stock ?? 0),
            pos_invoice_tax_mode: res.settings.pos_invoice_tax_mode || "manual",
            default_pos_taxes: res.settings.default_pos_taxes || [],
          }));
        }

        setTaxes(taxRes || []);
      } catch (err) {
        console.error(err);
        toast.error(t("errors.loadError"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleAllowNegativeStock = () => {
    setForm((prev) => ({
      ...prev,
      allow_negative_stock: !prev.allow_negative_stock,
    }));
  };

  const setPosInvoiceTaxMode = (mode) => {
    setForm((prev) => ({ ...prev, pos_invoice_tax_mode: mode }));
  };

  const addDefaultPosTax = (selectedTax) => {
    if (!selectedTax?.id) return;

    setForm((prev) => {
      if (prev.default_pos_taxes.some((t) => t.tax_id === selectedTax.id)) {
        return prev;
      }
      return {
        ...prev,
        default_pos_taxes: [
          ...prev.default_pos_taxes,
          {
            tax_id: selectedTax.id,
            name: selectedTax.name,
            rate: selectedTax.rate,
          },
        ],
      };
    });
  };

  const removeDefaultPosTax = (taxId) => {
    setForm((prev) => ({
      ...prev,
      default_pos_taxes: prev.default_pos_taxes.filter(
        (t) => t.tax_id !== taxId
      ),
    }));
  };

  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.readAsDataURL(file);

      reader.onload = () => resolve(reader.result);

      reader.onerror = (error) => reject(error);
    });

  const handleLogo = async (e) => {
    try {
      const file = e.target.files[0];

      if (!file) return;

      const base64 = await toBase64(file);

      const savedPath = await window.api.saveLogo({
        base64,
        name: `${Date.now()}-${file.name}`,
      });

      setForm((prev) => ({
        ...prev,
        logo: savedPath,
      }));
    } catch (err) {
      console.error(err);
      toast.error(t("errors.saveError"));
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (!form.country?.trim()) {
        toast.error(t("errors.valueRequired", { field: t("ui.country") }));
        setSaving(false);
        return;
      }

      const payload = {
        ...form,
        allow_negative_stock: form.allow_negative_stock ? 1 : 0,
        minimum_stock: Number(form.minimum_stock || 0),
        default_pos_tax_ids: form.default_pos_taxes.map((t) => t.tax_id),
      };

      const res = form.id
        ? await window.api.updateCompanySetting(payload)
        : await window.api.createCompanySetting(payload);

      if (res?.success === false) {
        toast.error(res.error || t("errors.saveError"));
        return;
      }

      i18n.changeLanguage(form.language);
      toast.success(
        t("success.updated", { field: t("screens.company.title") })
      );
    } catch (err) {
      console.error(err);
      toast.error(t("errors.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return {
    handleSave,
    handleLogo,
    handleChange,
    toggleAllowNegativeStock,
    setPosInvoiceTaxMode,
    addDefaultPosTax,
    removeDefaultPosTax,
    form,
    taxes,
    saving,
    loading,
  };
};

export default useUpdateCompanySettings;
