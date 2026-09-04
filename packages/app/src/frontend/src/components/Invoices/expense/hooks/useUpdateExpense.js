import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
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

const makeEmptyInvoice = () => ({
  supplier_id: NO_SUPPLIER,
  date: new Date().toISOString().slice(0, 10),
  discount_rate: 0,
  discount: 0,
  taxes: [],
  description: "",
  status: "unpaid",
});

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

const useUpdateExpense = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const api = window.api;
  const { user } = useAuth();

  const [invoice, setInvoice] = useState(makeEmptyInvoice);
  const [items, setItems] = useState([emptyItem]);

  const [category, setCategory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [tagIds, setTagIds] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refetch = useCallback(async () => {
    if (!api) return setError(t("errors.apiNotAvailable"));

    try {
      setLoading(true);

      const [catRes, supRes, taxRes] = await Promise.all([
        api.getExpensesCategory(),
        api.getSuppliers(),
        api.getTaxes(),
      ]);

      setCategory(catRes || []);
      setSuppliers(supRes || []);
      setTaxes(taxRes || []);
    } catch (err) {
      setError(err?.message || t("errors.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  const loadExpense = useCallback(async () => {
    if (!api || !id) return;

    try {
      setLoading(true);

      const res = await api.getExpense(id);

      if (!res) return;

      setInvoice({
        ...res,
        supplier_id: res.supplier_id || NO_SUPPLIER,
        date: res.date
          ? res.date.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        taxes: (res.taxes || []).map((t) => ({
          id: t.tax_id,
          name: t.tax_name,
          rate: t.tax_rate,
        })),
      });

      const tagsRes = await api.getEntityTags("expense", id);
      if (tagsRes.success) {
        setTagIds(tagsRes.data.map((tag) => tag.id));
      }

      setItems(
        (res.items || []).map((item) =>
          recalcItem({
            ...emptyItem,
            ...item,
            tax_capable: Boolean(item.tax_id),
          }),
        ),
      );
    } catch (err) {
      setError(err?.message || t("errors.loadExpenseFailed"));
    } finally {
      setLoading(false);
    }
  }, [api, id, t]);

  const supplierOptions = useMemo(
    () => [
      { id: NO_SUPPLIER, name: t("ui.noSupplier") },
      ...(Array.isArray(suppliers?.data) ? suppliers?.data : []),
    ],
    [suppliers, t],
  );

  useEffect(() => {
    refetch();
    loadExpense();
  }, [refetch, loadExpense]);

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

  // ---- Item discount ----

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

  // ---- Invoice-level cascade ----

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

  // ---- Invoice-level taxes ----

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
    async (paymentData) => {
      if (!api) return setError(t("errors.apiNotAvailable"));

      if (!items.some((i) => i.category_id)) {
        return setError(t("errors.addOneItem"));
      }

      try {
        setSaving(true);
        setError("");

        const payload = {
          ...invoice,
          id,
          supplier_id:
            invoice.supplier_id === NO_SUPPLIER ? null : invoice.supplier_id,
          taxes: (invoice.taxes || []).map((t) => t.id),
          discount: invoiceDiscount,
          taxValue: invoiceTaxValue,
          subtotal,
          net_total: netTotal,
          items,
          payment: paymentData || null,
          updated_by: user.id,
        };

        const res = await api.updateExpense(payload);

        if (!res?.success) {
          throw new Error(res?.error || t("errors.updateFailed"));
        }

        await api.setEntityTags("expense", id, tagIds);

        toast.success(t("success.updated", { field: t("ui.expense") }));
        navigate("/expense");
        return res;
      } catch (err) {
        setError(err?.message || t("errors.updateFailed"));
        return { success: false, error: err?.message };
      } finally {
        setSaving(false);
      }
    },
    [
      api,
      id,
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
    setInvoice(makeEmptyInvoice());
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

    category,
    supplierOptions,
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

    status: invoice.status,
  };
};

export default useUpdateExpense;
