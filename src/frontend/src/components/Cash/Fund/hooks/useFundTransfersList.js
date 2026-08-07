import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const useFundTransfersList = () => {
  const { t } = useTranslation();
  const api = window.api;

  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  // pagination — same shape as useSuppliersList / usePartnersList
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const refetch = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiUnavailable"));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);

      const result = await api.getFundTransfers({ page, limit });

      setTransfers(result?.data || []);
      setTotal(result?.total || 0);
      setTotalPages(result?.totalPages || 1);
    } catch (err) {
      console.error("Failed to load fund transfers:", err);
      setError(
        err?.message ||
          t("errors.createFailed", { field: t("screens.transfer.transfer") })
      );
    } finally {
      setLoading(false);
    }
  }, [api, page, limit]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleDeleteTransfer = async (transfer) => {
    setSaving(true);
    try {
      const res = await api.deleteFundTransfer(transfer.id);

      if (!res?.success) throw new Error(res?.message);
      setActionError("");
      await refetch();
    } catch (err) {
      console.error("Failed to delete transfer:", err);
      setActionError(
        err?.message ||
          t("errors.deleteHasData", { field: t("screens.transfer.transfer") })
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    transfers,
    loading,
    error,
    actionError,
    saving,

    handleDeleteTransfer,

    refetch,

    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,

    t,
  };
};

export default useFundTransfersList;
