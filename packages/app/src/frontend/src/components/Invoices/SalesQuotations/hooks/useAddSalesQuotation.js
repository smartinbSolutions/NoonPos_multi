// useAddSalesQuotation.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../../Global/AuthContext";

const emptyItem = {
  product_id: null,
  product_name: "",
  product_code: "",
  entered_quantity: 1,
  entered_price: 0,
  quantity: 1,
  price: 0,
  total: 0,
  available_units: [],
  unit_id: null,
  unit_name: "",
  unit_conversion_factor: 1,
  discount_rate: 0,
  discount: 0,
  tax_id: null,
  tax_rate: 0,
  taxValue: 0,
  tax_capable: false,
  description: "",
};

const emptyQuotation = {
  customer_id: "",
  quotation_name: "",
  date: new Date().toISOString().slice(0, 10),
  status: "draft",
  discount_rate: 0,
  discount: 0,
  taxes: [], // array of { id, name, rate }
  description: "",
};

// Same total/quantity/price cascade as sales — no buyingPrice, since a
// quotation never touches stock or COGS.
function recalcItem(item) {
  const enteredQuantity = Number(item.entered_quantity || 0);
  const enteredPrice = Number(item.entered_price || 0);
  const factor = Number(item.unit_conversion_factor || 1);

  const total = enteredQuantity * enteredPrice;
  const quantity = enteredQuantity * factor;
  const price = factor > 0 ? enteredPrice / factor : enteredPrice;

  const discountRate = Number(item.discount_rate || 0);
  const discount = total * (discountRate / 100);
  const afterDiscount = total - discount;

  const taxRate = Number(item.tax_rate || 0);
  const taxValue = afterDiscount * (taxRate / 100);

  return {
    ...item,
    entered_quantity: enteredQuantity,
    entered_price: enteredPrice,
    quantity,
    price,
    total,
    discount_rate: discountRate,
    discount,
    tax_rate: taxRate,
    taxValue,
  };
}

