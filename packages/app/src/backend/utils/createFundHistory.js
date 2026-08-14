// packages/app/src/backend/utils/createFundHistory.js
export default async function createFundHistory(query, data) {
  return query(
    `INSERT INTO fund_history (
      fund_id,
      record_type,
      payment_id,
      date,
      movement_type,
      amount,
      note
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      data.fund_id,
      data.record_type,
      data.payment_id ?? null,
      data.date || new Date().toISOString(),
      data.movement_type,
      Number(data.amount || 0),
      data.note ?? "",
    ],
  );
}
