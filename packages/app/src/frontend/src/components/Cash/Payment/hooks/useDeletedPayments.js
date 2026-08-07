import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const useDeletedPayments = () => {
  const { t } = useTranslation();
  const [deletedPayments, setDeletedPayments] = useState([]);
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFiltersState] = useState({
    type: null,
    party_type: null,
    invoice_type: null,
    fund_id: null,
    dateFrom: null,
    dateTo: null,
  });
  const api = window.api;

  const refetch = useCallback(async () => {
    if (!api) {
      setActionError(t("errors.apiUnavailable"));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);

      let res = await api.getDeletedPayments({ page, limit, ...filters });

      setDeletedPayments(res.data || []);
      setTotal(res?.total || 0);
      setTotalPages(res?.totalPages || 1);
    } catch (err) {
      console.error("Failed to load deleted payments:", err);
      setActionError(
        err?.message || t("errors.createFailed", { field: t("ui.payment") })
      );
    } finally {
      setLoading(false);
    }
  }, [api, page, limit, filters, t]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const setFilters = (newFilters) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }));
    setPage(1);
  };

  return {
    deletedPayments,
    loading,
    actionError,
    refetch,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    filters,
    setFilters,
  };
};

export default useDeletedPayments;
