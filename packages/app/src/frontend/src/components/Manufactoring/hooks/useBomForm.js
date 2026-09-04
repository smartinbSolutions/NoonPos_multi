// packages/app/src/renderer/features/boms/hooks/useBomForm.js

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

const emptyBomItem = {
  raw_material_product_id: "",
  name: "",
  code: "",
  available_units: [],
  unit_id: null,
  unit_name: "",
  unit_conversion_factor: 1,
  quantity: 1,
  cost_price: 0, // live costPrice snapshot, for estimated-cost display only
};

const emptyBom = {
  product_id: "",
  name: "Standard",
  notes: "",
  is_default: false,
};

export default function useBomForm() {
  const { t } = useTranslation();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const api = window.api;

  const [bom, setBom] = useState(emptyBom);
  const [items, setItems] = useState([emptyBomItem]);
  const [products, setProducts] = useState([]);
  const [existingBomsForProduct, setExistingBomsForProduct] = useState([]);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Initial product options for the searchable selects
  const refetch = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiNotAvailable"));
      return;
    }
    try {
      const res = await api.getProducts({ limit: 50, type: "normal" });
      setProducts(res?.data || []);
    } catch (err) {
      setError(err?.message || t("errors.loadError"));
    }
  }, [api]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Load existing BOM when editing — get-bom now returns each raw material's
  // full available_units list, so the unit dropdown is ready immediately,
  // no re-selection of the product required.
  useEffect(() => {
    if (!isEdit) return;

    setLoading(true);
    api
      .getBom(id)
      .then((res) => {
        if (!res.success) {
          setError(res.error);
          return;
        }

        const data = res.data;

        setBom({
          product_id: data.product_id,
          name: data.name,
          notes: data.notes || "",
          is_default: Boolean(data.is_default),
        });

        setItems(
          data.items.map((i) => ({
            raw_material_product_id: i.raw_material_product_id,
            name: i.raw_material_name,
            code: i.raw_material_code || "",
            available_units: i.available_units || [],
            unit_id: i.unit_id,
            unit_name: i.unit_name,
            unit_conversion_factor: i.unit_conversion_factor,
            quantity: i.quantity,
            cost_price: i.raw_material_cost_price,
          })),
        );

        // Also load sibling BOMs for the "is_default" picker context
        api
          .getBoms({ product_id: data.product_id, limit: 50 })
          .then((siblings) => {
            if (siblings.success) setExistingBomsForProduct(siblings.data);
          });
      })
      .catch((err) => setError(err.message || t("errors.loadError")))
      .finally(() => setLoading(false));
  }, [isEdit, id]);

  const selectOutputProduct = async (productId) => {
    if (!productId) return;
    try {
      const fullProduct = await api.getProduct(productId);
      if (!fullProduct) return;

      const existing = await api.getBoms({ product_id: productId, limit: 50 });
      setExistingBomsForProduct(existing?.data || []);

      setBom((prev) => ({ ...prev, product_id: fullProduct.id }));
    } catch (err) {
      console.error("Failed to load product detail:", err);
    }
  };

  const addItem = () => {
    setItems((prev) => [...prev, emptyBomItem]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const selectItemProduct = async (index, productId) => {
    if (!productId) return;
    try {
      const fullProduct = await api.getProduct(productId);
      if (!fullProduct) return;

      const productUnits = fullProduct.productUnits || [];
      const baseUnit = productUnits.find((u) => u.is_base) || null;

      setItems((prev) => {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          raw_material_product_id: fullProduct.id,
          name: fullProduct.name,
          code: fullProduct.code || "",
          available_units: productUnits,
          unit_id: baseUnit?.id ?? null,
          unit_name: baseUnit?.unit_name || "",
          unit_conversion_factor: 1,
          cost_price: fullProduct.costPrice || 0,
        };
        return copy;
      });
    } catch (err) {
      console.error("Failed to load raw material detail:", err);
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

      copy[index] = {
        ...item,
        unit_id: selectedUnit.id,
        unit_name: selectedUnit.unit_name,
        unit_conversion_factor: selectedUnit.is_base
          ? 1
          : Number(selectedUnit.conversion_factor || 1),
      };
      return copy;
    });
  };

  const updateItemQuantity = (index, quantity) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], quantity };
      return copy;
    });
  };

  const hasUsableItems = items.some((i) => i.raw_material_product_id);
  const canSave = Boolean(bom.product_id) && hasUsableItems && !saving;

  const estimatedCost = items.reduce((sum, item) => {
    const qty = Number(item.quantity || 0);
    const factor = Number(item.unit_conversion_factor || 1);
    return sum + qty * factor * Number(item.cost_price || 0);
  }, 0);

  const submit = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiNotAvailable"));
      return;
    }
    if (!bom.product_id) {
      setError(t("errors.productRequired", "Select a product"));
      return;
    }
    if (!hasUsableItems) {
      setError(t("errors.addOneItem"));
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        product_id: bom.product_id,
        name: bom.name,
        notes: bom.notes,
        is_default: bom.is_default,
        items: items
          .filter((i) => i.raw_material_product_id)
          .map((i) => ({
            raw_material_product_id: i.raw_material_product_id,
            unit_id: i.unit_id,
            quantity: Number(i.quantity),
          })),
      };

      const res = isEdit
        ? await api.updateBom({ id, ...payload })
        : await api.createBom(payload);

      if (!res?.success) {
        throw new Error(res?.error || t("errors.saveError"));
      }

      navigate("/boms");
      return res;
    } catch (err) {
      setError(err.message || t("errors.saveError"));
    } finally {
      setSaving(false);
    }
  }, [api, bom, items, isEdit, id]);

  return {
    isEdit,
    bom,
    setBom,
    items,
    products,
    setProducts,
    existingBomsForProduct,
    addItem,
    removeItem,
    selectOutputProduct,
    selectItemProduct,
    updateItemUnit,
    updateItemQuantity,
    estimatedCost,
    canSave,
    loading,
    saving,
    error,
    submit,
  };
}
