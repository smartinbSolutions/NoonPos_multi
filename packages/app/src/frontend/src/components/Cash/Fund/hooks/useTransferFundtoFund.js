import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import usePrimaryCurrency from "../../../../Global/usePrimaryCurrency";
import { useAuth } from "../../../../Global/AuthContext";

const todayStr = () => new Date().toISOString().slice(0, 10);

const makeEmptyForm = () => ({
  from_fund_id: "",
  to_fund_id: "",
  amount: "", // deduct amount, in source fund's currency
  receive_amount: "", // editable, in destination fund's currency
  note: "",
  date: todayStr(),
});

// `transfer` is optional — when present, the hook operates in edit mode
// against that existing fund_transfers row instead of creating a new one.
//
// `lockedFromFundId` is optional too — when present (and not editing), the
// source fund is fixed to it (e.g. opened from a specific fund's row in
// FundList, where the user already picked the source by clicking that row).
const useTransferFundtoFund = ({
  isOpen,
  onClose,
  refetchList,
  transfer,
  lockedFromFundId,
}) => {
  const api = window.api;
  const { t } = useTranslation();
  const { money } = usePrimaryCurrency();
  const { user } = useAuth();

  const isEditMode = Boolean(transfer?.id);
  const isSourceLocked = Boolean(lockedFromFundId) && !isEditMode;

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [funds, setFunds] = useState([]);
  const [minDate, setMinDate] = useState(null);

  const [form, setForm] = useState(makeEmptyForm);

  // Tracks whether the person has manually typed their own note — once they
  // have, auto-generation stops overwriting it. Editing an existing transfer
  // starts with noteEdited = true, since that note was already deliberate.
  const [noteEdited, setNoteEdited] = useState(false);

  const sourceFund = useMemo(
    () => funds.find((f) => f.id === Number(form.from_fund_id)),
    [funds, form.from_fund_id]
  );

  const targetFund = useMemo(
    () => funds.find((f) => f.id === Number(form.to_fund_id)),
    [funds, form.to_fund_id]
  );

  // True only while editing AND both fund selections still match the
  // transfer's original funds. Recomputed fresh every render — the moment
  // either fund is actually changed, this is false immediately, no extra
  // reselect step needed.
  const isUnchangedFromOriginal =
    isEditMode &&
    Number(form.from_fund_id) === Number(transfer?.from_fund_id) &&
    Number(form.to_fund_id) === Number(transfer?.to_fund_id);

  const refetch = useCallback(async () => {
    if (!api) return;

    try {
      const res = await api.getFunds();
      setFunds(res || []);
    } catch (err) {
      console.error(err);
    }
  }, [api]);

  // A transfer touches two funds at once, so it can't be dated before
  // either fund's earliest history — otherwise you'd be backdating money
  // movement into a fund's ledger before that fund "existed" on paper.
  // minDate is the LATER of the two funds' earliest dates.
  const refetchMinDate = useCallback(async () => {
    if (!api || !form.from_fund_id || !form.to_fund_id) {
      setMinDate(null);
      return;
    }

    try {
      const [fromRes, toRes] = await Promise.all([
        api.getFundEarliestDate({ fundId: form.from_fund_id }),
        api.getFundEarliestDate({ fundId: form.to_fund_id }),
      ]);

      const fromMin = fromRes?.minDate ? fromRes.minDate.slice(0, 10) : null;
      const toMin = toRes?.minDate ? toRes.minDate.slice(0, 10) : null;

      if (fromMin && toMin) {
        setMinDate(fromMin > toMin ? fromMin : toMin);
      } else {
        setMinDate(fromMin || toMin || null);
      }
    } catch (err) {
      console.error(err);
      setMinDate(null);
    }
  }, [api, form.from_fund_id, form.to_fund_id]);

  useEffect(() => {
    if (!isOpen) return;

    refetch();

    if (isEditMode) {
      setForm({
        from_fund_id: transfer.from_fund_id,
        to_fund_id: transfer.to_fund_id,
        amount: transfer.deduct_amount,
        receive_amount: transfer.receive_amount,
        note: transfer.note || "",
        date: transfer.date ? transfer.date.slice(0, 10) : todayStr(),
      });
      setNoteEdited(true); // existing note is deliberate, don't auto-overwrite it
    } else if (isSourceLocked) {
      setForm({ ...makeEmptyForm(), from_fund_id: lockedFromFundId });
      setNoteEdited(false);
    } else {
      setForm(makeEmptyForm());
      setNoteEdited(false);
    }

    setMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    refetch,
    isEditMode,
    transfer?.id,
    isSourceLocked,
    lockedFromFundId,
  ]);

  // Refetch the floor whenever both funds are known (selection changed, or
  // edit mode just populated both from the existing transfer).
  useEffect(() => {
    refetchMinDate();
  }, [refetchMinDate]);

  // If the floor arrives (or moves) after the date was already set, and the
  // current date now violates it, clamp forward rather than leaving an
  // invalid date sitting in the field.
  useEffect(() => {
    if (minDate && form.date && form.date < minDate) {
      setForm((prev) => ({ ...prev, date: minDate }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate]);

  const handleSourceFundChange = (e) => {
    const id = Number(e.target.value);

    setForm((prev) => ({
      ...prev,
      from_fund_id: id,
      to_fund_id: prev.to_fund_id === id ? "" : prev.to_fund_id,
    }));
  };

  const handleNoteChange = (val) => {
    setNoteEdited(true);
    setForm((prev) => ({ ...prev, note: val }));
  };

  const sourceRate = Number(sourceFund?.currency_exchangeRate || 1);
  const targetRate = Number(targetFund?.currency_exchangeRate || 1);

  // Today's actual fund-to-fund cross-rate. Always live — this is purely
  // informational ("what would this convert to right now"), never locked
  // to a historical value, since the stored transfer.exchange_rate can be
  // stale or simply wrong (funds re-rate over time) and showing a stale
  // number here would be misleading, not helpful.
  const nominalRate = useMemo(() => {
    if (!sourceRate) return 1;
    return targetRate / sourceRate;
  }, [sourceRate, targetRate]);

  // Whether this transfer actually crosses currencies. Deliberately based
  // on the funds' currency codes, NOT on "is nominalRate !== 1" — a stored
  // or live rate can coincidentally equal 1 (or be wrong, as seen with a
  // saved exchange_rate of 1 on a USD→TL transfer) without the transfer
  // being same-currency. Comparing currency codes directly is the only
  // reliable signal.
  const isCrossCurrency = Boolean(
    sourceFund &&
    targetFund &&
    sourceFund.currency_code !== targetFund.currency_code
  );

  const workingRate = isUnchangedFromOriginal
    ? Number(transfer?.effective_rate) || nominalRate
    : nominalRate;

  useEffect(() => {
    if (isUnchangedFromOriginal) return;

    const amount = Number(form.amount || 0);

    if (!amount || !sourceFund || !targetFund) {
      setForm((prev) => ({ ...prev, receive_amount: "" }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      receive_amount: Number((amount * workingRate).toFixed(4)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingRate, sourceFund, targetFund, isUnchangedFromOriginal]);

  // Same pattern as AddPayment's amount_in_base / collected_amount:
  // changing the deduct amount rescales receive_amount using workingRate
  // (the transfer's own effective_rate while unchanged, otherwise today's
  // live fund rate) — overwriting any prior manual edit — while editing
  // receive_amount directly is a separate, independent action.
  const handleAmountChange = (val) => {
    const parsed = val === "" ? null : Number(val);
    const receive =
      parsed === null || isNaN(parsed) || !sourceFund || !targetFund
        ? ""
        : Number((parsed * workingRate).toFixed(4));

    setForm((prev) => ({
      ...prev,
      amount: val, // keep raw string so "5." doesn't collapse mid-typing
      receive_amount: receive,
    }));
  };

  const handleReceiveAmountChange = (val) => {
    setForm((prev) => ({
      ...prev,
      receive_amount: val, // same — raw string while typing
    }));
  };

  // What the transfer will actually record, once both amounts are known —
  // can differ from nominalRate if receive_amount was manually adjusted.
  const effectiveRate = useMemo(() => {
    const amount = Number(form.amount || 0);
    const receive = Number(form.receive_amount || 0);
    if (!amount) return workingRate;
    return receive / amount;
  }, [form.amount, form.receive_amount, workingRate]);

  // Live-generated note: "Transferred [amount] from [source] to
  // [destination]" — includes the receive amount too when cross-currency,
  // so the note itself documents any conversion that happened.
  const autoNote = useMemo(() => {
    if (!form.amount || !sourceFund || !targetFund) return "";

    const deductLabel = `${form.amount} ${
      sourceFund.currency_symbol || sourceFund.currency_code || ""
    }`.trim();

    if (isCrossCurrency && form.receive_amount) {
      const receiveLabel = `${form.receive_amount} ${
        targetFund.currency_symbol || targetFund.currency_code || ""
      }`.trim();

      return t("screens.transfer.auto_note_cross_currency", {
        deductAmount: deductLabel,
        receiveAmount: receiveLabel,
        source: sourceFund.name,
        destination: targetFund.name,
        defaultValue: `Transferred ${deductLabel} from ${sourceFund.name}, received ${receiveLabel} in ${targetFund.name}`,
      });
    }

    return t("screens.transfer.auto_note", {
      amount: deductLabel,
      source: sourceFund.name,
      destination: targetFund.name,
      defaultValue: `Transferred ${deductLabel} from ${sourceFund.name} to ${targetFund.name}`,
    });
  }, [
    form.amount,
    form.receive_amount,
    sourceFund,
    targetFund,
    isCrossCurrency,
    t,
  ]);

  useEffect(() => {
    if (!noteEdited && autoNote) {
      setForm((prev) => ({ ...prev, note: autoNote }));
    }
  }, [autoNote, noteEdited]);

  const submit = async () => {
    if (!form.from_fund_id || !form.to_fund_id) {
      setMessage(t("screens.transfer.selectBothFunds"));
      return;
    }

    if (form.from_fund_id === form.to_fund_id) {
      setMessage(t("screens.transfer.sameFundError"));
      return;
    }

    if (Number(form.amount) <= 0) {
      setMessage(t("errors.validAmount"));
      return;
    }

    if (Number(form.receive_amount) <= 0) {
      setMessage(t("screens.transfer.validReceiveAmount"));
      return;
    }

    if (!form.date) {
      setMessage(t("errors.dateRequired"));
      return;
    }

    if (minDate && form.date < minDate) {
      setMessage(
        t("errors.dateBeforeMin", { date: minDate }) ||
          `Date cannot be before ${minDate}`
      );
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const payload = {
        from_fund_id: Number(form.from_fund_id),
        to_fund_id: Number(form.to_fund_id),
        deduct_amount: Number(form.amount),
        receive_amount: Number(form.receive_amount),
        note: form.note || autoNote,
        date: form.date,
        created_by: user.id,
      };

      const res = isEditMode
        ? await api.updateFundTransfer({ id: transfer.id, ...payload })
        : await api.transferFundToFund(payload);

      if (!res.success) {
        throw new Error(res.message);
      }

      if (refetchList) {
        await refetchList();
      }

      onClose();
    } catch (err) {
      setMessage(err.message || "An error occurred during transfer.");
    } finally {
      setLoading(false);
    }
  };

  return {
    funds,
    form,
    setForm,
    sourceFund,
    targetFund,
    sourceRate,
    targetRate,
    nominalRate,
    isCrossCurrency,
    effectiveRate,
    loading,
    message,
    isEditMode,
    isSourceLocked,
    handleSourceFundChange,
    handleAmountChange,
    handleReceiveAmountChange,
    handleNoteChange,
    submit,
    t,
    minDate,
  };
};

export default useTransferFundtoFund;
