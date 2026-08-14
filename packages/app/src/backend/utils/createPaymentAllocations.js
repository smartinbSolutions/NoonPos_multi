// packages/app/src/backend/utils/createPaymentAllocations.js
export default async function createPaymentAllocation(query, allocation) {
  const { rows } = await query(
    `INSERT INTO payment_allocations (payment_id, invoice_id, invoice_type, amount)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      allocation.payment_id,
      allocation.invoice_id,
      allocation.invoice_type,
      Number(allocation.amount),
    ],
  );

  return rows[0].id;
}
