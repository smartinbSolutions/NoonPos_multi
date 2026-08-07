export default function reversePayment(db, payment) {
  db.prepare(
    `
    DELETE FROM payment_allocations
    WHERE payment_id = ?
    `,
  ).run(payment.id);
}
