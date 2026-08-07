import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const useExpenseCategory = () => {
  const { t } = useTranslation();
  const emptyExpenseCategory = { name: "", latinName: "" };

  const [saving, setSaving] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unavailableHandlers, setUnavailableHandlers] = useState([]);
  const [actionError, setActionError] = useState("");
  const [draft, setDraft] = useState(emptyExpenseCategory);
  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState(emptyExpenseCategory);
  const [dateRange, setDateRange] = useState({ startDate: "", endDate: "" });

  const api = window.api;

  // Maps known backend error codes to a translated, user-facing message.
  // Falls back to treating the code as already-human-readable, then to
  // a generic message.
  const mapErrorCode = useCallback(
    (code) => {
      switch (code) {
        case "MISSING_REQUIRED_FIELDS":
          return t(
            "errors.missingRequiredFields",
            "Please fill in all required fields."
          );
        case "CATEGORY_IN_USE":
          return t("errors.deleteHasData", {
            field: t("ui.expenseCategory"),
          });
        default:
          return null;
      }
    },
    [t]
  );

  const normalizeExpenseCategory = (expenseCategory) => ({
    ...expenseCategory,
    name: String(expenseCategory.name || "").trim(),
  });

  const validateExpenseCategory = (expenseCategory) => {
    if (!String(expenseCategory.name || "").trim()) {
      return t("errors.nameRequired", { field: t("ui.expenseCategory") });
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

      const params = {};
      if (dateRange.startDate) params.startDate = dateRange.startDate;
      if (dateRange.endDate) params.endDate = dateRange.endDate;

      let expenseCategoryResult = await api.getExpensesCategory(params);
      setExpenseCategory(expenseCategoryResult || []);
    } catch (err) {
      console.error("Failed to load expense categories:", err);
      setUnavailableHandlers([]);
      setError(
        err?.message ||
          t("errors.createFailed", { field: t("ui.expenseCategory") })
      );
    } finally {
      setLoading(false);
    }
  }, [api, dateRange]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createExpenseCategory = async (expenseCategory) => {
    const validationError = validateExpenseCategory(expenseCategory);
    if (validationError) {
      throw new Error(validationError);
    }

    setSaving(true);
    try {
      const res = await api.createExpenseCategory(
        normalizeExpenseCategory(expenseCategory)
      );

      if (!res?.success) {
        throw new Error(
          mapErrorCode(res?.error) ||
            res?.error ||
            t("errors.createFailed", { field: t("ui.expenseCategory") })
        );
      }

      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const updateExpenseCategory = async (expenseCategory) => {
    const validationError = validateExpenseCategory(expenseCategory);
    if (validationError) {
      throw new Error(validationError);
    }

    setSaving(true);
    try {
      const res = await api.updateExpenseCategory(
        normalizeExpenseCategory(expenseCategory)
      );

      if (!res?.success) {
        throw new Error(
          mapErrorCode(res?.error) ||
            res?.error ||
            t("errors.updateFailed", { field: t("ui.expenseCategory") })
        );
      }

      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const deleteExpenseCategory = async (id) => {
    setSaving(true);

    try {
      const res = await api.deleteExpenseCategory(id);

      if (!res?.success) {
        throw new Error(
          mapErrorCode(res?.error) ||
            res?.error ||
            t("errors.deleteFailed", { field: t("ui.expenseCategory") })
        );
      }

      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateExpenseCategory = async (expenseCategory) => {
    try {
      await createExpenseCategory(expenseCategory);
      setActionError("");
      return true;
    } catch (err) {
      console.error("Failed to create expense category:", err);
      setActionError(
        err?.message ||
          t("errors.createFailed", { field: t("ui.expenseCategory") })
      );
      return false;
    }
  };

  const handleUpdateExpenseCategory = async (expenseCategory) => {
    try {
      await updateExpenseCategory(expenseCategory);
      setActionError("");
      return true;
    } catch (err) {
      console.error("Failed to update expense category:", err);
      setActionError(
        err?.message ||
          t("errors.updateFailed", { field: t("ui.expenseCategory") })
      );
      return false;
    }
  };

  const handleDeleteExpenseCategory = async (id) => {
    try {
      await deleteExpenseCategory(id);
      setActionError("");
    } catch (err) {
      console.error("Failed to delete expense category:", err);
      setActionError(
        err?.message ||
          t("errors.deleteHasData", { field: t("ui.expenseCategory") })
      );
    }
  };

  const submitDraft = async (event) => {
    event.preventDefault();
    const saved = await handleCreateExpenseCategory(draft);
    if (saved) {
      setDraft(emptyExpenseCategory);
    }
  };

  const startEdit = (expenseCategory) => {
    setEditingId(expenseCategory.id);
    setEditing({
      id: expenseCategory.id,
      name: expenseCategory.name || "",
      latinName: expenseCategory?.latinName || "",
    });
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    const saved = await handleUpdateExpenseCategory(editing);
    if (saved) {
      setEditingId(null);
      setEditing(emptyExpenseCategory);
    }
  };

  const clearDateRange = () => setDateRange({ startDate: "", endDate: "" });

  return {
    createExpenseCategory,
    updateExpenseCategory,
    deleteExpenseCategory,
    saving,
    expenseCategory,
    handleDeleteExpenseCategory,
    handleCreateExpenseCategory,
    handleUpdateExpenseCategory,
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
    dateRange,
    setDateRange,
    clearDateRange,
  };
};

export default useExpenseCategory;
