import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const DEFAULT_FILTERS = {
  dateFrom: "",
  dateTo: "",
  supplierId: "",
  status: "",
  minTotal: "",
  maxTotal: "",
  taxIds: [],
};

const usePurchaseReturnList = () => {
  const { t } = useTranslation();
  const api = window.api;

  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [suppliers, setSuppliers] = useState([]);
  const [taxes, setTaxes] = useState([]);

  const [openPaymentModel, setOpenPaymentModel] = useState(false);
  const [selecteInvoice, setSelecteInvoice] = useState(null);

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

      const res = await api.getPurchaseReturns({
        page,
        limit,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        supplierId: filters.supplierId || undefined,
        status: filters.status || undefined,
        minTotal: filters.minTotal !== "" ? filters.minTotal : undefined,
        maxTotal: filters.maxTotal !== "" ? filters.maxTotal : undefined,
        taxIds: filters.taxIds?.length ? filters.taxIds : undefined,
      });

      setPurchaseReturns(res?.data || []);
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
    if (!api?.getSuppliers) return;
    api
      .getSuppliers({ page: 1, limit: 1000 })
      .then((res) => setSuppliers(res?.data || res || []))
      .catch(() => setSuppliers([]));
  }, [api]);

  useEffect(() => {
    if (!api?.getTaxes) return;
    api
      .getTaxes()
      .then((res) => setTaxes(res || []))
      .catch(() => setTaxes([]));
  }, [api]);

  const deletePurchaseReturn = async (id) => {
    try {
      setSaving(true);

      await api.deletePurchaseReturn(id);

      await refetch();
    } catch (err) {
      setError(
        err?.message ||
          t("errors.deleteFailed", {
            field: t("ui.purchaseReturn"),
          })
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    purchaseReturns,
    loading,
    saving,
    error,

    refetch,
    deletePurchaseReturn,

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
    handleFilterChange,
    clearFilters,
    suppliers,
    taxes,
  };
};

export default usePurchaseReturnList;
