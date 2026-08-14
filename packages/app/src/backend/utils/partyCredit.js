// packages/app/src/backend/utils/partyCredit.js
import createPaymentAllocation from "./createPaymentAllocations";

// Whitelisted table map — invoice_type is passed as a bound SQL parameter,
// table name is not (never interpolate a table name from user input).
const OPEN_INVOICE_TABLES = {
  customer: [
    { invoice_type: "sales", table: "sales_invoices", column: "customer_id" },
  ],
  supplier: [
    {
      invoice_type: "purchase",
      table: "purchase_invoices",
      column: "supplier_id",
    },
    { invoice_type: "expense", table: "expense", column: "supplier_id" },
  ],
};

async function getOpenInvoicesForParty(query, { partyId, partyType }) {
  const configs = OPEN_INVOICE_TABLES[partyType] || [];
  const openInvoices = [];

  for (const { invoice_type, table, column } of configs) {
    // Postgres can't reference a SELECT alias ("remaining") inside HAVING
    // in the same query — the expression must be repeated, same fix as
    // customers.ipc.js's balance filter.
    const { rows } = await query(
      `SELECT
        inv.id AS invoice_id,
        inv.date,
        inv.net_total - COALESCE(SUM(pa.amount), 0) AS remaining
      FROM ${table} inv
      LEFT JOIN payment_allocations pa
        ON pa.invoice_id = inv.id AND pa.invoice_type = $1
      WHERE inv.${column} = $2
      GROUP BY inv.id
      HAVING inv.net_total - COALESCE(SUM(pa.amount), 0) > 0`,
      [invoice_type, partyId],
    );

    rows.forEach((r) =>
      openInvoices.push({
        invoice_id: r.invoice_id,
        invoice_type,
        date: r.date,
        remaining: r.remaining,
      }),
    );
  }

  openInvoices.sort((a, b) => new Date(a.date) - new Date(b.date));
  return openInvoices;
}

export async function getPartyCredit(query, { partyId, partyType }) {
  const { rows: payments } = await query(
    `SELECT
      p.id AS payment_id,
      p.amount,
      p.date,
      p.currency_code,
      p.fund_id,
      f.name AS fund_name,
      COALESCE(SUM(pa.amount), 0) AS allocated,
      p.amount - COALESCE(SUM(pa.amount), 0) AS available
    FROM payments p
    LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
    LEFT JOIN funds f ON f.id = p.fund_id
    WHERE p.party_id = $1
      AND p.party_type = $2
    GROUP BY p.id, f.name
    HAVING p.amount - COALESCE(SUM(pa.amount), 0) > 0
    ORDER BY p.date ASC`,
    [partyId, partyType],
  );

  const totalAvailable = payments.reduce(
    (sum, p) => sum + Number(p.available),
    0,
  );

  return {
    totalAvailable,
    payments,
  };
}

export async function applyPartyCredit(
  query,
  { partyId, partyType, invoiceId, invoiceType, amount },
) {
  const { rows: unallocated } = await query(
    `SELECT
      p.id AS payment_id,
      p.amount - COALESCE(SUM(pa.amount), 0) AS available
    FROM payments p
    LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
    WHERE p.party_id = $1
      AND p.party_type = $2
    GROUP BY p.id
    HAVING p.amount - COALESCE(SUM(pa.amount), 0) > 0
    ORDER BY p.date ASC`,
    [partyId, partyType],
  );

  const requested = Number(amount || 0);
  let remaining = requested;
  let totalApplied = 0;

  if (!invoiceId) {
    const openInvoices = await getOpenInvoicesForParty(query, {
      partyId,
      partyType,
    });
    let paymentIdx = 0;

    for (const invoice of openInvoices) {
      if (remaining <= 0) break;
      let invoiceRemaining = Number(invoice.remaining);

      while (
        invoiceRemaining > 0 &&
        remaining > 0 &&
        paymentIdx < unallocated.length
      ) {
        const payment = unallocated[paymentIdx];
        payment.available = Number(payment.available);

        if (payment.available <= 0) {
          paymentIdx++;
          continue;
        }

        const take = Math.min(payment.available, invoiceRemaining, remaining);

        await createPaymentAllocation(query, {
          payment_id: payment.payment_id,
          invoice_id: invoice.invoice_id,
          invoice_type: invoice.invoice_type,
          amount: take,
        });

        payment.available -= take;
        invoiceRemaining -= take;
        remaining -= take;
        totalApplied += take;

        if (payment.available <= 0) paymentIdx++;
      }
    }

    if (totalApplied < requested) {
      throw new Error("INSUFFICIENT_CREDIT");
    }

    return totalApplied;
  }

  for (const payment of unallocated) {
    if (remaining <= 0) break;

    const available = Number(payment.available);
    const take = Math.min(available, remaining);

    await createPaymentAllocation(query, {
      payment_id: payment.payment_id,
      invoice_id: invoiceId,
      invoice_type: invoiceType,
      amount: take,
    });

    remaining -= take;
    totalApplied += take;
  }

  if (totalApplied < requested) {
    throw new Error("INSUFFICIENT_CREDIT");
  }

  return totalApplied;
}
