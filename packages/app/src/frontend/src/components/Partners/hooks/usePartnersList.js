import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

const usePartnersList = () => {
  const { t } = useTranslation();
  const emptyPartner = {
    name: "",
    phone: "",
    address: "",
    opening_balance: 0,
    percentage: 0,
  };
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unavailableHandlers, setUnavailableHandlers] = useState([]);
  const [actionError, setActionError] = useState("");
  const [draft, setDraft] = useState(emptyPartner);
  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState(emptyPartner);
  const [openPaymentModel, setOpenPaymentModel] = useState(false);
  const [selectePartner, setSelectePartner] = useState(null);
  const [remainingPercentage, setRemainingPercentage] = useState(100);

  // pagination — mirrors useSuppliersList
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [tagsByPartner, setTagsByPartner] = useState({});

  const api = window.api;

  const normalizePartner = (cust) => ({
    ...cust,
    name: String(cust.name || "").trim(),
    phone: String(cust.phone || "").trim(),
    address: String(cust.address || "").trim(),
    balance_type: cust.balance_type || "increase",
    percentage: Number(cust.percentage) || 0,
  });

  const validatePartner = (cust) => {
    if (!String(cust.name || "").trim()) {
      return t("errors.nameRequired", { field: t("ui.partner") });
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

      const result = await api.getPartners({ page, limit });

      setPartners(result?.data || []);
      setTotal(result?.total || 0);
      setTotalPages(result?.totalPages || 1);
      setRemainingPercentage(result?.remainingPercentage ?? 100);
    } catch (err) {
      console.error("Failed to load product catalog:", err);
      setUnavailableHandlers([]);
      setError(
        err?.message || t("errors.createFailed", { field: t("ui.partner") }),
      );
    } finally {
      setLoading(false);
    }
  }, [api, page, limit]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (partners.length === 0) {
      setTagsByPartner({});
      return;
    }
    const ids = partners.map((p) => p.id);
    window.api.getEntitiesTags("partner", ids).then((res) => {
      if (res.success) setTagsByPartner(res.data);
    });
  }, [partners]);

  const createPartner = async (cust) => {
    const validationError = validatePartner(cust);
    if (validationError) throw new Error(validationError);

    setSaving(true);
    try {
      const result = await api.createPartner(normalizePartner(cust));
      if (result && result.success === false) {
        if (result.error === "PARTNER_PERCENTAGE_EXCEEDS_REMAINING") {
          throw new Error(
            t("errors.percentageExceedsRemaining", {
              remaining: result.remaining,
            }),
          );
        }
        throw new Error(result.error);
      }
      await refetch();
      return result;
    } finally {
      setSaving(false);
    }
  };

  const updatePartner = async (cust) => {
    const validationError = validatePartner(cust);
    if (validationError) {
      throw new Error(validationError);
    }

    setSaving(true);
    try {
      const result = await api.updatePartner(normalizePartner(cust));
      if (result && result.success === false) {
        if (result.error === "PARTNER_PERCENTAGE_EXCEEDS_REMAINING") {
          throw new Error(
            t("errors.percentageExceedsRemaining", {
              remaining: result.remaining,
            }),
          );
        }
        throw new Error(result.error);
      }
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const deletePartner = async (part) => {
    setSaving(true);
    try {
      const res = await api.deletePartner(part.id);
      if (!res?.success) {
        throw new Error(res?.error || "DELETE_FAILED");
      }
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePartner = async (part) => {
    try {
      const result = await createPartner(part);
      if (result?.id && part.tagIds !== undefined) {
        await api.setEntityTags("partner", result.id, part.tagIds);
      }
      setActionError("");
      toast.success(t("success.created", { field: t("ui.partner") }));
      return true;
    } catch (err) {
      console.error("Failed to create Partner:", err);
      const message =
        err?.message || t("errors.createFailed", { field: t("ui.partner") });
      setActionError(message);
      toast.error(message);
      return false;
    }
  };

  const handleUpdatePartner = async (cust) => {
    try {
      await updatePartner(cust);
      if (cust.tagIds !== undefined) {
        await api.setEntityTags("partner", cust.id, cust.tagIds);
      }
      setActionError("");
      toast.success(t("success.updated", { field: t("ui.partner") }));
      return true;
    } catch (err) {
      console.error("Failed to update Partner:", err);
      const message =
        err?.message || t("errors.updateFailed", { field: t("ui.partner") });
      setActionError(message);
      toast.error(message);
      return false;
    }
  };

  const handleDeletePartner = async (cust) => {
    try {
      await deletePartner(cust);
      setActionError("");
      setEditing(emptyPartner);
      setEditingId("");
      toast.success(t("success.deleted", { field: t("ui.partner") }));
    } catch (err) {
      console.error("Failed to delete Partner:", err);

      const message =
        err.message === "PARTNER_HAS_HISTORY"
          ? t("errors.deleteHasData", { field: t("ui.partner") })
          : err?.message ||
            t("errors.deleteFailed", { field: t("ui.partner") });

      setActionError(message);
      toast.error(message);
    }
  };

  const submitDraft = async (event) => {
    event.preventDefault();
    const saved = await handleCreatePartner(draft);
    if (saved) {
      setDraft(emptyPartner);
    }
    return saved;
  };

  const startEdit = (cust) => {
    setEditingId(cust.id);
    setEditing({
      id: cust.id,
      name: cust.name || "",
      phone: cust.phone || "",
      address: cust.address || "",
      percentage: cust.percentage || 0,
    });
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    const saved = await handleUpdatePartner(editing);
    if (saved) {
      setEditingId(null);
      setEditing(emptyPartner);
    }
  };

  return {
    createPartner,
    updatePartner,
    deletePartner,
    saving,
    partners,
    handleDeletePartner,
    handleCreatePartner,
    handleUpdatePartner,
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
    selectePartner,
    setSelectePartner,
    refetch,
    openPaymentModel,
    setOpenPaymentModel,
    tagsByPartner,
    remainingPercentage,

    // pagination
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
  };
};

export default usePartnersList;
