import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

const useSuppliersList = () => {
  const { t } = useTranslation();
  const emptySupplier = {
    name: "",
    phone: "",
    address: "",
    opening_balance: 0,
  };
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [stats, setStats] = useState({
    count: 0,
    totalPayable: 0,
    totalPaid: 0,
    netOutstanding: 0,
  });
  const [counts, setCounts] = useState({ all: 0, owing: 0, settled: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unavailableHandlers, setUnavailableHandlers] = useState([]);
  const [actionError, setActionError] = useState("");
  const [draft, setDraft] = useState(emptySupplier);
  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState(emptySupplier);
  const [openPaymentModel, setOpenPaymentModel] = useState(false);
  const [selecteSupplier, setSelecteSupplier] = useState(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [balanceFilter, setBalanceFilterState] = useState("all"); // all | owing | settled

  const api = window.api;

  const normalizeSupplier = (sup) => ({
    ...sup,
    name: String(sup.name || "").trim(),
    phone: String(sup.phone || "").trim(),
    address: String(sup.address || "").trim(),
  });

  const validateSupplier = (sup) => {
    if (!String(sup.name || "").trim()) {
      return t("errors.nameRequired", { field: t("ui.supplier") });
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

      const res = await api.getSuppliers({
        page,
        limit,
        balance_filter: balanceFilter,
      });

      setSuppliers(res?.data || []);
      setTotal(res?.total || 0);
      setTotalPages(res?.totalPages || 1);
      setStats(
        res?.stats || {
          count: 0,
          totalPayable: 0,
          totalPaid: 0,
          netOutstanding: 0,
        }
      );
      setCounts(res?.counts || { all: 0, owing: 0, settled: 0 });
    } catch (err) {
      console.error("Failed to load supplier list:", err);
      setUnavailableHandlers([]);
      setError(
        err?.message || t("errors.createFailed", { field: t("ui.supplier") })
      );
    } finally {
      setLoading(false);
    }
  }, [api, page, limit, balanceFilter, t]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Changing the filter re-queries the full dataset, so always snap back to page 1 —
  // otherwise you could land on a page number that no longer exists for the new filter.
  const setBalanceFilter = (nextFilter) => {
    setBalanceFilterState(nextFilter);
    setPage(1);
  };

  const createSupplier = async (sup) => {
    const validationError = validateSupplier(sup);
    if (validationError) {
      throw new Error(validationError);
    }

    setSaving(true);
    try {
      const res = await api.createSupplier(normalizeSupplier(sup));
      if (!res?.success) {
        throw new Error(res?.message || res?.error);
      }
      await refetch();
      return res;
    } finally {
      setSaving(false);
    }
  };

  const updateSupplier = async (sup) => {
    const validationError = validateSupplier(sup);
    if (validationError) {
      throw new Error(validationError);
    }

    setSaving(true);
    try {
      const res = await api.updateSupplier(normalizeSupplier(sup));
      if (!res?.success) {
        throw new Error(res?.message || res?.error);
      }
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const deleteSupplier = async (sup) => {
    setSaving(true);
    try {
      const res = await api.deleteSupplier(sup.id);
      if (!res?.success) {
        throw new Error(res?.message || res?.error);
      }
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSupplier = async (sup) => {
    try {
      const result = await createSupplier(sup);
      setActionError("");
      toast.success(t("success.created", { field: t("ui.supplier") }));
      return result;
    } catch (err) {
      console.error("Failed to create Supplier:", err);
      const message =
        err?.message || t("errors.createFailed", { field: t("ui.supplier") });
      setActionError(message);
      toast.error(message);
      return false;
    }
  };

  const handleUpdateSupplier = async (sup) => {
    try {
      await updateSupplier(sup);
      setActionError("");
      toast.success(t("success.updated", { field: t("ui.supplier") }));
      return true;
    } catch (err) {
      console.error("Failed to update Supplier:", err);
      const message =
        err?.message || t("errors.updateFailed", { field: t("ui.supplier") });
      setActionError(message);
      toast.error(message);
      return false;
    }
  };

  const handleDeleteSupplier = async (sup) => {
    try {
      await deleteSupplier(sup);
      setActionError("");
      setEditing(emptySupplier);
      setEditingId("");
      toast.success(t("success.deleted", { field: t("ui.supplier") }));
    } catch (err) {
      console.error("Failed to delete Supplier:", err);
      const message = t("errors.deleteHasData", { field: t("ui.supplier") });
      setActionError(message);
      toast.error(message);
    }
  };

  const submitDraft = async (event) => {
    event.preventDefault();
    const saved = await handleCreateSupplier(draft);
    if (saved && saved !== false) {
      setDraft(emptySupplier);
    }
    return saved;
  };

  const startEdit = (sup) => {
    setEditingId(sup.id);
    setEditing({
      id: sup.id,
      name: sup.name || "",
      phone: sup.phone || "",
      address: sup.address || "",
    });
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    const saved = await handleUpdateSupplier(editing);
    if (saved) {
      setEditingId(null);
      setEditing(emptySupplier);
    }
  };

  return {
    createSupplier,
    updateSupplier,
    deleteSupplier,
    saving,
    suppliers,
    stats,
    counts,
    handleDeleteSupplier,
    handleCreateSupplier,
    handleUpdateSupplier,
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
    navigate,
    openPaymentModel,
    setOpenPaymentModel,
    selecteSupplier,
    setSelecteSupplier,
    refetch,

    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    balanceFilter,
    setBalanceFilter,
  };
};

export default useSuppliersList;
