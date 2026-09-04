// useUpdateSalesQuotation.js
import { useCallback, useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../../Global/AuthContext";

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

// Reconstructs entered_quantity/entered_price from stored base-unit
// quantity/price + factor — inverse of recalcItem, same as invoices.
// product_id may be null here (typed-only line), unlike invoices.
function toEditableItem(raw, availableUnits) {
  const factor = Number(raw.unit_conversion_factor || 1);
  const baseQuantity = Number(raw.quantity || 0);
  const basePrice = Number(raw.price || 0);

  const enteredQuantity = factor > 0 ? baseQuantity / factor : baseQuantity;
  const enteredPrice = basePrice * factor;

  const matchedUnit =
    (availableUnits || []).find((u) => u.unit_name === raw.unit_name) ||
    (availableUnits || []).find(
      (u) => Number(u.conversion_factor || 1) === factor,
    ) ||
    (availableUnits || []).find((u) => u.is_base) ||
    null;

  return recalcItem({
    id: raw.id,
    product_id: raw.product_id,
    product_name: raw.name || raw.product_name || "",
    product_code: raw.product_code || "",
    entered_quantity: enteredQuantity,
    entered_price: enteredPrice,
    available_units: availableUnits || [],
    unit_id: matchedUnit?.id ?? null,
    unit_name: raw.unit_name || matchedUnit?.unit_name || "",
    unit_conversion_factor: factor,
    discount_rate: Number(raw.discount_rate || 0),
    discount: Number(raw.discount || 0),
    tax_id: raw.tax_id || null,
    tax_rate: Number(raw.tax_rate || 0),
    taxValue: Number(raw.taxValue || 0),
    tax_capable: Boolean(raw.tax_id),
    description: raw.description || "",
  });
}

export default function useUpdateSalesQuotation() {
  const { t } = useTranslation();
  const { id } = useParams();
  const api = window.api;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [quotation, setQuotationState] = useState(emptyQuotation);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [tagIds, setTagIds] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setQuotation = (updater) => {
    setQuotationState((prev) =>
      typeof updater === "function" ? updater(prev) : { ...prev, ...updater },
    );
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const [q, prodsRes, custsRes, taxRes] = await Promise.all([
        api.getSalesQuotationById(id),
        api.getProducts({ limit: 100 }),
        api.getCustomers(),
        api.getTaxes(),
      ]);

      if (!q) {
        setError(t("screens.quotations.notFound"));
        return;
      }

      setQuotationState({
        id: q.id,
        customer_id: q.customer_id,
        date: q.date?.slice(0, 10) || emptyQuotation.date,
        status: q.status || "draft",
        discount_rate: Number(q.discount_rate || 0),
        discount: Number(q.discount || 0),
        taxes: (q.taxes || []).map((t) => ({
          id: t.tax_id,
          name: t.tax_name,
          rate: Number(t.tax_rate || 0),
        })),
        description: q.description || "",
        quotation_name: q.quotation_name || "",
      });

      const tagsRes = await api.getEntityTags("sales_quotation", q.id);
      if (tagsRes.success) {
        setTagIds(tagsRes.data.map((tag) => tag.id));
      }

      const rawItems = q.items || [];
      // Only fetch full product detail (for unit lists) for lines that
      // actually reference a real, still-existing product — rawItems with
      // a null/deleted product_id simply keep whatever unit_name was
      // snapshotted, with no unit dropdown.
      const productIds = [
        ...new Set(rawItems.map((i) => i.product_id).filter(Boolean)),
      ];

      const fullProducts = await Promise.all(
        productIds.map((pid) => api.getProduct(pid).catch(() => null)),
      );
      const unitsByProduct = new Map(
        fullProducts.filter(Boolean).map((p) => [p.id, p.productUnits || []]),
      );

      setItems(
        rawItems.map((raw) =>
          toEditableItem(raw, unitsByProduct.get(raw.product_id)),
        ),
      );

      setProducts(prodsRes?.data || []);
      setCustomers(custsRes || []);
      setTaxes(taxRes || []);
      setError("");
    } catch (err) {
      setError(err.message || t("errors.loadError"));
    } finally {
      setLoading(false);
    }
  }, [id, api, t]);

  const refetch = useCallback(async () => {
    if (!api) return;

    try {
      const [prodsRes, custsRes, taxRes] = await Promise.all([
        api.getProducts({ limit: 100 }),
        api.getCustomers(),
        api.getTaxes(),
      ]);

      setProducts(prodsRes?.data || []);
      setCustomers(custsRes || []);
      setTaxes(taxRes || []);
    } catch (err) {
      setError(err.message || t("errors.loadError"));
    }
  }, [api, t]);

  useEffect(() => {
    load();
  }, [load]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      recalcItem({
        product_id: null,
        product_name: "",
        product_code: "",
        entered_quantity: 1,
        entered_price: 0,
        available_units: [],
        unit_id: null,
        unit_name: "",
        unit_conversion_factor: 1,
        discount_rate: 0,
        tax_id: null,
        tax_rate: 0,
        tax_capable: false,
        description: "",
      }),
    ]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

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

  // Free-typed name with no catalog match — product_id stays null.
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

  // Used by the quick-add modal — mirrors useAddSalesQuotation.
  const setItemProduct = (
    index,
    {
      id,
      name,
      code,
      price,
      tax_id,
      tax_rate,
      available_units,
      unit_id,
      unit_name,
    },
  ) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };

      item.product_id = id;
      item.product_name = name || "";
      item.product_code = code || "";
      item.entered_price = Number(price || 0);
      item.available_units = available_units || [];
      item.unit_id = unit_id ?? null;
      item.unit_name = unit_name || "";
      item.unit_conversion_factor = 1;
      item.tax_id = tax_id || null;
      item.tax_rate = Number(tax_rate || 0);
      item.tax_capable = Boolean(tax_id);

      copy[index] = recalcItem(item);
      return copy;
    });
  };

  const addItemWithProduct = ({
    id,
    name,
    code,
    price,
    tax_id,
    tax_rate,
    available_units,
    unit_id,
    unit_name,
  }) => {
    setItems((prev) => [
      ...prev,
      recalcItem({
        product_id: id,
        product_name: name || "",
        product_code: code || "",
        entered_quantity: 1,
        entered_price: Number(price || 0),
        tax_id: tax_id || null,
        tax_rate: Number(tax_rate || 0),
        tax_capable: Boolean(tax_id),
        available_units: available_units || [],
        unit_id: unit_id ?? null,
        unit_name: unit_name || "",
        discount_rate: 0,
        description: "",
      }),
    ]);
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

  const updateItemDescription = (index, description) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], description };
      return copy;
    });
  };

  // Barcode scanning — same as useAddSalesQuotation.
  useEffect(() => {
    let barcode = "";

    const handleKeyDown = async (e) => {
      if (e.target?.tagName === "TEXTAREA") return;

      if (e.key === "Enter") {
        if (!barcode) return;

        try {
          const product = await api.getProductByBarcode(barcode);

          if (!product) {
            setError(t("errors.productNotFound"));
            barcode = "";
            return;
          }

          setItems((prev) => {
            const existingIndex = prev.findIndex(
              (i) => Number(i.product_id) === Number(product.id),
            );

            if (existingIndex !== -1) {
              const updated = [...prev];
              const item = { ...updated[existingIndex] };
              item.entered_quantity = Number(item.entered_quantity) + 1;
              updated[existingIndex] = recalcItem(item);
              return updated;
            }

            return [
              ...prev,
              recalcItem({
                product_id: product.id,
                product_name: product.name,
                entered_quantity: 1,
                entered_price: Number(product.salePrice || 0),
                tax_id: product.tax_id || null,
                tax_rate: Number(product.tax_rate || 0),
                tax_capable: Boolean(product.tax_id),
                available_units: [],
                unit_id: null,
                unit_name: "",
                unit_conversion_factor: 1,
                discount_rate: 0,
                description: "",
              }),
            ];
          });

          barcode = "";
        } catch (err) {
          console.log(err);
        }
      } else {
        barcode += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [api, t]);

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

  const submit = async () => {
    try {
      setSaving(true);
      setError("");

      const usableItems = items.filter(
        (i) =>
          (i.product_id || i.product_name?.trim()) && i.entered_quantity > 0,
      );

      const payload = {
        ...quotation,
        id,
        taxes: (quotation.taxes || []).map((t) => t.id),
        items: usableItems.map((i) => ({
          ...i,
          name: i.product_name,
          code: i.product_code,
        })),
        discount: quotationDiscount,
        taxValue: quotationTaxValue,
        subtotal,
        net_total: netTotal,
        updated_by: user.id,
      };
      const res = await api.updateSalesQuotation(payload);

      if (!res?.success) {
        setError(res?.error || t("errors.updateFailed"));
        return { success: false, error: res?.error };
      }
      await api.setEntityTags("sales_quotation", id, tagIds);
      navigate("/sales-quotations");
      return { success: true };
    } catch (err) {
      setError(err?.message || t("errors.updateFailed"));
      return { success: false, error: err?.message };
    } finally {
      setSaving(false);
    }
  };

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
    setItemProduct,
    addItemWithProduct,
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
    api,
    setProducts,
    refetch,
    status: quotation?.status || "draft",
  };
}
