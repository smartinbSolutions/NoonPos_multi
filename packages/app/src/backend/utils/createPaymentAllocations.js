export default function createPaymentAllocation(db, allocation) {
  const stmt = db.prepare(`
    INSERT INTO payment_allocations (
      payment_id,
      invoice_id,
      invoice_type,
      amount
    )
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(
    allocation.payment_id,
    allocation.invoice_id,
    allocation.invoice_type,
    Number(allocation.amount),
  );

  return result.lastInsertRowid;
}
