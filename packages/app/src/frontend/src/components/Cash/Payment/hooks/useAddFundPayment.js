import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { useAuth } from "../../../../Global/AuthContext";

const useAddFundPayment = ({
  isOpen,
  onClose,
  mode, // "in" or "out"
  initialFundId,
  refetchList,
}) => {
  const { t } = useTranslation();
  const api = window.api;

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [funds, setFunds] = useState([]);
  const [partiesList, setPartiesList] = useState([]);
  const { money } = usePrimaryCurrency();

  // Fund is locked whenever this modal is opened from a specific fund's row
  // (e.g. FundList's expense/deposit icon on a given fund), same pattern as
  // FundTransferModal's isSourceLocked.
  const isFundLocked = Boolean(initialFundId);

  const [partyType, setPartyType] = useState(
    mode === "out" ? "supplier" : "customer"
  );
  const { user } = useAuth();

  const [form, setForm] = useState({
    fund_id: "",
    party_id: "",
    fund_exchangeRate: 1,
    amount_in_base: 0,
    collected_amount: 0,
    currency_code: "",
    currency_symbol: "",
    note: "",
  });

  // Tracks whether the person has manually typed their own note — once they
  // have, auto-generation stops overwriting it on every field change.
  const [noteEdited, setNoteEdited] = useState(false);

  const handleChange = (key, value) => {
    if (key === "note") setNoteEdited(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectedFund = useMemo(
    () => funds.find((f) => f.id === Number(form.fund_id)),
    [funds, form.fund_id]
  );

  const selectedParty = useMemo(
    () => partiesList.find((p) => p.id === Number(form.party_id)),
    [partiesList, form.party_id]
  );

  const fetchFunds = useCallback(async () => {
    if (!api) return;
    try {
      const res = await api.getFunds();
      setFunds(res || []);
    } catch (err) {
      console.error("Error fetching funds:", err);
    }
  }, [api]);

  const fetchParties = useCallback(async () => {
    if (!api) return;
    try {
      let res = [];
      if (partyType === "customer") {
        res = (await api.getCustomers?.()) || [];
      } else if (partyType === "supplier") {
        res = (await api.getSuppliers?.()) || [];
      } else if (partyType === "partner") {
        res = (await api.getPartners()) || [];
      }
      setPartiesList(res?.data || res || []);
    } catch (err) {
      console.error("Error fetching parties:", err);
    }
  }, [api, partyType]);

  useEffect(() => {
    if (isOpen) {
      fetchFunds();
      setForm({
        fund_id: initialFundId || "",
        party_id: "",
        fund_exchangeRate: 1,
        amount_in_base: "",
        collected_amount: "",
        currency_code: "",
        currency_symbol: "",
        note: "",
      });
      setPartyType(mode === "out" ? "supplier" : "customer");
      setNoteEdited(false);
      setMessage("");
    }
  }, [isOpen, fetchFunds, initialFundId, mode]);

  useEffect(() => {
    if (isOpen) {
      fetchParties();
      setForm((prev) => ({ ...prev, party_id: "" }));
    }
  }, [partyType, isOpen, fetchParties]);

  useEffect(() => {
    if (isOpen && initialFundId && funds.length > 0) {
      const fund = funds.find((f) => f.id === Number(initialFundId));
      if (fund) {
        const rate = fund.currency_exchangeRate || 1;
        setForm((prev) => ({
          ...prev,
          fund_id: Number(initialFundId),
          fund_exchangeRate: rate,
          currency_code: fund.currency_code || "",
          currency_symbol: fund.currency_symbol || "",
        }));
      }
    }
  }, [isOpen, initialFundId, funds]);

  const handleFundChange = (e) => {
    const fundId = Number(e.target.value);
    const fund = funds.find((f) => f.id === fundId);
    const rate = fund?.currency_exchangeRate || 1;
    const currentBase = Number(form.amount_in_base || 0);

    setForm((prev) => ({
      ...prev,
      fund_id: fundId,
      fund_exchangeRate: rate,
      collected_amount: rate === 1 ? currentBase : currentBase * rate,
      currency_code: fund?.currency_code || "",
      currency_symbol: fund?.currency_symbol || "",
    }));
  };

  const handleBaseAmountChange = (val) => {
    const parsed = val === "" ? null : Number(val);
    const isValid = parsed !== null && !isNaN(parsed);

    setForm((prev) => ({
      ...prev,
      amount_in_base: val, // raw string — keeps "5." intact while typing
      collected_amount: !isValid
        ? ""
        : prev.fund_exchangeRate === 1
          ? parsed
          : parsed * prev.fund_exchangeRate,
    }));
  };
  const effectiveRate = useMemo(() => {
    if (!form.amount_in_base) return form.fund_exchangeRate;
    return Number(form.collected_amount || 0) / Number(form.amount_in_base);
  }, [form.collected_amount, form.amount_in_base, form.fund_exchangeRate]);

  // Auto-generated note: "[Income/Expense] of [amount] [currency] [from/to]
  // [party name] via [fund name]" — regenerates whenever the underlying facts
  // change, unless the person has taken over the field themselves.
  const autoNote = useMemo(() => {
    if (!form.amount_in_base || !selectedFund) return "";

    const amountLabel = money
      ? money(Number(form.amount_in_base))
      : `${form.amount_in_base} ${form.currency_symbol || form.currency_code || ""}`.trim();

    const partyLabel = selectedParty?.name || t(`ui.${partyType}`);
    const fundLabel = selectedFund?.name || "";

    return mode === "in"
      ? t("screens.payments.auto_note_in", {
          amount: amountLabel,
          party: partyLabel,
          fund: fundLabel,
          defaultValue: `Received ${amountLabel} from ${partyLabel} into ${fundLabel}`,
        })
      : t("screens.payments.auto_note_out", {
          amount: amountLabel,
          party: partyLabel,
          fund: fundLabel,
          defaultValue: `Paid ${amountLabel} to ${partyLabel} from ${fundLabel}`,
        });
  }, [
    form.amount_in_base,
    form.currency_symbol,
    form.currency_code,
    selectedFund,
    selectedParty,
    partyType,
    mode,
    money,
    t,
  ]);

  useEffect(() => {
    if (!noteEdited && autoNote) {
      setForm((prev) => ({ ...prev, note: autoNote }));
    }
  }, [autoNote, noteEdited]);

  const submit = async () => {
    if (!form.fund_id) {
      setMessage(t("screens.payments.please_select_fund_first"));
      return;
    }
    if (!form.party_id) {
      setMessage(t("screens.payments.please_select_linked_account"));
      return;
    }
    if (!form.amount_in_base || Number(form.amount_in_base) <= 0) {
      setMessage(t("screens.payments.please_enter_valid_amount"));
      return;
    }

    const paymentData = {
      type: mode === "in" ? "income" : "expense",
      party_type: partyType,
      party_id: Number(form.party_id),
      fund_id: Number(form.fund_id),
      amount: Number(form.amount_in_base),
      exchange_rate: form.fund_exchangeRate,
      collected_amount: Number(form.collected_amount || 0),
      effective_rate: effectiveRate,
      currency_code: form.currency_code,
      currency_symbol: form.currency_symbol,
      note: form.note || autoNote,
      mode: partyType,
      created_by: user.id,
    };

    setLoading(true);
    setMessage("");

    try {
      const res = await api.createPayment({
        ...paymentData,
        invoiceId: null,
      });

      if (!res.success) throw new Error(res.message);

      setMessage(t("screens.payments.receipt_saved_successfully"));

      if (refetchList) {
        await refetchList();
      }

      setTimeout(() => onClose(), 800);
    } catch (err) {
      setMessage(err.message || t("screens.payments.unexpected_error_posting"));
    } finally {
      setLoading(false);
    }
  };

  return {
    form,
    funds,
    partiesList,
    partyType,
    setPartyType,
    loading,
    message,
    effectiveRate,
    isFundLocked,
    selectedFund,
    selectedParty,
    handleChange,
    handleFundChange,
    handleBaseAmountChange,
    submit,
    money,
    t,
  };
};

export default useAddFundPayment;
