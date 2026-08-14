// packages/app/src/backend/services/payment/party/allocateCustomerPayment.service.js
import createPaymentAllocation from "../../../utils/createPaymentAllocations";

export default async function allocateCustomerPayment(query, data) {
  let remainingAmount = Number(data.amount);

  if (remainingAmount <= 0) {
    return { allocations: [], remainingAmount: 0 };
  }

  const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

  // Targeted mode: a specific sales invoice was named.
  if (data.invoiceId && data.invoiceType === "sales") {
    const { rows } = await query(
      `SELECT
        i.id,
        i.net_total,
        i.net_total - COALESCE((
          SELECT SUM(amount)
          FROM payment_allocations
          WHERE invoice_id = i.id
            AND invoice_type = 'sales'
        ), 0) AS remaining
      FROM sales_invoices i
      WHERE i.id = $1 AND i.customer_id = $2`,
      [data.invoiceId, data.customerId],
    );
    const invoice = rows[0];

    if (!invoice || Number(invoice.remaining) <= 0) {
      return { allocations: [], remainingAmount };
    }

    const invoiceRemaining = Number(invoice.remaining);
    const paymentAmount = Math.min(remainingAmount, invoiceRemaining);

    await createPaymentAllocation(query, {
      payment_id: data.paymentId,
      invoice_id: invoice.id,
      invoice_type: "sales",
      amount: paymentAmount,
    });

    return {
      allocations: [{ invoiceId: invoice.id, amount: paymentAmount }],
      remainingAmount: roundToTwo(remainingAmount - paymentAmount),
    };
  }

  // Account-level mode (no specific invoice named): FIFO across every open
  // sales invoice AND opening balance for this customer, oldest first.
  const { rows: salesInvoices } = await query(
    `SELECT
      i.id,
      i.date,
      i.net_total,
      i.net_total - COALESCE(SUM(pa.amount), 0) AS remaining,
      'sales' AS invoice_type
    FROM sales_invoices i
    LEFT JOIN payment_allocations pa
      ON pa.invoice_id = i.id
     AND pa.invoice_type = 'sales'
    WHERE i.customer_id = $1
    GROUP BY i.id, i.net_total`,
    [data.customerId],
  );

  const { rows: openingBalance } = await query(
    `SELECT
      id,
      date,
      amount AS net_total,
      amount - COALESCE((
        SELECT SUM(amount)
        FROM payment_allocations
        WHERE invoice_id = party_history.id
          AND invoice_type = 'opening_balance'
      ), 0) AS remaining,
      'opening_balance' AS invoice_type
    FROM party_history
    WHERE party_id = $1
      AND party_type = 'customer'
      AND record_type = 'opening_balance'`,
    [data.customerId],
  );

  const invoices = [...salesInvoices, ...openingBalance]
    .filter((invoice) => Number(invoice.remaining) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const allocations = [];

  for (const invoice of invoices) {
    if (remainingAmount <= 0) break;

    const invoiceRemaining = Number(invoice.remaining);
    if (invoiceRemaining <= 0) continue;

    const paymentAmount = Math.min(remainingAmount, invoiceRemaining);

    allocations.push({ invoiceId: invoice.id, amount: paymentAmount });

    await createPaymentAllocation(query, {
      payment_id: data.paymentId,
      invoice_id: invoice.id,
      invoice_type: invoice.invoice_type,
      amount: paymentAmount,
    });

    remainingAmount = roundToTwo(remainingAmount - paymentAmount);
  }

  return { allocations, remainingAmount };
}
