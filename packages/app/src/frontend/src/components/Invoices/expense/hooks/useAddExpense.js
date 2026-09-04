import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../../Global/AuthContext";

const NO_SUPPLIER = "none";

const emptyItem = {
  category_id: "",
  price: 0,
  total: 0,
  discount_rate: 0,
  discount: 0,
  tax_id: null,
  tax_rate: 0,
  taxValue: 0,
  tax_capable: false,
  description: "",
};

const emptyInvoice = {
  supplier_id: NO_SUPPLIER,
  date: new Date().toISOString().slice(0, 10),
  discount_rate: 0,
  discount: 0,
  taxes: [],
  description: "",
};

// total is just price (no quantity for expense line items). discount/taxValue
// layer on top of total, same cascade shape as sales/purchase.
function recalcItem(item) {
  const price = Number(item.price || 0);
  const total = price;

  const discountRate = Number(item.discount_rate || 0);
  const discount = total * (discountRate / 100);
  const afterDiscount = total - discount;

  const taxRate = Number(item.tax_rate || 0);
  const taxValue = afterDiscount * (taxRate / 100);

  return {
    ...item,
    total,
    discount_rate: discountRate,
    discount,
    tax_rate: taxRate,
    taxValue,
  };
}

const useAddExpense = ({ supplierModalOpen }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const api = window.api;
  const { user } = useAuth();

  const [invoice, setInvoice] = useState(emptyInvoice);
  const [items, setItems] = useState([emptyItem]);

  const [category, setCategory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [tagIds, setTagIds] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refetch = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiNotAvailable"));
      return;
    }

    try {
      setLoading(true);

      const [categoryRes, suppliersRes, taxesRes] = await Promise.all([
        api.getExpensesCategory(),
        api.getSuppliers(),
        api.getTaxes(),
      ]);

      setCategory(categoryRes || []);
      setSuppliers(suppliersRes || []);
      setTaxes(taxesRes || []);

      setError("");
    } catch (err) {
      setError(err?.message || t("errors.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    refetch();
  }, [refetch, supplierModalOpen]);

  const supplierOptions = useMemo(
    () => [
      { id: NO_SUPPLIER, name: t("ui.noSupplier") },
      ...(Array.isArray(suppliers?.data) ? suppliers?.data : []),
    ],
    [suppliers, t],
  );

  const addItem = () => {
    setItems((prev) => [...prev, emptyItem]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index, key, value) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], [key]: value };
      copy[index] = recalcItem(item);
      return copy;
    });
  };

  // ---- Item discount: hidden by default, revealed via "+", dual %/value ----

  const updateItemDiscountRate = (index, rate) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], discount_rate: Number(rate || 0) };
      copy[index] = recalcItem(item);
      return copy;
    });
  };

  const updateItemDiscountAmount = (index, amount) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = copy[index];
      const total = item.total || 0;
      const amt = Number(amount || 0);
      const rate = total > 0 ? (amt / total) * 100 : 0;

      copy[index] = recalcItem({ ...item, discount_rate: rate, discount: amt });
      return copy;
    });
  };

  const clearItemDiscount = (index) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = recalcItem({
        ...copy[index],
        discount_rate: 0,
        discount: 0,
      });
      return copy;
    });
  };

  const updateItemDescription = (index, description) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], description };
      return copy;
    });
  };

  // ---- Item tax ----

  const updateItemTax = (index, taxId, taxRate) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = recalcItem({
        ...copy[index],
        tax_id: taxId || null,
        tax_rate: Number(taxRate || 0),
      });
      return copy;
    });
  };

  const enableItemTax = (index) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], tax_capable: true };
      return copy;
    });
  };

  const disableItemTax = (index) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = recalcItem({
        ...copy[index],
        tax_capable: false,
        tax_id: null,
        tax_rate: 0,
      });
      return copy;
    });
  };

  // ---- Invoice-level cascade: subtotal -> item discounts -> item tax ->
  // invoice discount -> invoice tax -> net_total ----

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.total || 0), 0);
  }, [items]);

  const itemDiscountTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.discount || 0), 0);
  }, [items]);

  const afterItemDiscounts = useMemo(() => {
    return subtotal - itemDiscountTotal;
  }, [subtotal, itemDiscountTotal]);

  const itemTaxTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.taxValue || 0), 0);
  }, [items]);

  const itemTaxSummary = useMemo(() => {
    const groups = new Map();

    for (const item of items) {
      if (!item.tax_id || !item.tax_rate) continue;

      const afterDiscount = (item.total || 0) - (item.discount || 0);
      const key = item.tax_id;

      if (!groups.has(key)) {
        groups.set(key, {
          tax_id: item.tax_id,
          rate: item.tax_rate,
          base: 0,
          value: 0,
        });
      }

      const group = groups.get(key);
      group.base += afterDiscount;
      group.value += item.taxValue || 0;
    }

    return Array.from(groups.values());
  }, [items]);

  const itemDiscountSummary = useMemo(() => {
    const groups = new Map();

    for (const item of items) {
      const rate = Number(item.discount_rate || 0);
      if (!rate) continue;

      if (!groups.has(rate)) {
        groups.set(rate, { rate, base: 0, amount: 0 });
      }

      const group = groups.get(rate);
      group.base += item.total || 0;
      group.amount += item.discount || 0;
    }

    return Array.from(groups.values());
  }, [items]);

  // ---- Invoice-level discount ----

  const invoiceDiscount = useMemo(() => {
    const rate = Number(invoice.discount_rate || 0);
    return afterItemDiscounts * (rate / 100);
  }, [afterItemDiscounts, invoice.discount_rate]);

  const afterInvoiceDiscount = useMemo(() => {
    return afterItemDiscounts - invoiceDiscount;
  }, [afterItemDiscounts, invoiceDiscount]);

  const setInvoiceDiscountRate = (rate) => {
    setInvoice((prev) => ({ ...prev, discount_rate: Number(rate || 0) }));
  };

  const setInvoiceDiscountAmount = (amount) => {
    const amt = Number(amount || 0);
    const rate = afterItemDiscounts > 0 ? (amt / afterItemDiscounts) * 100 : 0;
    setInvoice((prev) => ({ ...prev, discount_rate: rate }));
  };

  const clearInvoiceDiscount = () => {
    setInvoice((prev) => ({ ...prev, discount_rate: 0 }));
  };

  // ---- Invoice-level taxes: PARALLEL, mirrors sales/purchase ----

  const invoiceTaxValue = useMemo(() => {
    const invTaxes = invoice.taxes || [];
    return invTaxes.reduce((sum, tax) => {
      const rate = Number(tax.rate || 0);
      return sum + afterInvoiceDiscount * (rate / 100);
    }, 0);
  }, [afterInvoiceDiscount, invoice.taxes]);

  const addInvoiceTax = (selectedTax) => {
    if (!selectedTax?.id) return;

    setInvoice((prev) => {
      const current = prev.taxes || [];
      if (current.some((t) => t.id === selectedTax.id)) return prev;

      return {
        ...prev,
        taxes: [
          ...current,
          {
            id: selectedTax.id,
            name: selectedTax.name,
            rate: Number(selectedTax.rate || 0),
          },
        ],
      };
    });
  };

  const removeInvoiceTax = (taxId) => {
    setInvoice((prev) => ({
      ...prev,
      taxes: (prev.taxes || []).filter((t) => t.id !== taxId),
    }));
  };

  const clearInvoiceTaxes = () => {
    setInvoice((prev) => ({ ...prev, taxes: [] }));
  };

  const netTotal = useMemo(() => {
    return Math.max(0, afterInvoiceDiscount + itemTaxTotal + invoiceTaxValue);
  }, [afterInvoiceDiscount, itemTaxTotal, invoiceTaxValue]);

  const submit = useCallback(
    async (paymentData = null) => {
      if (!api) {
        setError(t("errors.apiNotAvailable"));
        return;
      }

      if (!items.length) {
        setError(t("errors.addOneItem"));
        return;
      }

      try {
        setSaving(true);
        setError("");

        const payload = {
          ...invoice,
          supplier_id:
            invoice.supplier_id === NO_SUPPLIER ? null : invoice.supplier_id,
          taxes: (invoice.taxes || []).map((t) => t.id),
          discount: invoiceDiscount,
          taxValue: invoiceTaxValue,
          subtotal,
          net_total: netTotal,
          items,
          payment: paymentData,
          created_by: user.id,
        };

        const res = await api.createExpense(payload);

        if (!res?.success) {
          throw new Error(res?.error || t("errors.createInvoiceFailed"));
        }

        if (res.invoiceId && tagIds.length > 0) {
          await api.setEntityTags("expense", res.invoiceId, tagIds);
        }

        setInvoice(emptyInvoice);
        setItems([emptyItem]);

        navigate("/expense");

        return res;
      } catch (err) {
        setError(err?.message || t("errors.createInvoiceFailed"));
        return { success: false, error: err?.message };
      } finally {
        setSaving(false);
      }
    },
    [
      api,
      invoice,
      items,
      subtotal,
      netTotal,
      invoiceDiscount,
      invoiceTaxValue,
      navigate,
      t,
      user,
      tagIds,
    ],
  );

  const reset = () => {
    setInvoice(emptyInvoice);
    setItems([emptyItem]);
    setTagIds([]);
    setError("");
  };

  return {
    invoice,
    setInvoice,
    addInvoiceTax,
    removeInvoiceTax,
    clearInvoiceTaxes,
    setInvoiceDiscountRate,
    setInvoiceDiscountAmount,
    clearInvoiceDiscount,
    items,
    setItems,

    supplierOptions,
    category,
    taxes,
    tagIds,
    setTagIds,

    loading,
    saving,
    error,

    addItem,
    removeItem,
    updateItem,
    updateItemDiscountRate,
    updateItemDiscountAmount,
    clearItemDiscount,
    updateItemDescription,
    updateItemTax,
    enableItemTax,
    disableItemTax,

    subtotal,
    itemDiscountSummary,
    itemTaxSummary,
    invoiceDiscount,
    invoiceTaxValue,
    netTotal,

    submit,
    reset,
    refetch,
  };
};

export default useAddExpense;
