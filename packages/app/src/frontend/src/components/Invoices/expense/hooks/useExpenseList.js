import React, { useCallback, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

const useExpenseList = () => {
  const { t } = useTranslation();
  const api = window.api;

  const [expenses, setExpenses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [allTags, setAllTags] = useState([]);
  const [tagsByExpense, setTagsByExpense] = useState({});

  const [openPaymentModel, setOpenPaymentModel] = useState(false);
  const [selecteInvoice, setSelecteInvoice] = useState(null);

  const [filters, setFiltersState] = useState({
    status: null,
    supplier_id: null,
    startDate: null,
    endDate: null,
    minTotal: null,
    maxTotal: null,
    category_id: null,
    taxIds: null,
    tagIds: null,
  });

  const setFilters = (patch) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const clearFilters = () => {
    setFiltersState({
      status: null,
      supplier_id: null,
      startDate: null,
      endDate: null,
      minTotal: null,
      maxTotal: null,
      category_id: null,
      taxIds: null,
      tagIds: null,
    });
    setPage(1);
  };

  useEffect(() => {
    if (api?.getSuppliers) {
      api
        .getSuppliers()
        .then((res) => setSuppliers(res?.data || res || []))
        .catch(() => setSuppliers([]));
    }
  }, [api]);

  useEffect(() => {
    if (api?.getExpensesCategory) {
      api
        .getExpensesCategory()
        .then((res) =>
          setCategories(Array.isArray(res) ? res : res?.data || []),
        )
        .catch(() => setCategories([]));
    }
  }, [api]);

  useEffect(() => {
    if (api?.getTaxes) {
      api
        .getTaxes()
        .then((res) => setTaxes(res || []))
        .catch(() => setTaxes([]));
    }
  }, [api]);

  useEffect(() => {
    if (api?.listTags) {
      api
        .listTags("expense")
        .then((res) => setAllTags(res.success ? res.data : []))
        .catch(() => setAllTags([]));
    }
  }, [api]);

  const refetch = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiNotAvailable"));
      return;
    }

    try {
      setLoading(true);
      const res = await api.getExpenses({
        page,
        limit,
        status: filters.status || undefined,
        supplier_id: filters.supplier_id || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        minTotal:
          filters.minTotal !== null && filters.minTotal !== ""
            ? filters.minTotal
            : undefined,
        maxTotal:
          filters.maxTotal !== null && filters.maxTotal !== ""
            ? filters.maxTotal
            : undefined,
        category_id: filters.category_id || undefined,
        taxIds: filters.taxIds || undefined,
        tagIds: filters.tagIds || undefined,
      });

      setExpenses(res?.data || []);
      setTotal(res?.total || 0);

      setTotalPages(res?.totalPages || 1);
      setError("");
    } catch (err) {
      setError(err?.message || t("errors.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api, page, limit, filters, t]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!api?.getEntitiesTags) return;

    if (expenses.length === 0) {
      setTagsByExpense({});
      return;
    }
    const ids = expenses.map((e) => e.id);
    api.getEntitiesTags("expense", ids).then((res) => {
      if (res.success) setTagsByExpense(res.data);
    });
  }, [expenses, api]);

  // Maps known backend error codes to a translated, user-facing message.
  const mapErrorCode = useCallback(
    (code) => {
      switch (code) {
        case "CANNOT_DELETE_PAID_EXPENSE":
          return t("errors.cannotDeletePaidInvoice");
        default:
          return null;
      }
    },
    [t],
  );

  const handleDelete = async (id) => {
    try {
      setActionError("");
      const res = await window.api.deleteExpense(id);

      if (!res?.success) {
        throw new Error(
          mapErrorCode(res?.error) ||
            res?.error ||
            t("screens.expenses.deleteFailed"),
        );
      }

      await refetch();
    } catch (err) {
      console.error("Failed to delete expense:", err);
      setActionError(err?.message || t("screens.expenses.deleteFailed"));
    }
  };

  return {
    expenses,
    suppliers,
    categories,
    taxes,
    loading,
    saving,
    error,
    actionError,
    refetch,
    handleDelete,

    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,

    selecteInvoice,
    setSelecteInvoice,
    openPaymentModel,
    setOpenPaymentModel,

    filters,
    setFilters,
    clearFilters,

    allTags,
    tagsByExpense,
  };
};

export default useExpenseList;
