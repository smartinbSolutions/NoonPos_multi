import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";

const useFundList = () => {
  const { t } = useTranslation();
  const emptyFund = {
    name: "",
    currency_id: "",
    initial_balance: 0,
    balance_type: "increase",
    date: "",
  };

  const [saving, setSaving] = useState(false);
  const [funds, setFunds] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unavailableHandlers, setUnavailableHandlers] = useState([]);
  const [actionError, setActionError] = useState("");
  const [draft, setDraft] = useState(emptyFund);
  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState(emptyFund);
  const [openTransferModal, setOpenTransferModal] = useState(false);
  const api = window.api;

  // Maps known backend error codes (from create/update/delete-fund) to a
  // translated, user-facing message. Falls back to treating the code as
  // an already-human-readable string, then to a generic message.
  const mapFundErrorCode = useCallback(
    (code) => {
      switch (code) {
        case "MISSING_REQUIRED_FIELDS":
          return t(
            "errors.missingRequiredFields",
            "Please fill in all required fields."
          );
        case "FUND_HAS_HISTORY":
          return t("errors.deleteHasData", { field: t("ui.fund") });
        default:
          return null;
      }
    },
    [t]
  );

  const normalizeFund = (fund) => {
    const exchangeRate = Number(fund.exchange_rate || 1);
    const balance = Number(fund.computed_balance || 0);

    return {
      ...fund,
      name: String(fund.name || "").trim(),
      currency_id: Number(fund.currency_id),
      balance: Number(balance / exchangeRate || 0),
      exchange_rate: exchangeRate,
      currency_code: fund.currency_code,
      paymentInfundCurrency: balance,
    };
  };

  const validateFund = (fund) => {
    if (!String(fund.name || "").trim()) {
      return t("errors.nameRequired", { field: t("ui.fund") });
    }

    if (!fund.currency_id) {
      return t("errors.currencyRequired", { field: t("ui.fund") });
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

      let fundResult = await api.getFunds();
      let currencyResult = await api.getCurrencies();

      setFunds(fundResult || []);
      setCurrencies(currencyResult || []);
    } catch (err) {
      console.error("Failed to load product catalog:", err);
      setUnavailableHandlers([]);
      setError(
        err?.message || t("errors.createFailed", { field: t("ui.fund") })
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleCreateFund = async (fund) => {
    const validationError = validateFund(fund);
    if (validationError) {
      setActionError(validationError);
      toast.error(validationError);
      return false;
    }

    setSaving(true);
    try {
      const res = await api.createFund({
        name: String(fund.name || "").trim(),
        currency_id: Number(fund.currency_id),
        currency_code: fund.currency_code,
        initial_balance: Number(fund.initial_balance || 0),
        balance_type:
          fund.balance_type === "decrease" ? "decrease" : "increase",
        date: fund.date || undefined,
      });

      if (!res?.success) {
        throw new Error(
          mapFundErrorCode(res?.error) ||
            res?.error ||
            t("errors.createFailed", { field: t("ui.fund") })
        );
      }

      await refetch();
      setActionError("");
      return true;
    } catch (err) {
      console.error("Failed to create Fund:", err);
      const message =
        err?.message || t("errors.createFailed", { field: t("ui.fund") });
      setActionError(message);
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateFund = async (fund) => {
    const validationError = validateFund(fund);
    if (validationError) {
      setActionError(validationError);
      toast.error(validationError);
      return false;
    }

    setSaving(true);
    try {
      const res = await api.updateFund(normalizeFund(fund));

      if (!res?.success) {
        throw new Error(
          mapFundErrorCode(res?.error) ||
            res?.error ||
            t("errors.updateFailed", { field: t("ui.fund") })
        );
      }

      await refetch();
      setActionError("");
      return true;
    } catch (err) {
      console.error("Failed to update Fund:", err);
      const message =
        err?.message || t("errors.updateFailed", { field: t("ui.fund") });
      setActionError(message);
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFund = async (fund) => {
    setSaving(true);
    try {
      const res = await api.deleteFund(fund.id);

      if (!res?.success) {
        throw new Error(
          mapFundErrorCode(res?.error) ||
            res?.error ||
            t("errors.deleteFailed", { field: t("ui.fund") })
        );
      }

      await refetch();
      setActionError("");
    } catch (err) {
      console.error("Failed to delete Fund:", err);
      const message =
        err?.message || t("errors.deleteFailed", { field: t("ui.fund") });
      setActionError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const submitDraft = async (event) => {
    event.preventDefault();
    const saved = await handleCreateFund(draft);
    if (saved) {
      setDraft(emptyFund);
    }
    return saved;
  };

  const startEdit = (fund) => {
    setEditingId(fund.id);
    setEditing({
      id: fund.id,
      name: fund.name || "",
      balance: fund.balance || "",
      currency_name: fund.currency_name || "",
      currency_id: fund.currency_id || "",
      currency_code: fund.currency_code || "",
      exchange_rate: fund.exchange_rate || 1,
    });
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    const saved = await handleUpdateFund(editing);
    if (saved) {
      setEditingId(null);
      setEditing(emptyFund);
    }
    return saved;
  };

  return {
    saving,
    funds,
    refetch,
    handleDeleteFund,
    handleCreateFund,
    handleUpdateFund,
    submitDraft,
    startEdit,
    submitEdit,
    setEditing,
    editing,
    setEditingId,
    editingId,
    setDraft,
    draft,
    currencies,
    actionError,
    setActionError,
    setOpenTransferModal,
    openTransferModal,
  };
};

export default useFundList;
