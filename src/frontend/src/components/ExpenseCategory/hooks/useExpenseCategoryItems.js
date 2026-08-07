import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export default function useExpenseCategoryItems(categoryId) {
  const { t } = useTranslation();
  const api = window.api;

  const [items, setItems] = useState([]);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSpent, setTotalSpent] = useState(0);

  const [dateRange, setDateRange] = useState({ startDate: "", endDate: "" });

  const refetch = useCallback(async () => {
    if (!api || !categoryId) return;

    setLoading(true);
    setError("");

    try {
      const [categoryResult, itemsResult] = await Promise.all([
        api.getExpenseCategoryById(categoryId),
        api.getExpenseCategoryItems({
          categoryId,
          page,
          limit,
          startDate: dateRange.startDate || undefined,
          endDate: dateRange.endDate || undefined,
        }),
      ]);

      setCategory(categoryResult || null);
      setItems(itemsResult?.data || []);
      setTotal(itemsResult?.total || 0);
      setTotalPages(itemsResult?.totalPages || 1);
      setTotalSpent(itemsResult?.totalSpent || 0);
    } catch (err) {
      console.error("Failed to load expense category items:", err);
      setError(err?.message || t("errors.loadError"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [api, categoryId, page, limit, dateRange, t]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const clearDateRange = () => {
    setDateRange({ startDate: "", endDate: "" });
    setPage(1);
  };

  const updateDateRange = (patch) => {
    setDateRange((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  return {
    items,
    category,
    loading,
    error,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    totalSpent,
    dateRange,
    updateDateRange,
    clearDateRange,
    refetch,
  };
}
