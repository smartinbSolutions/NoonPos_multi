export default function createFundHistory(db, data) {
  const stmt = db.prepare(`
    INSERT INTO fund_history (
      fund_id,
      record_type,
      payment_id,
      date,
      movement_type,
      amount,
      note
    )
    VALUES (
      @fund_id,
      @record_type,
      @payment_id,
      @date,
      @movement_type,
      @amount,
      @note
    )
  `);

  return stmt.run({
    fund_id: data.fund_id,
    record_type: data.record_type,
    payment_id: data.payment_id ?? null,
    movement_type: data.movement_type,
    amount: Number(data.amount || 0),
    note: data.note ?? "",
    date: data.date || new Date().toISOString(),
  });
}
