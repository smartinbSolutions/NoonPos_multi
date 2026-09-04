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
  base_cost_price: 0,
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
  supplier_id: "",
  date: new Date().toISOString().slice(0, 10),
  discount_rate: 0,
  discount: 0,
  taxes: [],
  description: "",
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// total is always entered_quantity × entered_price — deliberately unaffected
// by which unit is selected, since the conversion factor cancels out
// mathematically (base_quantity × base_price === entered_qty × entered_price).
// discount/taxValue are separate computed columns layered on top of total,
// never mutating total itself. quantity/price (base-unit values) are derived
// here purely for the historical record / stock movement — core logic that
// consumes them is untouched.
function recalcItem(item) {
  const enteredQuantity = Number(item.entered_quantity || 0);
  const enteredPrice = Number(item.entered_price || 0);
  const factor = Number(item.unit_conversion_factor || 1);

  const total = enteredQuantity * enteredPrice;
  const quantity = enteredQuantity * factor;
  const price = factor > 0 ? enteredPrice / factor : enteredPrice;

  const discountRate = Number(item.discount_rate || 0);
  const discount = round2(total * (discountRate / 100));
  const afterDiscount = total - discount;

  const taxRate = Number(item.tax_rate || 0);
  const taxValue = round2(afterDiscount * (taxRate / 100));

  return {
    ...item,
    // entered_quantity / entered_price intentionally NOT overwritten here —
    // they stay exactly as the user typed (raw string), so an in-progress
    // decimal like "5." or "0." doesn't get silently coerced back to "5"/"0"
    // on every keystroke. Only the derived fields below use the numeric form.
    quantity,
    price,
    total,
    discount_rate: discountRate,
    discount,
    tax_rate: taxRate,
    taxValue,
  };
}
export default function useAddPurchase({ isFormOpen, supplierModalOpen }) {
  const { t } = useTranslation();
  const navigat = useNavigate();
  const api = window.api;
  const { user } = useAuth();

  const [invoice, setInvoice] = useState(emptyInvoice);
  const [items, setItems] = useState([emptyItem]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [taxes, setTaxes] = useState([]);
  const [tagIds, setTagIds] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const refetch = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiNotAvailable"));
      return;
    }

    try {
      setLoading(true);
      const res = await api.getProducts({ limit: 100 });
      setProducts(res?.data || []);
      const taxResult = await api.getTaxes();
      setTaxes(taxResult || []);
      const suppliersResult = await api.getSuppliers();
      setSuppliers(suppliersResult || []);
      setError("");
    } catch (err) {
      setError(err?.message || t("errors.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refetch();
  }, [refetch, isFormOpen, supplierModalOpen]);

  const addItem = () => {
    setItems((prev) => [...prev, emptyItem]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Full product detail (with productUnits) is needed for the unit dropdown —
  // the paginated list row only carries salePrice/unitCount, not the units
  // themselves, so we fetch the full record whenever a product is selected.
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
          entered_price: fullProduct.costPrice || 0,
          base_cost_price: fullProduct.costPrice || 0,
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

  // Switches the unit a line is denominated in. Picking a non-base unit sets
  // its conversion_factor; entered_quantity/entered_price stay exactly as
  // the user typed them — only the derived base quantity/price change.
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
      const basePrice = Number(item.base_cost_price || 0);

      copy[index] = recalcItem({
        ...item,
        unit_id: selectedUnit.id,
        unit_name: selectedUnit.unit_name,
        unit_conversion_factor: factor,
        entered_price: basePrice * factor,
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

  // Directly applies a known product (id/name/price/tax) to an existing row
  // without depending on `products` state — avoids the stale-closure race
  // when a product was just created via the quick-add modal. No unit list is
  // available yet here (quick-add products only ever have a base unit), so
  // unit switching is unavailable for these rows until refetch completes and
  // the row's product is re-selected properly.
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
      item.name = name || "";
      item.code = code || "";
      item.entered_price = Number(price || 0);
      item.base_cost_price = Number(price || 0);
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
  // Appends a brand-new row pre-filled with a known product — used when
  // there's no empty row left to reuse (quick-adding a 2nd, 3rd, ... product).
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
        ...emptyItem,
        product_id: id,
        name: name || "",
        code: code || "",
        entered_quantity: 1,
        entered_price: Number(price || 0),
        base_cost_price: Number(price || 0),
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
      const item = { ...copy[index], discount_rate: Number(rate || 0) };
      copy[index] = recalcItem(item);
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

  // Updates an item's tax selection and recomputes derived fields. Returns
  // whether the tax actually changed so the caller can decide whether to
  // prompt about updating the product's default.
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

  // Barcode scanning stays exactly as-is — unrelated to payment refactor
  useEffect(() => {
    let barcodeRef = "";

    const handleKeyDown = async (e) => {
      if (e.target?.tagName === "TEXTAREA") {
        return;
      }
      if (e.key === "Enter") {
        if (!barcodeRef) return;

        try {
          const product = await api.getProductByBarcode(barcodeRef);

          if (!product) {
            setError(t("errors.productNotFound"));
            barcodeRef = "";
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

            const existingEmpty = prev.findIndex((i) => i.product_id === "");

            const built = recalcItem({
              ...emptyItem,
              product_id: product.id,
              name: product.name,
              code: product.code || "",
              entered_quantity: 1,
              base_cost_price: product.costPrice || 0,
              entered_price: product.costPrice || 0,
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

          barcodeRef = "";
        } catch (err) {
          console.log(err);
        }
      } else {
        barcodeRef += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [api]);

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

  // ---- Invoice-level discount: hidden by default, dual %/value ----

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

  // ---- Invoice-level tax: hidden by default ----
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
      if (current.some((t) => t.id === selectedTax.id)) return prev; // already added

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
  // Manually enables the tax control for a line whose product has no default
  // tax. tax_id stays null until the user picks one from the select.
  const enableItemTax = (index) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], tax_capable: true };
      return copy;
    });
  };

  // Removes tax from a line entirely — hides the control again and clears
  // whatever was selected, recomputing totals accordingly.
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

  const netTotal = useMemo(() => {
    return Math.max(0, afterInvoiceDiscount + itemTaxTotal + invoiceTaxValue);
  }, [afterInvoiceDiscount, itemTaxTotal, invoiceTaxValue]);

  // submit now optionally takes paymentData collected by InvoicePaymentModal
  // in collector mode. If present, invoice is created as paid and the
  // backend's centralized payment service handles the fund transaction.
  // If absent, invoice is created unpaid — no payment side effects at all.
  const submit = useCallback(
    async (paymentData = null) => {
      if (!api) {
        setError(t("errors.apiNotAvailable"));
        return;
      }

      if (!invoice.supplier_id) {
        setError(t("errors.supplierRequired"));
        return;
      }

      if (items.length === 0) {
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
          status: paymentData ? "paid" : "unpaid",
          payment: paymentData,
          created_by: user.id,
        };
        const res = await api.createPurchaseInvoice(payload);

        if (!res?.success) {
          console.error(res);
          throw new Error(t("errors.createInvoiceFailed"));
        }

        if (res.invoiceId && tagIds.length > 0) {
          await api.setEntityTags("purchase_invoice", res.invoiceId, tagIds);
        }

        setInvoice(emptyInvoice);
        setItems([emptyItem]);
        setTagIds([]);

        navigat("/purchase");
        return res;
      } catch (err) {
        setError(err.message || t("errors.createInvoiceFailed"));
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
    suppliers,
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
    api,
    setProducts,
    refetch,
  };
}
