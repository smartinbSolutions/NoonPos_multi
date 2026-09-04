import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../../Global/AuthContext";

const emptyItem = {
  product_id: "",
  name: "",
  code: "",
  entered_quantity: 1,
  entered_price: 0,
  buyingPrice: 0,
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

const emptyInvoice = {
  customer_id: "",
  invoice_name: "",
  date: new Date().toISOString().slice(0, 10),
  discount_rate: 0,
  discount: 0,
  taxes: [], // array of { id, name, rate }
  description: "",
};
// Same shape as purchase: total = entered_quantity × entered_price
// (unaffected by unit choice); quantity/price are the derived BASE-UNIT
// values used for stock/record; discount/taxValue layer on top of total.
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

export default function useAddSales({ customerModalOpen, isFormOpen }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const api = window.api;
  const { user } = useAuth();

  const [invoice, setInvoiceState] = useState(emptyInvoice);
  const [items, setItems] = useState([emptyItem]);
  const [products, setProducts] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tagIds, setTagIds] = useState([]);

  const setInvoice = (updater) => {
    setInvoiceState((prev) =>
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
  }, [refetch, customerModalOpen, isFormOpen]);

  const addItem = () => {
    setItems((prev) => [...prev, emptyItem]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Full product detail (with productUnits) is needed for the unit
  // dropdown — each unit carries its OWN sale_price (unlike purchase,
  // where alt units are derived by multiplying the base cost).
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
          name: fullProduct.name,
          code: fullProduct.code || "",
          available_units: productUnits,
          unit_id: baseUnit?.id ?? null,
          unit_name: baseUnit?.unit_name || "",
          unit_conversion_factor: 1,
          entered_quantity: current.entered_quantity || 1,
          entered_price: Number(baseUnit?.sale_price || 0),
          buyingPrice: Number(fullProduct.costPrice || 0),
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

  // Switches the unit a line is denominated in. Each unit already has its
  // own registered sale_price — no calculation needed, just look it up.
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

    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], [key]: value };
      copy[index] = recalcItem(item);
      return copy;
    });
  };

  // Directly applies a known product to a row without depending on
  // `products` state — used by the quick-add modal. available_units/unit_id/
  // unit_name are optional: pass them when the caller already fetched the
  // full product (e.g. right after quick-add creation); omit them and the
  // row falls back to no units, same as before.
  const setItemProduct = (
    index,
    {
      id,
      name,
      code,
      price,
      buyingPrice,
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
      item.name = name || "";
      item.code = code || "";
      item.entered_price = Number(price || 0);
      item.buyingPrice = Number(buyingPrice || 0);
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
    buyingPrice,
    tax_id,
    tax_rate,
    available_units,
    unit_id,
    unit_name,
  }) => {
    setItems((prev) => [
      ...prev,
      recalcItem({
        ...emptyItem,
        product_id: id,
        name: name || "",
        code: code || "",
        entered_quantity: 1,
        entered_price: Number(price || 0),
        buyingPrice: Number(buyingPrice || 0),
        tax_id: tax_id || null,
        tax_rate: Number(tax_rate || 0),
        tax_capable: Boolean(tax_id),
        available_units: available_units || [],
        unit_id: unit_id ?? null,
        unit_name: unit_name || "",
      }),
    ]);
  };

  // ---- Item discount: hidden by default, revealed via "+", dual %/value ----

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
    const normalizedNewId = taxId || null;
    let changed = false;

    setItems((prev) => {
      const current = prev[index];
      const normalizedCurrentId = current.tax_id || null;

      if (normalizedNewId === normalizedCurrentId) {
        return prev;
      }

      changed = true;

      const copy = [...prev];
      copy[index] = recalcItem({
        ...current,
        tax_id: normalizedNewId,
        tax_rate: Number(taxRate || 0),
      });
      return copy;
    });

    return changed;
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

  // Barcode scanning — unchanged behavior, adapted to new item shape
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

            const existingEmpty = prev.findIndex((i) => !i.product_id);

            const built = recalcItem({
              ...emptyItem,
              product_id: product.id,
              name: product.name,
              code: product.code || "",
              entered_quantity: 1,
              entered_price: Number(product.salePrice || 0),
              buyingPrice: Number(product.costPrice || 0),
              tax_id: product.tax_id || null,
              tax_rate: Number(product.tax_rate || 0),
              tax_capable: Boolean(product.tax_id),
            });

            if (existingEmpty !== -1) {
              const updated = [...prev];
              updated[existingEmpty] = built;
              return updated;
            }

            return [...prev, built];
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

  // ---- Invoice-level cascade — identical to purchase ----

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

  // ---- Invoice-level taxes: PARALLEL — each computed independently off
  // afterInvoiceDiscount, then summed. Mirrors the backend's model exactly. ----

  const invoiceTaxValue = useMemo(() => {
    const taxes = invoice.taxes || [];
    return taxes.reduce((sum, tax) => {
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

      if (!invoice.customer_id) {
        setError(t("errors.customer_required"));
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
          taxes: (invoice.taxes || []).map((t) => t.id),
          discount: invoiceDiscount,
          taxValue: invoiceTaxValue,
          subtotal,
          net_total: netTotal,
          items,
          payment: paymentData,
          created_by: user.id,
        };
        const res = await api.createSalesInvoice(payload);

        if (!res?.success) {
          throw new Error(res?.error || t("errors.createInvoiceFailed"));
        }

        if (res.invoiceId && tagIds.length > 0) {
          await api.setEntityTags("sales_invoice", res.invoiceId, tagIds);
        }

        setInvoice(emptyInvoice);
        setItems([emptyItem]);
        setTagIds([]);

        navigate("/sales");
        return res;
      } catch (err) {
        setError(err?.message || t("errors.saveError"));
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
    products,
    customers,
    taxes,
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
    reset,
    subtotal,
    itemDiscountTotal,
    itemDiscountSummary,
    afterItemDiscounts,
    itemTaxTotal,
    itemTaxSummary,
    invoiceDiscount,
    afterInvoiceDiscount,
    invoiceTaxValue,
    netTotal,
    loading,
    saving,
    error,
    navigate,
    api,
    setProducts,
    refetch,
    tagIds,
    setTagIds,
  };
}
