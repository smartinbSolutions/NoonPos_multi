export default function applyPurchaseInvoicePayment(
  db,
  invoiceId,
  amount,
  mode,
) {
  const table = mode === "expense" ? "expense" : "purchase_invoices";

  const invoice = db
    .prepare(
      `
      SELECT
        net_total
      FROM ${table}
      WHERE id = ?
      `,
    )
    .get(invoiceId);

  if (!invoice) {
    throw new Error("INVOICE_NOT_FOUND");
  }

  const { paid_amount } = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(amount), 0) AS paid_amount
      FROM payment_allocations
      WHERE invoice_id = ?
        AND invoice_type = ?
      `,
    )
    .get(invoiceId, mode);

  return {
    paid_amount: Number(paid_amount),
  };
}
