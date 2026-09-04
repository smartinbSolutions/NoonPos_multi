// useSalesQuotationList.js
import { useCallback, useEffect, useState } from "react";

const emptyFilters = {
  dateFrom: "",
  dateTo: "",
  customerId: "",
  status: "",
  minTotal: "",
  maxTotal: "",
  taxIds: [],
  tagIds: [],
};

export default function useSalesQuotationList() {
  const api = window.api;

  const [salesQuotations, setSalesQuotations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters] = useState(emptyFilters);

  const [customers, setCustomers] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [tagsByQuotation, setTagsByQuotation] = useState({});

  const fetchQuotations = useCallback(async () => {
    if (!api) return;

    try {
      setLoading(true);
      const res = await api.getSalesQuotations({ page, limit, ...filters });

      setSalesQuotations(res?.data || []);
      setTotal(res?.total || 0);
      setTotalPages(res?.totalPages || 1);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api, page, limit, filters]);

  const fetchLookups = useCallback(async () => {
    if (!api) return;

    try {
      const [custRes, taxRes] = await Promise.all([
        api.getCustomers(),
        api.getTaxes(),
      ]);
      setCustomers(custRes?.data || []);
      setTaxes(taxRes || []);
    } catch (err) {
      console.error("Failed to load lookups:", err);
    }
  }, [api]);

  const fetchAllTags = useCallback(async () => {
    if (!api?.listTags) return;

    try {
      const res = await api.listTags("sales_quotation");
      setAllTags(res.success ? res.data : []);
    } catch (err) {
      console.error("Failed to load tags:", err);
    }
  }, [api]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    fetchAllTags();
  }, [fetchAllTags]);

  // Batch-fetch tags for exactly the quotations on the current page — one
  // call per page load instead of one call per row.
  useEffect(() => {
    if (!api?.getEntitiesTags) return;

    if (salesQuotations.length === 0) {
      setTagsByQuotation({});
      return;
    }

    const ids = salesQuotations.map((q) => q.id);
    api.getEntitiesTags("sales_quotation", ids).then((res) => {
      if (res.success) setTagsByQuotation(res.data);
    });
  }, [salesQuotations, api]);

  const refetch = () => {
    fetchQuotations();
  };

  const handleFilterChange = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setPage(1);
  };

  const deleteQuotation = async (id) => {
    try {
      setSaving(true);
      const res = await api.deleteSalesQuotation(id);
      if (!res?.success) {
        throw new Error(res?.error || "DELETE_FAILED");
      }
      await fetchQuotations();
      return res;
    } finally {
      setSaving(false);
    }
  };

  return {
    salesQuotations,
    loading,
    saving,
    error,
    refetch,
    deleteQuotation,

    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,

    api,
    filters,
    handleFilterChange,
    clearFilters,
    customers,
    taxes,
    allTags,
    tagsByQuotation,
  };
}
