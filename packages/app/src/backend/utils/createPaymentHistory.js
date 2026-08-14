// packages/app/src/backend/utils/createPaymentHistory.js
export default async function createPartyHistory(query, data) {
  return query(
    `INSERT INTO party_history (
      party_type,
      party_id,
      record_type,
      invoice_id,
      invoice_type,
      payment_id,
      movement_type,
      amount,
      date,
      note
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      data.party_type,
      data.party_id,
      data.record_type,
      data.invoice_id ?? null,
      data.invoice_type ?? null,
      data.payment_id ?? null,
      data.movement_type,
      Number(data.amount || 0),
      data.date || new Date().toISOString(),
      data.note ?? "",
    ],
  );
}