export default function useAddSalesQuotation({ customerModalOpen } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const api = window.api;
  const { user } = useAuth();

  const [quotation, setQuotationState] = useState(emptyQuotation);
  const [items, setItems] = useState([emptyItem]);
  const [products, setProducts] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [tagIds, setTagIds] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const setQuotation = (updater) => {
    setQuotationState((prev) =>
      typeof updater === "function" ? updater(prev) : { ...prev, ...updater },
    );
  };

  const refetch = useCallback(async () => {
    if (!api) return;

    try {
      setLoading(true);

      const [res, taxRes, custRes] = await Promise.all([
        api.getProducts({ page: 1, limit: 200 }),
        api.getTaxes(),
        api.getCustomers(),
      ]);

      setProducts(res?.data || []);
      setTaxes(taxRes || []);
      setCustomers(custRes || []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refetch();
  }, [refetch, customerModalOpen]);

  const addItem = () => {
    setItems((prev) => [...prev, emptyItem]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Explicit pick from the catalog — real product, real unit list.
  const selectProductForItem = async (index, productId) => {
    if (!productId) return;

    try {
      const fullProduct = await api.getProduct(productId);
      if (!fullProduct) return;

      const productUnits = fullProduct.productUnits || [];
      const baseUnit = productUnits.find((u) => u.is_base) || null;

      setItems((prev) => {
        const copy = [...prev];
        const current = copy[index];

        copy[index] = recalcItem({
          ...current,
          product_id: fullProduct.id,
          product_name: fullProduct.name,
          product_code: fullProduct.code || "",
          available_units: productUnits,
          unit_id: baseUnit?.id ?? null,
          unit_name: baseUnit?.unit_name || "",
          unit_conversion_factor: 1,
          entered_quantity: current.entered_quantity || 1,
          entered_price: Number(baseUnit?.sale_price || 0),
          tax_id: fullProduct.tax_id || null,
          tax_rate: Number(fullProduct.tax_rate || 0),
          tax_capable: Boolean(fullProduct.tax_id),
        });

        return copy;
      });
    } catch (err) {
      console.error("Failed to load product detail:", err);
    }
  };

  // Free-typed name with no catalog match — product_id stays null, exactly
  // as the schema allows. Quantity/price/tax still work normally; there's
  // just no unit list and nothing to snapshot from a real product row.
  const setItemProductName = (index, name) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        product_id: null,
        product_name: name,
        product_code: "",
        available_units: [],
        unit_id: null,
        unit_name: copy[index].unit_name || "",
        unit_conversion_factor: 1,
      };
      return copy;
    });
  };
  const updateItemUnit = (index, unitId) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = copy[index];
      const selectedUnit = item.available_units?.find(
        (u) => u.id === Number(unitId),
      );

      if (!selectedUnit) return prev;

      const factor = selectedUnit.is_base
        ? 1
        : Number(selectedUnit.conversion_factor || 1);

      copy[index] = recalcItem({
        ...item,
        unit_id: selectedUnit.id,
        unit_name: selectedUnit.unit_name,
        unit_conversion_factor: factor,
        entered_price: Number(selectedUnit.sale_price || 0),
      });

      return copy;
    });
  };

  const updateItem = (index, key, value) => {
    if (key === "product_id") {
      selectProductForItem(index, value);
      return;
    }
    if (key === "product_name") {
      setItemProductName(index, value);
      return;
    }

    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], [key]: value };
      copy[index] = recalcItem(item);
      return copy;
    });
  };

  const updateItemDiscountRate = (index, rate) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = recalcItem({
        ...copy[index],
        discount_rate: Number(rate || 0),
      });
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

  // ---- Quotation-level cascade — identical shape to invoice ----

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.total || 0), 0),
    [items],
  );

  const itemDiscountTotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.discount || 0), 0),
    [items],
  );

  const afterItemDiscounts = useMemo(
    () => subtotal - itemDiscountTotal,
    [subtotal, itemDiscountTotal],
  );

  const itemTaxTotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.taxValue || 0), 0),
    [items],
  );

  const itemTaxSummary = useMemo(() => {
    const groups = new Map();
    for (const item of items) {
      if (!item.tax_id || !item.tax_rate) continue;
      const key = item.tax_id;
      if (!groups.has(key)) {
        groups.set(key, { tax_id: item.tax_id, rate: item.tax_rate, value: 0 });
      }
      groups.get(key).value += item.taxValue || 0;
    }
    return Array.from(groups.values());
  }, [items]);

  const itemDiscountSummary = useMemo(() => {
    const groups = new Map();
    for (const item of items) {
      const rate = Number(item.discount_rate || 0);
      if (!rate) continue;
      if (!groups.has(rate)) groups.set(rate, { rate, amount: 0 });
      groups.get(rate).amount += item.discount || 0;
    }
    return Array.from(groups.values());
  }, [items]);

  const quotationDiscount = useMemo(() => {
    const rate = Number(quotation.discount_rate || 0);
    return afterItemDiscounts * (rate / 100);
  }, [afterItemDiscounts, quotation.discount_rate]);

  const afterQuotationDiscount = useMemo(
    () => afterItemDiscounts - quotationDiscount,
    [afterItemDiscounts, quotationDiscount],
  );

  const setQuotationDiscountRate = (rate) => {
    setQuotation((prev) => ({ ...prev, discount_rate: Number(rate || 0) }));
  };

  const setQuotationDiscountAmount = (amount) => {
    const amt = Number(amount || 0);
    const rate = afterItemDiscounts > 0 ? (amt / afterItemDiscounts) * 100 : 0;
    setQuotation((prev) => ({ ...prev, discount_rate: rate }));
  };

  const clearQuotationDiscount = () => {
    setQuotation((prev) => ({ ...prev, discount_rate: 0 }));
  };

  const quotationTaxValue = useMemo(() => {
    const list = quotation.taxes || [];
    return list.reduce((sum, tax) => {
      const rate = Number(tax.rate || 0);
      return sum + afterQuotationDiscount * (rate / 100);
    }, 0);
  }, [afterQuotationDiscount, quotation.taxes]);

  const addQuotationTax = (selectedTax) => {
    if (!selectedTax?.id) return;
    setQuotation((prev) => {
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

  const removeQuotationTax = (taxId) => {
    setQuotation((prev) => ({
      ...prev,
      taxes: (prev.taxes || []).filter((t) => t.id !== taxId),
    }));
  };

  const clearQuotationTaxes = () => {
    setQuotation((prev) => ({ ...prev, taxes: [] }));
  };

  const netTotal = useMemo(
    () =>
      Math.max(0, afterQuotationDiscount + itemTaxTotal + quotationTaxValue),
    [afterQuotationDiscount, itemTaxTotal, quotationTaxValue],
  );

  const submit = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiNotAvailable"));
      return;
    }

    const usableItems = items.filter(
      (i) => (i.product_id || i.product_name?.trim()) && i.entered_quantity > 0,
    );

    if (!usableItems.length) {
      setError(t("errors.addOneItem"));
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        ...quotation,
        taxes: (quotation.taxes || []).map((t) => t.id),
        discount: quotationDiscount,
        taxValue: quotationTaxValue,
        subtotal,
        net_total: netTotal,
        items: usableItems.map((i) => ({
          ...i,
          name: i.product_name,
          code: i.product_code,
        })),
        created_by: user.id,
      };

      const res = await api.createSalesQuotation(payload);

      if (!res?.success) {
        throw new Error(res?.error || t("errors.createQuotationFailed"));
      }

      if (res.quotationId && tagIds.length > 0) {
        await api.setEntityTags("sales_quotation", res.quotationId, tagIds);
      }

      setQuotation(emptyQuotation);
      setItems([emptyItem]);
      setTagIds([]);
      navigate("/sales-quotations");
      return res;
    } catch (err) {
      setError(err?.message || t("errors.saveError"));
      return { success: false, error: err?.message };
    } finally {
      setSaving(false);
    }
  }, [
    api,
    quotation,
    items,
    subtotal,
    netTotal,
    quotationDiscount,
    quotationTaxValue,
    navigate,
    t,
    user,
    tagIds,
  ]);

  return {
    quotation,
    setQuotation,
    addQuotationTax,
    removeQuotationTax,
    clearQuotationTaxes,
    setQuotationDiscountRate,
    setQuotationDiscountAmount,
    clearQuotationDiscount,
    items,
    products,
    customers,
    taxes,
    tagIds,
    setTagIds,
    addItem,
    removeItem,
    updateItem,
    updateItemUnit,
    updateItemDiscountRate,
    updateItemDiscountAmount,
    clearItemDiscount,
    updateItemTax,
    enableItemTax,
    disableItemTax,
    updateItemDescription,
    submit,
    subtotal,
    itemDiscountSummary,
    itemTaxSummary,
    quotationDiscount,
    quotationTaxValue,
    netTotal,
    loading,
    saving,
    error,
    navigate,
    api,
    setProducts,
    refetch,
  };
}
