import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const normalizeBarcodes = (barcodes = []) => {
  const seen = new Set();

  return barcodes
    .map((barcode) => ({
      ...barcode,
      barcode: String(barcode.barcode || "").trim(),
    }))
    .filter((barcode) => {
      if (!barcode.barcode || seen.has(barcode.barcode)) return false;
      seen.add(barcode.barcode);
      return true;
    });
};

const normalizeProductUnits = (productUnits = []) =>
  productUnits
    .filter(
      (unit) =>
        String(unit.unit_name || "").trim() &&
        Number(unit.conversion_factor) > 1
    )
    .map((unit) => ({
      ...(unit.id ? { id: unit.id } : {}),
      unit_name: String(unit.unit_name).trim(),
      conversion_factor: Number(unit.conversion_factor),
      sale_price: Number(unit.sale_price || 0),
      barcode: String(unit.barcode || "").trim(),
    }));

const now = new Date();

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

const productPayload = (product) => ({
  id: product.id,
  name: String(product.name || "").trim(),
  latinName: String(product.latinName || "").trim(),
  code: String(product.code || "").trim(),
  description: String(product.description || "").trim(),
  costPrice: Number(product.costPrice || 0),
  salePrice: Number(product.salePrice || 0),
  quantity: Number(product.quantity || 0),
  unit_id: product.unit_id ? Number(product.unit_id) : null,
  tax_id: product.tax_id ? Number(product.tax_id) : null,
  logo: product.logo || "",
  type: product.type || "normal",
  oldQuantity: product.oldQuantity || 0,
  productUnits: normalizeProductUnits(product.productUnits),
  date,
});
export default function useProductCatalog() {
  const { t } = useTranslation();
  const [products, setProducts] = useState([]);
  const [barcodes, setBarcodes] = useState([]);
  const [units, setUnits] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [unavailableHandlers, setUnavailableHandlers] = useState([]);
  const [search, setSearch] = useState("");
  const [activeProduct, setActiveProduct] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [openDeleteModel, setOpenDeleteModel] = useState(false);
  const [selectDeleteProduct, setSelectDeleteProduct] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCost, setTotalCost] = useState(1);
  const api = window.api;

  const canUseUnits = !unavailableHandlers.includes("units");
  const canManageBarcodes = !unavailableHandlers.includes("product barcodes");
  const canUseTaxes = !unavailableHandlers.includes("taxes");

  // Maps known backend error codes (from create/update-product) to a
  // translated, user-facing message. Anything not in this map falls back
  // to treating err.message as an already-human-readable string (or, if
  // that's empty, the generic save-error text).
  const mapProductErrorCode = useCallback(
    (code) => {
      switch (code) {
        case "MISSING_REQUIRED_FIELDS":
          return t(
            "errors.missingRequiredFields",
            "Please fill in all required fields."
          );
        case "DUPLICATE_UNIT_NAME":
          return t(
            "errors.duplicateUnitName",
            "Two selling units can't have the same name (or match the base unit)."
          );
        default:
          return null;
      }
    },
    [t]
  );

  const refetch = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiUnavailable"));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await api.getDashboardStats();

      setTotalCost(res?.inventoryValue);
      const [productsResult, barcodesResult, unitsResult, taxesResult] =
        await Promise.allSettled([
          api.getProducts({
            page,
            limit,
            search,
          }),
          api.getProductBarcodes(),
          api.getUnits(),
          api.getTaxes({ category: "product" }),
        ]);

      if (productsResult.status === "rejected") {
        throw productsResult.reason;
      }

      const nextUnavailableHandlers = [];

      if (barcodesResult.status === "rejected") {
        console.error(
          "Failed to load product barcodes:",
          barcodesResult.reason
        );
        nextUnavailableHandlers.push("product barcodes");
      }

      if (unitsResult.status === "rejected") {
        console.error("Failed to load units:", unitsResult.reason);
        nextUnavailableHandlers.push("units");
      }

      if (taxesResult.status === "rejected") {
        console.error("Failed to load taxes:", taxesResult.reason);
        nextUnavailableHandlers.push("taxes");
      }

      const productsResponse = productsResult.value || {};

      setProducts(productsResponse.data || []);

      setTotal(productsResponse.total || 0);
      setTotalPages(productsResponse.totalPages || 1);
      setBarcodes(
        barcodesResult.status === "fulfilled" ? barcodesResult.value || [] : []
      );
      setUnits(
        unitsResult.status === "fulfilled" ? unitsResult.value || [] : []
      );
      setTaxes(
        taxesResult.status === "fulfilled" ? taxesResult.value || [] : []
      );
      setUnavailableHandlers(nextUnavailableHandlers);

      setError(
        nextUnavailableHandlers.length
          ? t("errors.partialLoad", { field: t("ui.products") })
          : ""
      );
    } catch (err) {
      console.error("Failed to load product catalog:", err);
      setUnavailableHandlers([]);
      setError(err?.message || t("errors.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api, page, limit, search, t]);

  useEffect(() => {
    refetch();
  }, [page, limit, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const barcodesByProduct = useMemo(() => {
    return barcodes.reduce((groups, barcode) => {
      const productId = barcode.product_id;
      if (!groups[productId]) groups[productId] = [];
      groups[productId].push(barcode);
      return groups;
    }, {});
  }, [barcodes]);

  const createProduct = async (form) => {
    setSaving(true);

    try {
      const result = await api.createProduct(productPayload(form));
      if (!result?.success) {
        throw new Error(
          mapProductErrorCode(result?.error) ||
            result?.error ||
            t("errors.saveError")
        );
      }

      const productId = result?.id;

      for (const barcode of normalizeBarcodes(form.barcodes)) {
        await api.createProductBarcode({
          barcode: barcode.barcode,
          product_id: productId,
        });
      }

      await refetch();
      return result;
    } finally {
      setSaving(false);
    }
  };

  const updateProduct = async (form) => {
    setSaving(true);

    try {
      const result = await api.updateProduct(productPayload(form));
      if (!result?.success) {
        throw new Error(
          mapProductErrorCode(result?.error) ||
            result?.error ||
            result?.message ||
            t("errors.saveError")
        );
      }

      const nextBarcodes = normalizeBarcodes(form.barcodes);
      const existingBarcodes = barcodesByProduct[form.id] || [];
      const nextBarcodeIds = new Set(
        nextBarcodes.filter((b) => b.id).map((b) => b.id)
      );

      for (const barcode of existingBarcodes) {
        if (!nextBarcodeIds.has(barcode.id)) {
          await api.deleteProductBarcode(barcode.id);
        }
      }

      for (const barcode of nextBarcodes) {
        if (barcode.id) {
          await api.updateProductBarcode({
            id: barcode.id,
            barcode: barcode.barcode,
            product_id: form.id,
          });
        } else {
          await api.createProductBarcode({
            barcode: barcode.barcode,
            product_id: form.id,
          });
        }
      }

      await refetch();
      return result;
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setActiveProduct(null);
    setIsFormOpen(true);
    setActionError("");
  };

  const openEdit = async (product) => {
    setActionError("");
    setIsFormOpen(true);

    const fullProduct = await api.getProduct(product.id);
    setActiveProduct(fullProduct || product);
  };

  const submitProduct = async (form) => {
    try {
      let result;
      if (activeProduct) {
        result = await updateProduct(form);
      } else {
        result = await createProduct(form);
      }

      setIsFormOpen(false);
      setActiveProduct(null);
      setActionError("");
      await refetch();
      return result;
    } catch (err) {
      console.error("Failed to save product:", err);
      setActionError(err?.message || t("errors.saveError"));
      throw err;
    }
  };

  const deleteProduct = async (product) => {
    setSaving(true);

    try {
      const res = await api.deleteProduct(product.id);

      if (!res?.success) {
        throw new Error(res?.error || "errors.deleteHasData");
      }

      await refetch();
      setActionError("");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (product) => {
    try {
      await deleteProduct(product);
      setOpenDeleteModel(false);
      setSelectDeleteProduct(null);
      setActionError("");
    } catch (err) {
      console.error("Failed to delete product:", err);
      setActionError(
        err?.message === "Product is used in invoices"
          ? t("screens.errors.productInUse")
          : t("errors.deleteHasData", { field: t("ui.product") })
      );
    }
  };

  const handleLogo = async (file) => {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
    });

    return window.api.saveLogo({
      base64,
      name: `${Date.now()}-${file.name}`,
    });
  };

  return {
    products,
    barcodes,
    barcodesByProduct,
    units,
    taxes,
    loading,
    saving,
    error,
    unavailableHandlers,
    canManageBarcodes,
    canUseUnits,
    canUseTaxes,
    search,
    setSearch,
    refetch,
    openCreate,
    openEdit,
    isFormOpen,
    setIsFormOpen,
    activeProduct,
    submitProduct,
    actionError,
    openDeleteModel,
    setOpenDeleteModel,
    selectDeleteProduct,
    setSelectDeleteProduct,
    handleDeleteProduct,
    handleLogo,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    totalCost,
  };
}
