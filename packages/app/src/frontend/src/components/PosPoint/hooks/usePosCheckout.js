import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../Global/AuthContext";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Mirrors recalcItem() in useAddSales — same cascade, same order of
// operations, so POS and manual sales produce identical math for the
// same inputs. price/qty are always the BASE (pre-tax) values; tax is
// LOCKED to whatever the product's tax_id already is (no dropdown here,
// unlike manual sales — enforced by never exposing a tax_id setter).
function recalcCartItem(item) {
  const qty = toNumber(item.qty);
  const price = toNumber(item.price);
  const discountRate = toNumber(item.discount_rate);
  const taxRate = toNumber(item.tax_rate);

  const total = qty * price;
  const discount = total * (discountRate / 100);
  const afterDiscount = total - discount;
  const taxValue = afterDiscount * (taxRate / 100);
  const lineTotal = afterDiscount + taxValue;

  return {
    ...item,
    qty,
    price,
    discount_rate: discountRate,
    tax_rate: taxRate,
    total,
    discount,
    afterDiscount,
    taxValue,
    lineTotal,
  };
}

export default function usePosCheckout({ weight } = {}) {
  const { t, i18n } = useTranslation();
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [funds, setFunds] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [cart, setCart] = useState([]);

  // ---- Invoice-level state — same shape as useAddSales ----
  // ---- Invoice-level state — same shape as useAddSales ----
  const [invoiceDiscountRate, setInvoiceDiscountRate] = useState(0);
  const [invoiceTaxes, setInvoiceTaxes] = useState([]); // [{ id, name, rate }]
  const [invoiceNote, setInvoiceNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");
  const [currencies, setCurrencies] = useState();
  const [search, setSearch] = useState("");
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [posTaxMode, setPosTaxMode] = useState("manual"); // 'manual' | 'fixed'

  const [allTags, setAllTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);

  const weightRef = useRef(weight);
  const now = new Date();
  const { user } = useAuth();

  const date =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0") +
    " " +
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0") +
    ":" +
    String(now.getSeconds()).padStart(2, "0");
  const api = window.api;

  useEffect(() => {
    weightRef.current = weight;
  }, [weight]);

  const loadInitialData = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiUnavailable"));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        customersResult,
        fundsResult,
        currencyResult,
        settingsResult,
        taxesResult,
        tagsResult,
      ] = await Promise.allSettled([
        api.getCustomers(),
        api.getFunds(),
        api.getCurrencies(),
        api.getCompanySetting(),
        api.getTaxes(),
        api.listTags("product"),
      ]);

      if (customersResult.status === "rejected") {
        console.error("Failed to load customers:", customersResult.reason);
      }

      if (fundsResult.status === "rejected") {
        console.error("Failed to load funds:", fundsResult.reason);
      }

      setCustomers(
        customersResult.status === "fulfilled"
          ? customersResult.value.data || []
          : [],
      );
      setFunds(
        fundsResult.status === "fulfilled" ? fundsResult.value || [] : [],
      );

      setCurrencies(currencyResult.value?.[0] || []);

      setAllTags(
        tagsResult.status === "fulfilled" && tagsResult.value?.success
          ? tagsResult.value.data
          : [],
      );

      const companySettings =
        settingsResult.status === "fulfilled"
          ? settingsResult.value?.settings
          : null;

      setAllowNegativeStock(Boolean(companySettings?.allow_negative_stock));

      const mode =
        companySettings?.pos_invoice_tax_mode === "fixed" ? "fixed" : "manual";
      setPosTaxMode(mode);

      if (mode === "fixed") {
        const defaults = (companySettings?.default_pos_taxes || []).map(
          (t) => ({
            id: t.tax_id,
            name: t.name,
            rate: t.rate,
          }),
        );
        setInvoiceTaxes(defaults);
      }

      setTaxes(
        taxesResult.status === "fulfilled" ? taxesResult.value || [] : [],
      );

      setError(
        [customersResult, fundsResult].some(
          (result) => result.status === "rejected",
        )
          ? t("errors.partialLoad", { field: t("ui.products") })
          : "",
      );
    } catch (err) {
      console.error("Failed to load POS data:", err);
      setError(err?.message || t("errors.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  const loadProducts = useCallback(async () => {
    if (!api) return;

    try {
      setProductsLoading(true);
      const res = await api.getPosProducts({
        page: 1,
        limit: 50,
        search,
        tagIds: selectedTagIds,
      });
      setProducts(res?.data || []);
    } catch (err) {
      console.error("Failed to load products:", err);
      setError(err?.message || t("errors.loadError"));
    } finally {
      setProductsLoading(false);
    }
  }, [api, search, selectedTagIds, t]);

  const searchTimeout = useRef(null);

  useEffect(() => {
    clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(() => {
      loadProducts();
    }, 300);

    return () => clearTimeout(searchTimeout.current);
  }, [search, selectedTagIds]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const refetch = useCallback(() => {
    loadInitialData();
    loadProducts();
  }, [loadInitialData, loadProducts]);

  const toggleTagFilter = (tagId) => {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId],
    );
  };

  // ---- Cart mutations ----

  const addToCart = (product, quantity = 1, replaceQuantity = false) => {
    const qty = Math.max(0, toNumber(quantity));

    if (!qty) return;

    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);

      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? recalcCartItem({
                ...item,
                qty: replaceQuantity ? qty : toNumber(item.qty) + qty,
              })
            : item,
        );
      }

      return [
        ...current,
        recalcCartItem({
          ...product,
          qty,
          product_id: product.product_id || product.id,
          unit_id: product.unit_id ?? null,
          conversion_factor: toNumber(product.conversion_factor) || 1,
          tax_id: product.tax_id ?? null,
          tax_rate: toNumber(product.tax_rate) || 0,
          catalog_price: toNumber(product.price) || 0,
          discount_rate: 0,
          description: "",
        }),
      ];
    });
  };

  const updateQuantity = (productId, nextQuantity) => {
    const quantity = Math.max(-1, toNumber(nextQuantity));

    setCart((current) =>
      quantity === -1
        ? current.filter((item) => item.id !== productId)
        : current.map((item) =>
            item.id === productId
              ? recalcCartItem({ ...item, qty: quantity })
              : item,
          ),
    );
  };

  // Price entered/shown everywhere in the UI is TAX-INCLUSIVE (what the
  // customer actually pays). Storage stays BASE (pre-tax), so it has to
  // be converted on the way in — otherwise tax would compound on top of
  // an already-tax-inclusive number at checkout.
  const updatePrice = (productId, nextInclusivePrice) => {
    const inclusivePrice = Math.max(0, toNumber(nextInclusivePrice));

    setCart((current) =>
      current.map((item) => {
        if (item.id !== productId) return item;

        const taxRate = toNumber(item.tax_rate);
        const basePrice =
          taxRate > 0 ? inclusivePrice / (1 + taxRate / 100) : inclusivePrice;

        return recalcCartItem({ ...item, price: basePrice });
      }),
    );
  };

  const updateItemDiscountRate = (productId, rate) => {
    const raw = Math.max(0, toNumber(rate));
    const discountRate = raw < 0.005 ? 0 : raw;

    setCart((current) =>
      current.map((item) =>
        item.id === productId
          ? recalcCartItem({ ...item, discount_rate: discountRate })
          : item,
      ),
    );
  };

  const updateItemNote = (productId, description) => {
    setCart((current) =>
      current.map((item) =>
        item.id === productId ? { ...item, description } : item,
      ),
    );
  };

  const removeFromCart = (productId) => {
    setCart((current) => current.filter((item) => item.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setInvoiceDiscountRate(0);
    setInvoiceNote("");
    setSelectedCustomerId("");

    if (posTaxMode !== "fixed") {
      setInvoiceTaxes([]);
    }
  };
  // ---- Cascade — item level, aggregated ----

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + toNumber(item.total), 0),
    [cart],
  );

  const itemDiscountTotal = useMemo(
    () => cart.reduce((sum, item) => sum + toNumber(item.discount), 0),
    [cart],
  );

  const afterItemDiscounts = useMemo(
    () => subtotal - itemDiscountTotal,
    [subtotal, itemDiscountTotal],
  );

  const itemTaxTotal = useMemo(
    () => cart.reduce((sum, item) => sum + toNumber(item.taxValue), 0),
    [cart],
  );

  // ---- Cascade — invoice level, layered on top ----

  const invoiceDiscount = useMemo(
    () => afterItemDiscounts * (toNumber(invoiceDiscountRate) / 100),
    [afterItemDiscounts, invoiceDiscountRate],
  );

  const afterInvoiceDiscount = useMemo(
    () => afterItemDiscounts - invoiceDiscount,
    [afterItemDiscounts, invoiceDiscount],
  );

  // ---- Invoice-level taxes: PARALLEL — each computed independently off
  // afterInvoiceDiscount, then summed. Mirrors the backend's model exactly. ----

  const invoiceTaxValue = useMemo(() => {
    return (invoiceTaxes || []).reduce((sum, tax) => {
      const rate = toNumber(tax.rate);
      return sum + afterInvoiceDiscount * (rate / 100);
    }, 0);
  }, [afterInvoiceDiscount, invoiceTaxes]);

  const addInvoiceTax = (selectedTax) => {
    if (posTaxMode === "fixed") return;
    if (!selectedTax?.id) return;

    setInvoiceTaxes((current) => {
      if (current.some((t) => t.id === selectedTax.id)) return current;
      return [
        ...current,
        {
          id: selectedTax.id,
          name: selectedTax.name,
          rate: toNumber(selectedTax.rate),
        },
      ];
    });
  };

  const removeInvoiceTax = (taxId) => {
    if (posTaxMode === "fixed") return;
    setInvoiceTaxes((current) => current.filter((t) => t.id !== taxId));
  };

  const clearInvoiceTaxes = () => {
    if (posTaxMode === "fixed") return;
    setInvoiceTaxes([]);
  };

  const netTotal = useMemo(() => {
    return Math.max(0, afterInvoiceDiscount + itemTaxTotal + invoiceTaxValue);
  }, [afterInvoiceDiscount, itemTaxTotal, invoiceTaxValue]);

  const itemTaxSummary = useMemo(() => {
    const groups = new Map();

    for (const item of cart) {
      if (!item.tax_id || !item.tax_rate) continue;

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
      group.base += toNumber(item.afterDiscount);
      group.value += toNumber(item.taxValue);
    }

    return Array.from(groups.values());
  }, [cart]);

  const itemDiscountSummary = useMemo(() => {
    const groups = new Map();

    for (const item of cart) {
      const rate = toNumber(item.discount_rate);
      if (rate < 0.005) continue;

      const key = rate.toFixed(2);
      if (!groups.has(key)) {
        groups.set(key, { rate, base: 0, amount: 0 });
      }

      const group = groups.get(key);
      group.base += toNumber(item.total);
      group.amount += toNumber(item.discount);
    }

    return Array.from(groups.values());
  }, [cart]);

  // The true starting point for invoice-level adjustments — items'
  // own discount and tax already resolved. This is what the cart
  // footer shows as the total BEFORE any invoice discount/tax applies.
  const itemsNetTotal = useMemo(
    () => afterItemDiscounts + itemTaxTotal,
    [afterItemDiscounts, itemTaxTotal],
  );
  const checkout = async ({ payments, received }) => {
    setCheckingOut(true);

    try {
      const normalizedPayments = (payments || [])
        .map((payment) => ({
          fundId: Number(payment.fundId),
          amount: toNumber(payment.amount),
          amount_fund_currency: toNumber(payment.amount_fund_currency),
          currency_code: payment.currency_code,
          exchange_rate: toNumber(payment.exchange_rate || 1) || 1,
        }))
        .filter(
          (payment) =>
            payment.fundId &&
            payment.amount > 0 &&
            payment.amount_fund_currency > 0,
        );

      const checkoutItems = cart.map((i) => ({
        product_id: i.product_id,
        name: i.name,
        unit_name: i.unit_name,
        unit_conversion_factor: toNumber(i.conversion_factor) || 1,
        entered_quantity: i.qty,
        entered_price: i.price,
        discount_rate: i.discount_rate,
        tax_id: i.tax_id,
        description: i.description,
      }));

      // Invoice-level taxes with their actual computed value — same math
      // as invoiceTaxValue above, just per-tax instead of summed.
      const invoiceTaxesWithValue = invoiceTaxes.map((tax) => ({
        id: tax.id,
        name: tax.name,
        rate: toNumber(tax.rate),
        value: afterInvoiceDiscount * (toNumber(tax.rate) / 100),
      }));

      const payload = {
        items: cart.map((i) => ({
          name: i.name,
          quantity: i.qty,
          unit_name: i.unit_name,
          price: i.price,
          discount_rate: i.discount_rate,
          discount: i.discount,
          tax_rate: i.tax_rate,
          taxValue: i.taxValue,
          total: i.total,
        })),
        subtotal,
        itemDiscountTotal,
        itemTaxTotal,
        taxes: invoiceTaxesWithValue,
        discount_rate: invoiceDiscountRate,
        invoiceDiscount,
        total: netTotal,
        received,
        customer_id: selectedCustomerId,
        language: i18n.language,
        date,
      };

      const sales = await api.posCheckout({
        items: checkoutItems,
        subtotal,
        discount_rate: toNumber(invoiceDiscountRate || 0),
        taxes: invoiceTaxes.map((t) => t.id),
        description: invoiceNote?.trim() || null,
        net_total: netTotal,
        paid_amount: netTotal,
        customer_id: selectedCustomerId,
        payments: normalizedPayments,
        date,
        created_by: user.id,
      });

      payload.id = sales.invoiceId;
      payload.invoice_name = sales.invoiceName;

      const res = await api.printReceipt(payload);
      setCart([]);
      setSelectedCustomerId("");
      setInvoiceDiscountRate(0);
      setInvoiceTaxes([]);
      setInvoiceNote("");
      refetch();
    } catch (err) {
      console.error(err);
      setError(err?.message || t("errors.saveError"));
    } finally {
      setCheckingOut(false);
    }
  };

  useEffect(() => {
    let barcode = "";

    const handleKeyDown = async (e) => {
      if (e.key === "Enter") {
        if (!barcode) return;

        try {
          const product = await api.getProductByBarcode(barcode);

          if (!product) {
            setError(t("errors.productNotFound"));
            barcode = "";
            return;
          }

          const scannedQuantity = Math.max(0, toNumber(weightRef.current)) || 1;

          // Reuse the exact same cart-add path as clicking a tile — the
          // barcode result now has the identical shape as a get-pos-products
          // tile (id, product_id, unit_id, is_base, unit_name, etc.), so
          // there's no reason to hand-build the cart item separately here;
          // doing so is what silently hardcoded is_base:true and drifted
          // out of sync with the backend's actual field names.
          addToCart(product, scannedQuantity, false);

          setError("");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  return {
    products,
    customers,
    funds,
    taxes,
    cart,
    search,
    setSearch,
    selectedCustomerId,
    setSelectedCustomerId,
    loading,
    productsLoading,
    checkingOut,
    error,
    subtotal,
    itemDiscountTotal,
    afterItemDiscounts,
    itemTaxTotal,
    invoiceDiscountRate,
    setInvoiceDiscountRate,
    invoiceDiscount,
    afterInvoiceDiscount,
    invoiceTaxes,
    addInvoiceTax,
    removeInvoiceTax,
    clearInvoiceTaxes,
    posTaxMode,
    invoiceTaxValue,
    invoiceNote,
    setInvoiceNote,
    netTotal,
    refetch,
    addToCart,
    updateQuantity,
    updatePrice,
    updateItemDiscountRate,
    updateItemNote,
    removeFromCart,
    clearCart,
    checkout,
    currencies,
    allowNegativeStock,
    itemTaxSummary,
    itemDiscountSummary,
    itemsNetTotal,

    allTags,
    selectedTagIds,
    toggleTagFilter,
  };
}
