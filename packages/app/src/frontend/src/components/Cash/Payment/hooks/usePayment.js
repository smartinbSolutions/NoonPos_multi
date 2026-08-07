import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { useAuth } from "../../../../Global/AuthContext";

const usePayment = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({
    income_count: 0,
    income_total: 0,
    expense_count: 0,
    expense_total: 0,
  });
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

      let res = await api.getPayments({ page, limit, ...filters });

      setPayments(res.data || []);
      setTotal(res?.total || 0);
      setTotalPages(res?.totalPages || 1);
      setSummary(
        res?.summary || {
          income_count: 0,
          income_total: 0,
          expense_count: 0,
          expense_total: 0,
        }
      );
    } catch (err) {
      console.error("Failed to load product catalog:", err);
      setActionError(
        err?.message || t("errors.createFailed", { field: t("ui.fund") })
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

  const deletePayment = async (payment) => {
    try {
      await api.deletePayment(payment.id, user?.id);
      await refetch();
    } finally {
    }
  };

  const handleDeletePayment = async (payment) => {
    try {
      await deletePayment(payment);
      setActionError("");
    } catch (err) {
      console.error("Failed to delete Payment:", err);
      toast.error(t("errors.deleteFailed", { field: t("ui.payment") }));
    }
  };

  return {
    payments,
    summary,
    loading,
    actionError,
    refetch,
    deletePayment,
    handleDeletePayment,
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

export default usePayment;
