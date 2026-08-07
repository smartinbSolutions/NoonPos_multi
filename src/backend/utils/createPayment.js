import createPaymentAllocation from "./createPaymentAllocations";
import createPartyHistory from "./createPaymentHistory";

export default function createPayment(db, data) {
  const insertPayment = db.prepare(`
    INSERT INTO payments (
      type,
      party_type,
      party_id,
      fund_id,
      amount,
      note,
      currency_code,
      exchange_rate,
      effective_rate,
      amount_fund_currency,
      invoice_type,
      date,
      created_by
    )
    VALUES (
      @type,
      @party_type,
      @party_id,
      @fund_id,
      @amount,
      @note,
      @currency_code,
      @exchange_rate,
      @effective_rate,
      @amount_fund_currency,
      @invoice_type,
      @date,
      @created_by
    )
  `);

  const paymentDate = data.date;

  const result = insertPayment.run({
    type: data.type,
    party_type: data.party_type,
    party_id: data.party_id || null,
    fund_id: data.fund_id,
    amount: Number(data.amount || 0),
    note: data.note || "",
    currency_code: data.currency_code,
    exchange_rate: Number(data.exchange_rate || 1),
    effective_rate: Number(data.effective_rate || 1),
    amount_fund_currency: Number(data.amount_fund_currency || 0),
    invoice_type: data.invoice_type || null,
    date: paymentDate,
    created_by: data.created_by,
  });

  if (data.invoice_id != null) {
    createPaymentAllocation(db, {
      payment_id: result.lastInsertRowid,
      invoice_id: data.invoice_id,
      invoice_type: data.invoice_type || null,
      amount: data.amount || 0,
    });
  }

  const isReturnRefund =
    data.invoice_type === "purchase_return" ||
    data.invoice_type === "sales_return";

  // For customer/supplier, a normal payment always decreases the amount owed.
  // A return refund is the opposite: the return itself already recorded a
  // 'decrease' (goods came back, debt dropped, possibly going negative).
  // Refunding cash back settles that debt upward again — so it must be an
  // 'increase', not skipped and not another decrease (which would double-count).
  // For partners, direction depends on which way the money moved:
  // a deposit (income) increases what the company owes the partner,
  // a withdrawal (expense) decreases it.
  const isPartner = data.party_type === "partner";
  const movementType = isReturnRefund
    ? "increase"
    : isPartner
      ? data.type === "income"
        ? "increase"
        : "decrease"
      : "decrease";

  if (data.party_type !== "walk-in") {
    createPartyHistory(db, {
      party_type: data.party_type,
      party_id: data.party_id,
      record_type: "payment",
      invoice_id: data.invoice_id,
      invoice_type: "payment",
      amount: data.amount,
      movement_type: movementType,
      note: data.note,
      payment_id: result.lastInsertRowid,
      date: paymentDate,
    });
  }

  return result.lastInsertRowid;
}
