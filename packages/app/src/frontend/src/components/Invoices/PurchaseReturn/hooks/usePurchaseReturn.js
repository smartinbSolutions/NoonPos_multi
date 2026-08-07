import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../../Global/AuthContext";

export default function usePurchaseReturn() {
  const { t } = useTranslation();
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const api = window.api;

  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getPurchaseInvoiceById(invoiceId);

      if (!data) {
        setError(t("screens.invoices.notFound"));
        return;
      }

      setInvoice(data);
      setItems(
        (data.items || []).map((item) => {
          const factor = Number(item.unit_conversion_factor || 1);

          // available_quantity from the backend is always BASE-unit. We
          // convert to the purchase unit here purely for input/display —
          // the stored factor/unit_name on this item are a permanent
          // snapshot from time of purchase, so this works even if the unit
          // itself is later renamed or deleted.
          return {
            ...item,
            unit_conversion_factor: factor,
            available_unit_quantity:
              factor > 0
                ? Number(item.available_quantity || 0) / factor
                : Number(item.available_quantity || 0),
            returnUnitQuantity: 0,
          };
        })
      );
      setError("");
    } catch (err) {
      setError(err.message || t("errors.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api, invoiceId, t]);

  useEffect(() => {
    load();
  }, [load]);

  // value entered is in the ORIGINAL PURCHASE UNIT (e.g. Box), capped at
  // however many of that unit are still available to return.
  const updateQuantity = (itemId, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const raw = Math.max(0, Number(value) || 0);
        const max = Number(item.available_unit_quantity || 0);
        const qty = Math.min(raw, max);

        return { ...item, returnUnitQuantity: qty };
      })
    );
  };

  const returnAll = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        returnUnitQuantity: Number(item.available_unit_quantity || 0),
      }))
    );
  };

  const clearAll = () => {
    setItems((prev) =>
      prev.map((item) => ({ ...item, returnUnitQuantity: 0 }))
    );
  };

  // ---- Live preview of the same fractional cascade the backend applies.
  // Rates are always inherited from the original invoice/item, never
  // editable here. Quantity entered in the purchase unit is converted back
  // to BASE units here — this base quantity is what actually gets sent to
  // the backend and is what price/discount/tax math operates on, matching
  // how the original purchase itself was always recorded in base units. ----

  const preparedItems = useMemo(() => {
    return items
      .filter((item) => Number(item.returnUnitQuantity) > 0)
      .map((item) => {
        const factor = Number(item.unit_conversion_factor || 1);
        const unitQty = Number(item.returnUnitQuantity);
        const baseQty = Number((unitQty * factor).toFixed(4));

        const price = Number(item.price || 0);
        const total = Number((baseQty * price).toFixed(2));

        const discountRate = Number(item.discount_rate || 0);
        const discount = Number((total * (discountRate / 100)).toFixed(2));
        const afterDiscount = total - discount;

        const taxRate = Number(item.tax_rate || 0);
        const taxValue = Number((afterDiscount * (taxRate / 100)).toFixed(2));

        return {
          purchase_invoice_item_id: item.id,
          product_id: item.product_id,
          name: item.name,
          unit_name: item.unit_name,
          unitQty,
          quantity: baseQty,
          price,
          total,
          discount_rate: discountRate,
          discount,
          tax_rate: taxRate,
          taxValue,
        };
      });
  }, [items]);

  const subtotal = useMemo(() => {
    return preparedItems.reduce((sum, i) => sum + i.total, 0);
  }, [preparedItems]);

  const itemDiscountTotal = useMemo(() => {
    return preparedItems.reduce((sum, i) => sum + i.discount, 0);
  }, [preparedItems]);

  const itemTaxTotal = useMemo(() => {
    return preparedItems.reduce((sum, i) => sum + i.taxValue, 0);
  }, [preparedItems]);

  const afterItemDiscounts = useMemo(() => {
    return subtotal - itemDiscountTotal;
  }, [subtotal, itemDiscountTotal]);

  const invoiceDiscountRate = Number(invoice?.discount_rate || 0);
  const invoiceTaxRate = Number(invoice?.taxRate || 0);
  const invoiceTaxes = invoice?.taxes || [];

  const invoiceDiscount = useMemo(() => {
    return Number(
      ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2)
    );
  }, [afterItemDiscounts, invoiceDiscountRate]);

  const afterInvoiceDiscount = useMemo(() => {
    return afterItemDiscounts - invoiceDiscount;
  }, [afterItemDiscounts, invoiceDiscount]);

  const invoiceTaxValue = useMemo(() => {
    return Number(((afterInvoiceDiscount * invoiceTaxRate) / 100).toFixed(2));
  }, [afterInvoiceDiscount, invoiceTaxRate]);

  const netTotal = useMemo(() => {
    return Math.max(
      0,
      Number((afterInvoiceDiscount + itemTaxTotal + invoiceTaxValue).toFixed(2))
    );
  }, [afterInvoiceDiscount, itemTaxTotal, invoiceTaxValue]);

  // Optionally takes paymentData collected by AddPayment in collector mode
  // (mode="purchase_return"), same pattern useAddPurchase's submit already
  // uses. If present, the return is recorded as refunded through that fund
  // right away; if absent (null), the return is saved with no refund yet —
  // the supplier owes nothing back until a payment is added later.
  const submit = async (paymentData = null) => {
    if (preparedItems.length === 0) {
      setError(t("errors.noItemsSelected"));
      return { success: false };
    }

    if (netTotal <= 0) {
      setError(t("errors.invalidReturnTotal"));
      return { success: false };
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        purchase_invoice_id: invoice.id,
        supplier_id: invoice.supplier_id,
        date: new Date().toISOString().slice(0, 10),
        description: note,
        created_by: user.id,
        items: preparedItems.map((i) => ({
          purchase_invoice_item_id: i.purchase_invoice_item_id,
          product_id: i.product_id,
          quantity: i.quantity, // base-unit quantity, already converted
        })),
        payment: paymentData,
      };

      const result = await api.createPurchaseReturn(payload);

      if (!result?.success) {
        setError(result?.error || t("errors.saveFailed"));
        return { success: false, error: result?.error };
      }

      navigate("/purchase");
      return { success: true };
    } catch (err) {
      setError(err.message || t("errors.saveFailed"));
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  };
  return {
    invoice,
    items,
    note,
    setNote,
    updateQuantity,
    returnAll,
    clearAll,
    subtotal,
    itemDiscountTotal,
    itemTaxTotal,
    invoiceDiscount,
    invoiceTaxValue,
    netTotal,
    invoiceDiscountRate,
    afterInvoiceDiscount,
    invoiceTaxRate,
    invoiceTaxes,
    loading,
    saving,
    error,
    submit,
  };
}
