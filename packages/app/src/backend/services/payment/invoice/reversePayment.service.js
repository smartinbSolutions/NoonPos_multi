// packages/app/src/backend/services/payment/invoice/reversePayment.service.js
export default async function reversePayment(query, payment) {
  await query("DELETE FROM payment_allocations WHERE payment_id = $1", [
    payment.id,
  ]);
}
