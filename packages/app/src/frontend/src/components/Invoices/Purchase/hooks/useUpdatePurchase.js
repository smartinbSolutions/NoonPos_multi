import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../../Global/AuthContext";

const emptyInvoice = {
  supplier_id: "",
  date: new Date().toISOString().slice(0, 10),
  discount_rate: 0,
  discount: 0,
  taxes: [], // array of { id, name, rate }
  description: "",
};
// Same shape/derivation rules as useAddPurchase.js — total is always
// entered_quantity × entered_price, quantity/price are the derived BASE-UNIT
// values (used for stock/record), discount/taxValue are computed layers on
// top of total, never mutating total itself.
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

// Reconstructs entered_quantity/entered_price from the stored base-unit
// quantity/price + factor — the inverse of what recalcItem derives forward.
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
    name: raw.name || raw.product_name || "",
    code: raw.product_code || "",
    entered_quantity: enteredQuantity,
    entered_price: enteredPrice,
    base_cost_price: basePrice, // best-known base price for this product at load time
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
    returned_quantity: raw.returned_quantity,
    available_quantity: raw.available_quantity,
  });
}
export default function useUpdatePurchase() {
  const { t } = useTranslation();
  const { id } = useParams();
  const api = window.api;
  const navigat = useNavigate();
  const { user } = useAuth();

  const [invoice, setInvoiceState] = useState(emptyInvoice);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [tagIds, setTagIds] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setInvoice = (updater) => {
    setInvoiceState((prev) =>
      typeof updater === "function" ? updater(prev) : { ...prev, ...updater },
    );
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const [inv, prodsRes, supsRes, taxRes] = await Promise.all([
        api.getPurchaseInvoiceById(id),
        api.getProducts({ limit: 100 }),
        api.getSuppliers(),
        api.getTaxes(),
      ]);

      if (!inv) {
        setError(t("screens.invoices.notFound"));
        return;
      }

      setInvoiceState({
        id: inv.id,
        supplier_id: inv.supplier_id,
        date: inv.date?.slice(0, 10) || emptyInvoice.date,
        discount_rate: Number(inv.discount_rate || 0),
        discount: Number(inv.discount || 0),
        taxes: (inv.taxes || []).map((t) => ({
          id: t.tax_id,
          name: t.tax_name,
          rate: Number(t.tax_rate || 0),
        })),
        description: inv.description || "",
        invoice_name: inv.invoice_name || "",
        status: inv.status || "unpaid",
        paid_amount: inv.paid_amount,
        remaining_amount: inv.remaining_amount,
      });

      const tagsRes = await api.getEntityTags("purchase_invoice", inv.id);
      if (tagsRes.success) {
        setTagIds(tagsRes.data.map((tag) => tag.id));
      }

      const rawItems = inv.items || [];
      const productIds = [...new Set(rawItems.map((i) => i.product_id))];

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
      setSuppliers(supsRes || []);
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
      const [prodsRes, supsRes, taxRes] = await Promise.all([
        api.getProducts({ limit: 100 }),
        api.getSuppliers(),
        api.getTaxes(),
      ]);

      setProducts(prodsRes?.data || []);
      setSuppliers(supsRes || []);
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
        product_id: "",
        name: "",
        code: "",
        entered_quantity: 1,
        entered_price: 0,
        base_cost_price: 0,
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

  const updateItemDescription = (index, description) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], description };
      return copy;
    });
  };

  const setItemProduct = (
    index,
    { id, name, code, price, tax_id, tax_rate },
  ) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };

      item.product_id = id;
      item.name = name || "";
      item.code = code || "";
      item.entered_price = Number(price || 0);
      item.base_cost_price = Number(price || 0);
      item.available_units = [];
      item.unit_id = null;
      item.unit_name = "";
      item.unit_conversion_factor = 1;
      item.tax_id = tax_id || null;
      item.tax_rate = Number(tax_rate || 0);
      item.tax_capable = Boolean(tax_id);

      copy[index] = recalcItem(item);

      return copy;
    });
  };

  const addItemWithProduct = ({ id, name, code, price, tax_id, tax_rate }) => {
    setItems((prev) => [
      ...prev,
      recalcItem({
        product_id: id,
        name: name || "",
        code: code || "",
        entered_quantity: 1,
        entered_price: Number(price || 0),
        base_cost_price: Number(price || 0),
        available_units: [],
        unit_id: null,
        unit_name: "",
        unit_conversion_factor: 1,
        discount_rate: 0,
        tax_id: tax_id || null,
        tax_rate: Number(tax_rate || 0),
        tax_capable: Boolean(tax_id),
        description: "",
      }),
    ]);
  };

  // Barcode scanning — unchanged behavior, adapted to the new item shape.
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

            const existingEmpty = prev.findIndex((i) => !i.product_id);

            const built = recalcItem({
              product_id: product.id,
              name: product.name,
              code: product.code || "",
              entered_quantity: 1,
              entered_price: product.costPrice || 0,
              base_cost_price: product.costPrice || 0,
              available_units: [],
              unit_id: null,
              unit_name: "",
              unit_conversion_factor: 1,
              tax_id: product.tax_id || null,
              tax_rate: Number(product.tax_rate || 0),
              tax_capable: Boolean(product.tax_id),
              description: "",
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
  }, [api, t]);

  // ---- Same cascade as useAddPurchase.js ----

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

  const submit = async () => {
    try {
      setSaving(true);
      setError("");

      const payload = {
        ...invoice,
        taxes: (invoice.taxes || []).map((t) => t.id),
        items,
        discount: invoiceDiscount,
        taxValue: invoiceTaxValue,
        subtotal,
        net_total: netTotal,
        updated_by: user.id,
      };

      const res = await api.updatePurchaseInvoice(payload);

      if (res?.success === false) {
        setError(res.error || t("errors.saveFailed"));
        return { success: false, error: res.error };
      }

      await api.setEntityTags("purchase_invoice", id, tagIds);

      navigat("/purchase");
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
    refetch,
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
    status: invoice?.status || "unpaid",
  };
}
