import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const DEFAULT_FILTERS = {
  dateFrom: "",
  dateTo: "",
  customerId: "",
  channel: "",
  status: "",
  minTotal: "",
  maxTotal: "",
  taxIds: [],
};

const useSalesReturnList = () => {
  const { t } = useTranslation();
  const api = window.api;

  const [salesReturns, setSalesReturns] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [customers, setCustomers] = useState([]);
  const [taxes, setTaxes] = useState([]);

  const [openPaymentModel, setOpenPaymentModel] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const handleFilterChange = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const refetch = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiNotAvailable"));
      return;
    }

    try {
      setLoading(true);

      const res = await api.getSalesReturns({
        page,
        limit,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        customerId: filters.customerId || undefined,
        channel: filters.channel || undefined,
        status: filters.status || undefined,
        minTotal: filters.minTotal !== "" ? filters.minTotal : undefined,
        maxTotal: filters.maxTotal !== "" ? filters.maxTotal : undefined,
        taxIds: filters.taxIds?.length ? filters.taxIds : undefined,
      });

      setSalesReturns(res?.data || []);
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
    if (!api?.getCustomers) return;
    api
      .getCustomers({ page: 1, limit: 1000 })
      .then((res) => setCustomers(res?.data || []))
      .catch(() => setCustomers([]));
  }, [api]);

  useEffect(() => {
    if (!api?.getTaxes) return;
    api
      .getTaxes()
      .then((res) => setTaxes(res || []))
      .catch(() => setTaxes([]));
  }, [api]);

  const deleteSalesReturn = async (id) => {
    try {
      setSaving(true);

      await api.deleteSalesReturn(id);

      await refetch();
    } catch (err) {
      setError(
        err?.message ||
          t("errors.deleteFailed", {
            field: t("ui.salesReturn"),
          })
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    salesReturns,
    loading,
    saving,
    error,
    refetch,
    deleteSalesReturn,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    selectedInvoice,
    setSelectedInvoice,
    openPaymentModel,
    setOpenPaymentModel,

    filters,
    handleFilterChange,
    clearFilters,
    customers,
    taxes,
  };
};

export default useSalesReturnList;
