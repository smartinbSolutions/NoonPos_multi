import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export default function useTax() {
  const { t } = useTranslation();
  const emptyTax = { name: "", rate: 0, category: "product" };

  const [saving, setSaving] = useState(false);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unavailableHandlers, setUnavailableHandlers] = useState([]);
  const [actionError, setActionError] = useState("");
  const [draft, setDraft] = useState(emptyTax);
  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState(emptyTax);

  const api = window.api;

  const normalizeTax = (tax) => ({
    ...tax,
    name: String(tax.name || "").trim(),
    rate: Number(tax.rate),
    category: ["product", "invoice", "both"].includes(tax.category)
      ? tax.category
      : "product",
  });

  const validateTax = (tax) => {
    if (!String(tax.name || "").trim()) {
      return t("errors.nameRequired", { field: t("ui.tax") });
    }

    if (
      tax.rate === "" ||
      tax.rate === null ||
      !Number.isFinite(Number(tax.rate))
    ) {
      return t("errors.valueRequired", { field: t("ui.tax") });
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

      let taxResult = await api.getTaxes();

      setTaxes(taxResult || []);
    } catch (err) {
      console.error("Failed to load product catalog:", err);
      setUnavailableHandlers([]);
      setError(
        err?.message || t("errors.createFailed", { field: t("ui.tax") })
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createTax = async (tax) => {
    const validationError = validateTax(tax);
    if (validationError) {
      throw new Error(validationError);
    }

    setSaving(true);
    try {
      const res = await api.createTax(normalizeTax(tax));
      if (!res?.success) {
        throw new Error(res?.error || "CREATE_FAILED");
      }
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const updateTax = async (tax) => {
    const validationError = validateTax(tax);
    if (validationError) {
      throw new Error(validationError);
    }

    setSaving(true);
    try {
      const res = await api.updateTax(normalizeTax(tax));
      if (!res?.success) {
        throw new Error(res?.error || "UPDATE_FAILED");
      }
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const deleteTax = async (tax) => {
    setSaving(true);
    try {
      const res = await api.deleteTax(tax.id);
      if (!res?.success) {
        throw new Error(res?.error || "DELETE_FAILED");
      }
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTax = async (tax) => {
    try {
      await createTax(tax);
      setActionError("");
      return true;
    } catch (err) {
      console.error("Failed to create tax:", err);
      if (err.message === "TAX_ALREADY_EXISTS") {
        setActionError(t("errors.taxAlreadyExists", { field: t("ui.tax") }));
      } else {
        setActionError(
          err?.message || t("errors.createFailed", { field: t("ui.tax") })
        );
      }
      return false;
    }
  };

  const handleUpdateTax = async (tax) => {
    try {
      await updateTax(tax);
      setActionError("");
      return true;
    } catch (err) {
      console.error("Failed to update tax:", err);
      if (err.message === "TAX_ALREADY_EXISTS") {
        setActionError(t("errors.taxAlreadyExists", { field: t("ui.tax") }));
      } else {
        setActionError(
          err?.message || t("errors.updateFailed", { field: t("ui.tax") })
        );
      }
      return false;
    }
  };

  const handleDeleteTax = async (tax) => {
    try {
      await deleteTax(tax);
      setActionError("");
    } catch (err) {
      console.error("Failed to delete tax:", err);
      if (err.message === "TAX_IN_USE") {
        setActionError(t("errors.taxInUse", { field: t("ui.tax") }));
      } else {
        setActionError(t("errors.deleteHasData", { field: t("ui.tax") }));
      }
    }
  };

  const submitDraft = async (event) => {
    event.preventDefault();
    const saved = await handleCreateTax(draft);
    if (saved) {
      setDraft(emptyTax);
    }
  };

  const startEdit = (tax) => {
    setEditingId(tax.id);
    setEditing({
      id: tax.id,
      name: tax.name || "",
      rate: tax.rate || "",
      category: tax.category || "product",
    });
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    const saved = await handleUpdateTax(editing);
    if (saved) {
      setEditingId(null);
      setEditing(emptyTax);
    }
  };

  return {
    createTax,
    updateTax,
    deleteTax,
    saving,
    taxes,
    handleDeleteTax,
    handleCreateTax,
    handleUpdateTax,
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
}
