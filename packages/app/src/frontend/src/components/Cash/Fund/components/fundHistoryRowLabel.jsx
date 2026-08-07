/**
 * Builds the human-readable sentence for a single fund_history row
 * (payment / transfer / opening_balance), for the fund currently being
 * viewed. Plain function, not a component — called once per row inside
 * a .map(), so it must not use hooks itself; the caller passes `t` in.
 */
export default function fundHistoryRowLabel({ row, t }) {
  const isIn = row.movement_type === "in";
  const party = row.party_name || t("ui.unknown", "Unknown");

  if (row.record_type === "opening_balance") {
    return isIn
      ? t("screens.funds.openingBalancePositive", {
          amount: row.amount,
          defaultValue: `Fund started with an opening balance`,
        })
      : t("screens.funds.openingBalanceNegative", {
          amount: row.amount,
          defaultValue: `Fund started with a negative opening balance`,
        });
  }

  if (row.record_type === "transfer") {
    return isIn
      ? t("screens.funds.transferReceivedFrom", {
          fund: party,
          defaultValue: `Received transfer from ${party}`,
        })
      : t("screens.funds.transferSentTo", {
          fund: party,
          defaultValue: `Transferred to ${party}`,
        });
  }

  if (row.record_type === "payment") {
    if (row.party_type === "customer") {
      return isIn
        ? t("screens.funds.paymentFromCustomer", {
            party,
            defaultValue: `Payment received from customer ${party}`,
          })
        : t("screens.funds.refundToCustomer", {
            party,
            defaultValue: `Refund paid to customer ${party}`,
          });
    }

    if (row.party_type === "supplier") {
      return isIn
        ? t("screens.funds.refundFromSupplier", {
            party,
            defaultValue: `Refund received from supplier ${party}`,
          })
        : t("screens.funds.paymentToSupplier", {
            party,
            defaultValue: `Payment paid to supplier ${party}`,
          });
    }

    if (row.party_type === "partner") {
      return isIn
        ? t("screens.funds.depositFromPartner", {
            party,
            defaultValue: `Deposit received from partner ${party}`,
          })
        : t("screens.funds.withdrawalToPartner", {
            party,
            defaultValue: `Withdrawal paid to partner ${party}`,
          });
    }

    // party_type missing/unrecognized — still say something useful
    return isIn
      ? t("screens.funds.genericPaymentIn", "Payment received")
      : t("screens.funds.genericPaymentOut", "Payment made");
  }

  return t("ui.transaction", "Transaction");
}
