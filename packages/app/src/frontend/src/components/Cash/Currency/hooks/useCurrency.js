import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const useCurrency = () => {
  const { t } = useTranslation();
  const emptyCurrency = {
    name: "",
    latinName: "",
    minorName: "",
    minorLatinName: "",
    code: "",
    exchangeRate: 1,
    symbol: "",
  };

  const [saving, setSaving] = useState(false);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unavailableHandlers, setUnavailableHandlers] = useState([]);
  const [actionError, setActionError] = useState("");
  const [draft, setDraft] = useState(emptyCurrency);
  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState(emptyCurrency);

  const api = window.api;

  const normalizeCurrency = (currency) => ({
    ...currency,
    name: String(currency.name || "").trim(),
    latinName: String(currency.latinName || "").trim(),
    minorName: String(currency.minorName || "").trim(),
    minorLatinName: String(currency.minorLatinName || "").trim(),
    code: String(currency.code || "").trim(),
    exchangeRate: Number(currency.exchangeRate),
  });

  const validateCurrency = (currency) => {
    if (!String(currency.name || "").trim()) {
      return t("errors.nameRequired", { field: t("ui.currency") });
    }

    if (!String(currency.code || "").trim()) {
      return t("errors.codeRequired", { field: t("ui.currency") });
    }

    if (!String(currency.symbol || "").trim()) {
      return t("errors.symbolRequired", { field: t("ui.currency") });
    }

    if (
      currency.exchangeRate === "" ||
      currency.exchangeRate === null ||
      !Number.isFinite(Number(currency.exchangeRate))
    ) {
      return t("errors.exchangeRateRequired", { field: t("ui.currency") });
    }

    return "";
  };

  const refetch = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiUnavailable"));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);

      let currencyResult = await api.getCurrencies();

      setCurrencies(currencyResult || []);
    } catch (err) {
      console.error("Failed to load product catalog:", err);
      setUnavailableHandlers([]);
      setError(
        err?.message || t("errors.createFailed", { field: t("ui.currency") })
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createCurrency = async (currency) => {
    const validationError = validateCurrency(currency);
    if (validationError) {
      throw new Error(validationError);
    }

    setSaving(true);
    try {
      const res = await api.createCurrency(normalizeCurrency(currency));
      if (!res?.success) {
        throw new Error(res?.error || "CREATE_FAILED");
      }
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const updateCurrency = async (currency) => {
    const validationError = validateCurrency(currency);
    if (validationError) {
      throw new Error(validationError);
    }

    setSaving(true);
    try {
      const res = await api.updateCurrency(normalizeCurrency(currency));
      if (!res?.success) {
        throw new Error(res?.error || "UPDATE_FAILED");
      }
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const deleteCurrency = async (currency) => {
    setSaving(true);
    try {
      const res = await api.deleteCurrency(currency.id);
      if (!res?.success) {
        throw new Error(res?.error || "DELETE_FAILED");
      }
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCurrency = async (currency) => {
    try {
      await createCurrency(currency);
      setActionError("");
      return true;
    } catch (err) {
      console.error("Failed to create Currency:", err);
      if (err.message === "CURRENCY_ALREADY_EXISTS") {
        setActionError(
          t("errors.currencyAlreadyExists", { field: t("ui.currency") })
        );
      } else if (err.message === "RATE_RESERVED_FOR_PRIMARY") {
        setActionError(t("errors.rateReservedForPrimary"));
      } else {
        setActionError(
          err?.message || t("errors.createFailed", { field: t("ui.currency") })
        );
      }
      return false;
    }
  };

  const handleUpdateCurrency = async (currency) => {
    try {
      await updateCurrency(currency);
      setActionError("");
      return true;
    } catch (err) {
      console.error("Failed to update Currency:", err);
      if (err.message === "CURRENCY_ALREADY_EXISTS") {
        setActionError(
          t("errors.currencyAlreadyExists", { field: t("ui.currency") })
        );
      } else if (err.message === "PRIMARY_RATE_MUST_BE_ONE") {
        setActionError(t("errors.primaryRateMustBeOne"));
      } else if (err.message === "RATE_RESERVED_FOR_PRIMARY") {
        setActionError(t("errors.rateReservedForPrimary"));
      } else {
        setActionError(
          err?.message || t("errors.updateFailed", { field: t("ui.currency") })
        );
      }
      return false;
    }
  };

  const handleDeleteCurrency = async (currency) => {
    try {
      await deleteCurrency(currency);
      setActionError("");
    } catch (err) {
      console.error("Failed to delete Currency:", err);
      if (err.message === "CANNOT_DELETE_PRIMARY") {
        setActionError(
          t("errors.cannotDeletePrimaryCurrency", { field: t("ui.currency") })
        );
      } else if (err.message === "CURRENCY_IN_USE") {
        setActionError(t("errors.currencyInUse", { field: t("ui.currency") }));
      } else {
        setActionError(t("errors.deleteHasData", { field: t("ui.currency") }));
      }
    }
  };

  const submitDraft = async (event) => {
    event.preventDefault();
    const saved = await handleCreateCurrency(draft);
    if (saved) {
      setDraft(emptyCurrency);
    }
  };

  const startEdit = (currency) => {
    setEditingId(currency.id);
    setEditing({
      id: currency.id,
      name: currency.name || "",
      latinName: currency.latinName || "",
      minorName: currency.minorName || "",
      minorLatinName: currency.minorLatinName || "",
      code: currency.code || "",
      exchangeRate: currency.exchangeRate || 1,
      symbol: currency.symbol || "",
    });
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    const saved = await handleUpdateCurrency(editing);
    if (saved) {
      setEditingId(null);
      setEditing(emptyCurrency);
    }
  };

  return {
    createCurrency,
    updateCurrency,
    deleteCurrency,
    saving,
    currencies,
    handleDeleteCurrency,
    handleCreateCurrency,
    handleUpdateCurrency,
    submitDraft,
    startEdit,
    submitEdit,
    setEditing,
    editing,
    setEditingId,
    editingId,
    setDraft,
    draft,
    actionError,
  };
};

export default useCurrency;
