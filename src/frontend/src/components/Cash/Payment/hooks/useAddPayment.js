import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { useAuth } from "../../../../Global/AuthContext";

const todayStr = () => new Date().toISOString().slice(0, 10);

const useAddPayment = ({
  isOpen,
  onClose,
  onSubmit,
  invoice,
  totalAmount,
  party,
  partyName,
  mode,
  refetchList,
  confirmLabel,
}) => {
  const { t } = useTranslation();
  const api = window.api;

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [funds, setFunds] = useState([]);
  const { money } = usePrimaryCurrency();
  const { user } = useAuth();

  const isPurchase = mode === "purchase";
  const isExpense = mode === "expense";
  const isPurchaseReturn = mode === "purchase_return";
  const isSalesReturn = mode === "sales_return";
  const isSales = mode === "sales";
  const isPartner = mode === "partner";
  const isCustomer = mode === "customer";
  const isSupplier = mode === "supplier";
  const isCollectorMode = !invoice;

  // Embedded in an invoice-creation form: payment date follows the invoice's
  // own date once it's created, so no picker is shown here at all.
  const isEmbeddedInCreation = isCollectorMode && !!onSubmit;
  // Direct party-ledger payment with no invoice attached (customer/supplier/
  // partner collection) — floor is the party's opening balance / earliest entry.
  const isDirectCollection = isCollectorMode && !onSubmit;

  const partyType =
    isPurchase || isExpense || isSupplier || isPurchaseReturn
      ? "supplier"
      : isSales || isCustomer || isSalesReturn
        ? "customer"
        : "partner";

  const initialBaseAmount = invoice
    ? Number(invoice.remaining_amount || 0)
    : Number(totalAmount || 0);

  const [form, setForm] = useState({
    fund_id: "",
    fund_exchangeRate: 1,
    amount_in_base: 0,
    collected_amount: 0,
    currency_code: "",
    currency_symbol: "",
    note: "",
    partner_transaction_type: "",
    date: todayStr(),
  });

  const [availableCredit, setAvailableCredit] = useState(0);
  const [useCredit, setUseCredit] = useState(false);
  const [minDate, setMinDate] = useState(null);

  const showDatePicker = !isEmbeddedInCreation && !useCredit;

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const refetch = useCallback(async () => {
    if (!api) return;
    const res = await api.getFunds();
    setFunds(res || []);
  }, [api]);

  const refetchCredit = useCallback(async () => {
    if (!api || !party || partyType === "partner" || isDirectCollection) {
      setAvailableCredit(0);
      return;
    }
    try {
      const res =
        partyType === "supplier"
          ? await api.getSupplierCredit(party)
          : await api.getCustomerCredit(party);
      setAvailableCredit(res?.totalAvailable || 0);
    } catch (err) {
      setAvailableCredit(0);
    }
  }, [api, party, partyType, isDirectCollection]);

  // Determine the earliest allowed date for this payment.
  const refetchMinDate = useCallback(async () => {
    if (isEmbeddedInCreation) {
      setMinDate(null);
      return;
    }
    if (invoice?.date) {
      setMinDate(invoice.date.slice(0, 10));
      return;
    }
    if (isDirectCollection && api && party) {
      try {
        const res = await api.getPartyEarliestDate({
          partyId: party,
          partyType,
        });
        setMinDate(res?.minDate ? res.minDate.slice(0, 10) : null);
      } catch {
        setMinDate(null);
      }
      return;
    }
    setMinDate(null);
  }, [
    api,
    invoice,
    party,
    partyType,
    isEmbeddedInCreation,
    isDirectCollection,
  ]);

  useEffect(() => {
    if (isOpen) {
      refetch();
      refetchCredit();
      refetchMinDate();
      setUseCredit(false);

      setForm({
        fund_id: "",
        fund_exchangeRate: 1,
        amount_in_base: initialBaseAmount,
        collected_amount: initialBaseAmount,
        currency_code: "",
        currency_symbol: "",
        note: "",
        partner_transaction_type: "income",
        date: invoice?.date ? invoice.date.slice(0, 10) : todayStr(),
      });

      setMessage("");
    }
  }, [
    isOpen,
    refetch,
    refetchCredit,
    refetchMinDate,
    invoice,
    initialBaseAmount,
  ]);

  // If the floor arrives after the form's default date was set (async fetch),
  // and the current date would violate it, clamp forward.
  useEffect(() => {
    if (minDate && form.date && form.date < minDate) {
      setForm((prev) => ({ ...prev, date: minDate }));
    }
  }, [minDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFundChange = (e) => {
    const fundId = Number(e.target.value);
    const fund = funds.find((f) => f.id === fundId);
    const rate = fund?.currency_exchangeRate || 1;
    const currentBase = form.amount_in_base || initialBaseAmount;

    setForm((prev) => ({
      ...prev,
      fund_id: fundId,
      fund_exchangeRate: rate,
      amount_in_base: currentBase,
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
      amount_in_base: val, // raw string — preserves "5." and empty state
      collected_amount: !isValid
        ? ""
        : prev.fund_exchangeRate === 1
          ? parsed
          : parsed * prev.fund_exchangeRate,
    }));
  };

  const toggleUseCredit = () => {
    setUseCredit((prev) => {
      const next = !prev;
      if (next) {
        const capped = Math.min(
          availableCredit,
          initialBaseAmount || availableCredit
        );
        setForm((f) => ({
          ...f,
          fund_id: "",
          amount_in_base: capped,
          collected_amount: capped,
        }));
      }
      return next;
    });
  };

  const effectiveRate = useMemo(() => {
    if (!form.amount_in_base) return form.fund_exchangeRate;
    return Number(form.collected_amount || 0) / Number(form.amount_in_base);
  }, [form.collected_amount, form.amount_in_base, form.fund_exchangeRate]);

  const submit = async () => {
    if (!useCredit && !form.fund_id) {
      setMessage(t("ui.selectFundRequired"));
      return;
    }
    if (Number(form.amount_in_base) <= 0) {
      setMessage(t("errors.validAmount"));
      return;
    }
    if (useCredit && Number(form.amount_in_base) > availableCredit) {
      setMessage(t("errors.creditExceeded"));
      return;
    }
    if (showDatePicker) {
      if (!form.date) {
        setMessage(t("errors.dateRequired"));
        return;
      }
      if (minDate && form.date < minDate) {
        setMessage(t("errors.dateBeforeMin", { date: minDate }));
        return;
      }
    }

    const paymentType =
      isPurchase || isExpense || isSupplier || isSalesReturn
        ? "expense"
        : isSales || isCustomer || isPurchaseReturn
          ? "income"
          : form.partner_transaction_type;

    const paymentData = {
      type: paymentType,
      party_type: partyType,
      party_id: party,
      fund_id: useCredit ? null : form.fund_id,
      amount: Number(form.amount_in_base),
      exchange_rate: form.fund_exchangeRate,
      collected_amount: Number(form.collected_amount || 0),
      effective_rate: effectiveRate,
      currency_code: form.currency_code,
      currency_symbol: form.currency_symbol,
      note: form.note,
      mode,
      source: useCredit ? "credit" : "new",
      created_by: user.id,
      date: showDatePicker ? form.date : undefined,
    };

    if (isCollectorMode && onSubmit) {
      onSubmit?.(paymentData);
      onClose();
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      let res;
      if (useCredit) {
        res = await api.applyInvoiceCredit({
          partyId: party,
          partyType,
          invoiceId: invoice?.id,
          invoiceType: mode,
          amount: Number(form.amount_in_base),
          created_by: user.id,
        });
        if (!res.success) throw new Error(res.error);
      } else {
        res = await api.createPayment({
          ...paymentData,
          invoiceId: invoice?.id || null,
        });
        if (!res.success) throw new Error(res.message);
      }

      setMessage(t("screens.payments.saved"));

      if (refetchList) {
        await refetchList();
      }

      setTimeout(() => onClose(), 700);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    form,
    funds,
    loading,
    message,
    effectiveRate,
    handleChange,
    handleFundChange,
    handleBaseAmountChange,
    submit,
    isPartner,
    isPurchase,
    isExpense,
    isSales,
    isCustomer,
    isSupplier,
    isCollectorMode,
    initialBaseAmount,
    t,
    isPurchaseReturn,
    isSalesReturn,
    money,
    availableCredit,
    useCredit,
    toggleUseCredit,
    showDatePicker,
    minDate,
  };
};

export default useAddPayment;
