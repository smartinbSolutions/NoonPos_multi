// packages/app/src/backend/services/payment/party/allocateSupplierPayment.service.js
import createPaymentAllocation from "../../../utils/createPaymentAllocations";

export default async function allocateSupplierPayment(query, data) {
  let remainingAmount = Number(data.amount);

  if (remainingAmount <= 0) {
    return { allocations: [], remainingAmount: 0 };
  }

  if (data.invoiceId && data.invoiceType) {
    const table =
      data.invoiceType === "expense" ? "expense" : "purchase_invoices";

    const { rows } = await query(
      `SELECT
        id,
        net_total,
        net_total - COALESCE((
          SELECT SUM(amount)
          FROM payment_allocations
          WHERE invoice_id = ${table}.id
            AND invoice_type = $1
        ), 0) AS remaining
      FROM ${table}
      WHERE id = $2 AND supplier_id = $3`,
      [data.invoiceType, data.invoiceId, data.supplierId],
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
      invoice_type: data.invoiceType,
      amount: paymentAmount,
    });

    return {
      allocations: [
        {
          invoiceId: invoice.id,
          invoiceType: data.invoiceType,
          amount: paymentAmount,
        },
      ],
      remainingAmount: remainingAmount - paymentAmount,
    };
  }

  const { rows: purchaseInvoices } = await query(
    `SELECT
      id,
      date,
      net_total,
      net_total - COALESCE((
        SELECT SUM(amount)
        FROM payment_allocations
        WHERE invoice_id = purchase_invoices.id
          AND invoice_type = 'purchase'
      ), 0) AS remaining,
      'purchase' AS invoice_type
    FROM purchase_invoices
    WHERE supplier_id = $1`,
    [data.supplierId],
  );

  const { rows: expenseInvoices } = await query(
    `SELECT
      id,
      date,
      net_total,
      net_total - COALESCE((
        SELECT SUM(amount)
        FROM payment_allocations
        WHERE invoice_id = expense.id
          AND invoice_type = 'expense'
      ), 0) AS remaining,
      'expense' AS invoice_type
    FROM expense
    WHERE supplier_id = $1`,
    [data.supplierId],
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
      AND party_type = 'supplier'
      AND record_type = 'opening_balance'`,
    [data.supplierId],
  );

  const invoices = [...purchaseInvoices, ...expenseInvoices, ...openingBalance]
    .filter((invoice) => Number(invoice.remaining) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const allocations = [];

  for (const invoice of invoices) {
    if (remainingAmount <= 0) break;

    const invoiceRemaining = Number(invoice.remaining);
    if (invoiceRemaining <= 0) continue;

    const paymentAmount = Math.min(remainingAmount, invoiceRemaining);

    await createPaymentAllocation(query, {
      payment_id: data.paymentId,
      invoice_id: invoice.id,
      invoice_type: invoice.invoice_type,
      amount: paymentAmount,
    });

    allocations.push({
      invoiceId: invoice.id,
      invoiceType: invoice.invoice_type,
      amount: paymentAmount,
    });

    remainingAmount -= paymentAmount;
  }

  return { allocations, remainingAmount };
}
