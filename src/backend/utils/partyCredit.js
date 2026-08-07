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

function getOpenInvoicesForParty(db, { partyId, partyType }) {
  const configs = OPEN_INVOICE_TABLES[partyType] || [];
  const openInvoices = [];

  for (const { invoice_type, table, column } of configs) {
    const rows = db
      .prepare(
        `
        SELECT
          inv.id AS invoice_id,
          inv.date,
          inv.net_total - COALESCE(SUM(pa.amount), 0) AS remaining
        FROM ${table} inv
        LEFT JOIN payment_allocations pa
          ON pa.invoice_id = inv.id AND pa.invoice_type = ?
        WHERE inv.${column} = ?
        GROUP BY inv.id
        HAVING remaining > 0
        `
      )
      .all(invoice_type, partyId);

    rows.forEach((r) =>
      openInvoices.push({
        invoice_id: r.invoice_id,
        invoice_type,
        date: r.date,
        remaining: r.remaining,
      })
    );
  }

  openInvoices.sort((a, b) => new Date(a.date) - new Date(b.date));
  return openInvoices;
}

export function getPartyCredit(db, { partyId, partyType }) {
  const payments = db
    .prepare(
      `
      SELECT
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
      WHERE p.party_id = ?
        AND p.party_type = ?
      GROUP BY p.id
      HAVING available > 0
      ORDER BY p.date ASC
    `
    )
    .all(partyId, partyType);

  const totalAvailable = payments.reduce((sum, p) => sum + p.available, 0);

  return {
    totalAvailable,
    payments,
  };
}

export function applyPartyCredit(
  db,
  { partyId, partyType, invoiceId, invoiceType, amount }
) {
  const unallocated = db
    .prepare(
      `
      SELECT
        p.id AS payment_id,
        p.amount - COALESCE(SUM(pa.amount), 0) AS available
      FROM payments p
      LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
      WHERE p.party_id = ?
        AND p.party_type = ?
      GROUP BY p.id
      HAVING available > 0
      ORDER BY p.date ASC
    `
    )
    .all(partyId, partyType);

  const requested = Number(amount || 0);
  let remaining = requested;
  let totalApplied = 0;

  // No specific invoice given — instead of a specific target, close
  // whatever open invoices this party has, oldest first, using the
  // same unallocated payments, oldest first.
  if (!invoiceId) {
    const openInvoices = getOpenInvoicesForParty(db, { partyId, partyType });
    let paymentIdx = 0;

    for (const invoice of openInvoices) {
      if (remaining <= 0) break;
      let invoiceRemaining = invoice.remaining;

      while (
        invoiceRemaining > 0 &&
        remaining > 0 &&
        paymentIdx < unallocated.length
      ) {
        const payment = unallocated[paymentIdx];

        if (payment.available <= 0) {
          paymentIdx++;
          continue;
        }

        const take = Math.min(payment.available, invoiceRemaining, remaining);

        createPaymentAllocation(db, {
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

    const take = Math.min(payment.available, remaining);

    createPaymentAllocation(db, {
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
