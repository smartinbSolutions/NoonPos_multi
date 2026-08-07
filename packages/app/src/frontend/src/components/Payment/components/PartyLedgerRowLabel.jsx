/**
 * Builds the human-readable sentence for a single party_history row
 * (payment / invoice / return / opening_balance), scoped to which
 * party type's ledger is currently being viewed (customer/supplier/partner).
 *
 * Plain function, not a component — it's called once per row inside a
 * .map(), so it must not use hooks (useTranslation, etc.) itself.
 * The caller passes in `t` from its own useTranslation() call instead.
 */
export default function partyLedgerRowLabel({
  row,
  partyName,
  partyType,
  t,
  formattedAmount,
}) {
  const fund = row.fund_name || t("ui.fund", "Fund");

  if (row.record_type === "opening_balance") {
    const isPositive = row.movement_type === "increase";

    return isPositive
      ? t("screens.ledger.openingBalancePositiveFor", {
          party: partyName,
          amount: formattedAmount,
          defaultValue: `${partyName} started with a balance of ${formattedAmount}`,
        })
      : t("screens.ledger.openingBalanceNegativeFor", {
          party: partyName,
          amount: formattedAmount,
          defaultValue: `${partyName} started owing ${formattedAmount}`,
        });
  }

  if (row.record_type === "payment") {
    if (partyType === "customer") {
      return row.movement_type === "decrease"
        ? t("screens.ledger.paymentCustomerToFund", {
            party: partyName,
            fund,
            defaultValue: `Payment has been paid from customer ${partyName} to ${fund}`,
          })
        : t("screens.ledger.paymentFundToCustomer", {
            party: partyName,
            fund,
            defaultValue: `Payment has been paid from ${fund} to customer ${partyName}`,
          });
    }

    if (partyType === "supplier") {
      return row.movement_type === "decrease"
        ? t("screens.ledger.paymentFundToSupplier", {
            party: partyName,
            fund,
            defaultValue: `Payment has been paid from ${fund} to supplier ${partyName}`,
          })
        : t("screens.ledger.paymentSupplierToFund", {
            party: partyName,
            fund,
            defaultValue: `Payment has been paid from supplier ${partyName} to ${fund}`,
          });
    }

    // partner
    return row.movement_type === "increase"
      ? t("screens.ledger.paymentPartnerToFund", {
          party: partyName,
          fund,
          defaultValue: `Payment has been paid from partner ${partyName} to ${fund}`,
        })
      : t("screens.ledger.paymentFundToPartner", {
          party: partyName,
          fund,
          defaultValue: `Payment has been paid from ${fund} to partner ${partyName}`,
        });
  }

  if (row.record_type === "invoice" || row.record_type === "return") {
    const typeLabel = t(
      `screens.invoices.invoiceType.${row.invoice_type}`,
      row.invoice_type
    );

    return row.record_type === "return"
      ? t("screens.ledger.returnCreatedFor", {
          type: typeLabel,
          party: partyName,
          defaultValue: `${typeLabel} return created for ${partyName}`,
        })
      : t("screens.ledger.invoiceCreatedFor", {
          type: typeLabel,
          party: partyName,
          defaultValue: `${typeLabel} created for ${partyName}`,
        });
  }

  return t("ui.transaction", "Transaction");
}
