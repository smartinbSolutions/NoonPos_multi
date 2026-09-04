import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

const DEFAULT_FILTERS = {
  dateFrom: "",
  dateTo: "",
  supplierId: "",
  status: "",
  returnStatus: "",
  minTotal: "",
  maxTotal: "",
  taxIds: [],
  tagIds: [],
};

const usePurchaseList = () => {
  const { t } = useTranslation();
  const api = window.api;

  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [taxes, setTaxes] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [tagsByInvoice, setTagsByInvoice] = useState({});
  const [suppliers, setSuppliers] = useState([]);

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
      const res = await api.getPurchaseInvoices({
        page,
        limit,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        supplierId: filters.supplierId || undefined,
        status: filters.status || undefined,
        returnStatus: filters.returnStatus || undefined,
        minTotal: filters.minTotal !== "" ? filters.minTotal : undefined,
        maxTotal: filters.maxTotal !== "" ? filters.maxTotal : undefined,
        taxIds: filters.taxIds?.length ? filters.taxIds : undefined,
        tagIds: filters.tagIds?.length ? filters.tagIds : undefined,
      });

      setPurchaseInvoices(res?.data || []);
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
    if (!api?.getTaxes) return;
    api
      .getTaxes()
      .then((res) => setTaxes(res || []))
      .catch(() => setTaxes([]));
  }, [api]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!api?.listTags) return;
    api
      .listTags("purchase_invoice")
      .then((res) => setAllTags(res.success ? res.data : []))
      .catch(() => setAllTags([]));
  }, [api]);

  useEffect(() => {
    if (!api?.getEntitiesTags) return;

    if (purchaseInvoices.length === 0) {
      setTagsByInvoice({});
      return;
    }
    const ids = purchaseInvoices.map((inv) => inv.id);
    api.getEntitiesTags("purchase_invoice", ids).then((res) => {
      if (res.success) setTagsByInvoice(res.data);
    });
  }, [purchaseInvoices, api]);

  // Loaded once for the filter dropdown — full list, not paginated.
  useEffect(() => {
    if (!api?.getSuppliers) return;
    api
      .getSuppliers({ page: 1, limit: 1000 })
      .then((res) => setSuppliers(res?.data || res || []))
      .catch(() => setSuppliers([]));
  }, [api]);

  // Maps backend error codes to translated, user-facing messages.
  // Falls back to the raw message (or a generic one) for anything unmapped.
  const getDeleteErrorMessage = (err) => {
    const code = err?.message || "";

    if (code.includes("CANNOT_DELETE_INVOICE_WITH_RETURN")) {
      return t(
        "screens.errors.cannotDeleteInvoiceWithReturn",
        "This invoice has a return and cannot be deleted.",
      );
    }
    if (code.includes("CANNOT_DELETE_PAID_INVOICE")) {
      return t(
        "screens.errors.cannotDeletePaidInvoice",
        "This invoice has a payment and cannot be deleted.",
      );
    }
    if (code.includes("PURCHASE INVOICE NOT FOUND")) {
      return t(
        "screens.errors.invoiceNotFound",
        "This invoice no longer exists.",
      );
    }

    return err?.message || t("errors.deleteFailed", { field: t("ui.invoice") });
  };

  const deletePurchase = async (id) => {
    try {
      setSaving(true);
      const res = await api.deletePurchaseInvoice(id);

      if (res?.success === false) {
        const message = getDeleteErrorMessage({ message: res.error });
        setError(message);
        toast.error(message);
        return;
      }

      toast.success(
        t("screens.invoices.deletedSuccessfully", "Invoice deleted."),
      );
      await refetch();
    } catch (err) {
      const message = getDeleteErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return {
    purchaseInvoices,
    loading,
    saving,
    error,
    refetch,
    deletePurchase,

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
    allTags,
    tagsByInvoice,
  };
};

export default usePurchaseList;
