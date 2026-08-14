// packages/app/src/backend/utils/createPayment.js
import createPaymentAllocation from "./createPaymentAllocations";
import createPartyHistory from "./createPaymentHistory";

export default async function createPayment(query, data) {
  const paymentDate = data.date;

  const { rows } = await query(
    `INSERT INTO payments (
      type, party_type, party_id, fund_id, amount, note,
      currency_code, exchange_rate, effective_rate, amount_fund_currency,
      invoice_type, date, created_by
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id`,
    [
      data.type,
      data.party_type,
      data.party_id || null,
      data.fund_id,
      Number(data.amount || 0),
      data.note || "",
      data.currency_code,
      Number(data.exchange_rate || 1),
      Number(data.effective_rate || 1),
      Number(data.amount_fund_currency || 0),
      data.invoice_type || null,
      paymentDate,
      data.created_by,
    ],
  );
  const paymentId = rows[0].id;

  if (data.invoice_id != null) {
    await createPaymentAllocation(query, {
      payment_id: paymentId,
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
    await createPartyHistory(query, {
      party_type: data.party_type,
      party_id: data.party_id,
      record_type: "payment",
      invoice_id: data.invoice_id,
      invoice_type: "payment",
      amount: data.amount,
      movement_type: movementType,
      note: data.note,
      payment_id: paymentId,
      date: paymentDate,
    });
  }

  return paymentId;
}
