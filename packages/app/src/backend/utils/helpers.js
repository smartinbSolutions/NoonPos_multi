// packages/app/src/backend/utils/helpers.js

// Reuses the same three-language convention as seedData's TRANSLATIONS.
const INVOICE_LABELS = {
  sales: { en: "Sales Invoice", ar: "فاتورة مبيعات", tr: "Satış Faturası" },
  purchase: {
    en: "Purchase Invoice",
    ar: "فاتورة مشتريات",
    tr: "Alış Faturası",
  },
  expense: { en: "Expense", ar: "مصروف", tr: "Gider" },
  sales_return: {
    en: "Sales Return",
    ar: "مرتجع مبيعات",
    tr: "Satış İadesi",
  },
  purchase_return: {
    en: "Purchase Return",
    ar: "مرتجع مشتريات",
    tr: "Alış İadesi",
  },
  sales_quotation: {
    en: "Sales Quotation",
    ar: "عرض سعر مبيعات",
    tr: "Satış Teklifi",
  },
};

const PAYMENT_LABELS = {
  payment: { en: "Payment", ar: "دفعة", tr: "Ödeme" },
  refund: { en: "Refund", ar: "استرداد", tr: "İade" },
};

const FOR_INVOICE_LABEL = {
  en: "for Invoice",
  ar: "لفاتورة",
  tr: "faturası için",
};

const OPENING_BALANCE_LABEL = {
  en: "Opening Balance",
  ar: "الرصيد الافتتاحي",
  tr: "Açılış Bakiyesi",
};

export const toAppFileUrl = (filePath) =>
  `app-file://local/${encodeURIComponent(filePath)}`;

export const fromAppFileUrl = (url) => {
  const prefix = "app-file://local/";
  if (typeof url !== "string" || !url.startsWith(prefix)) {
    return null;
  }
  try {
    return decodeURIComponent(url.slice(prefix.length));
  } catch {
    return null;
  }
};

// Best-effort logo cleanup. Never throws — a stray orphaned file on disk is a
// minor, recoverable problem; failing the product update/delete the user is
// waiting on because a filesystem op hiccuped is not an acceptable tradeoff.
export function deleteLogoFile(logoValue) {
  const fs = require("fs");

  try {
    const filePath = fromAppFileUrl(logoValue);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("Failed to delete logo file:", logoValue, err);
  }
}

// PORTED: async, takes the query function instead of a synchronous db
// instance. All callers below now await this.
export async function getCompanyLanguage(query) {
  const { rows } = await query(
    "SELECT language FROM company_settings ORDER BY id LIMIT 1",
  );
  const lang = rows[0]?.language;
  return ["ar", "en", "tr"].includes(lang) ? lang : "ar";
}

export async function buildDefaultInvoiceName(query, type, invoiceId) {
  const lang = await getCompanyLanguage(query);
  const label = INVOICE_LABELS[type][lang];
  return `${label} #${invoiceId}`;
}

// e.g. "Purchase Return #7 for Invoice #3" / "مرتجع مشتريات #7 لفاتورة #3"
export async function buildDefaultReturnNote(
  query,
  type,
  returnId,
  originalInvoiceId,
) {
  const lang = await getCompanyLanguage(query);
  const label = INVOICE_LABELS[type][lang];
  const forWord = FOR_INVOICE_LABEL[lang];
  return `${label} #${returnId} ${forWord} #${originalInvoiceId}`;
}

// e.g. "Refund #7" / "استرداد #7"
export async function buildDefaultPaymentNote(query, kind, referenceId) {
  const lang = await getCompanyLanguage(query);
  const label = PAYMENT_LABELS[kind][lang];
  return `${label} #${referenceId}`;
}

export async function buildOpeningBalanceNote(query) {
  const lang = await getCompanyLanguage(query);
  return OPENING_BALANCE_LABEL[lang];
}
