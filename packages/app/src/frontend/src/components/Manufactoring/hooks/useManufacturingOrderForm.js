// packages/app/src/renderer/features/manufacturingOrders/hooks/useManufacturingOrderForm.js

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

const emptyItem = {
  raw_material_product_id: "",
  name: "",
  code: "",
  available_units: [],
  unit_id: null,
  unit_name: "",
  unit_conversion_factor: 1,
  quantity: 1,
  per_unit_quantity: 1,
  cost_price: 0, // live costPrice, used for cost preview only
};

const emptyOrder = {
  output_product_id: "",
  order_name: "",
  bom_id: null,
  output_quantity: 1,
  output_unit_id: null,
  output_unit_name: "",
  output_unit_conversion_factor: 1,
  labor_cost: 0,
  overhead_cost: 0,
  date: new Date().toISOString().slice(0, 10),
  description: "",
};

export default function useManufacturingOrderForm() {
  const { t } = useTranslation();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const api = window.api;

  const [order, setOrder] = useState(emptyOrder);
  const [items, setItems] = useState([emptyItem]);
  const [products, setProducts] = useState([]);
  const [outputAvailableUnits, setOutputAvailableUnits] = useState([]);
  const [availableBoms, setAvailableBoms] = useState([]);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refetchProducts = useCallback(async () => {
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
    refetchProducts();
  }, [refetchProducts]);

  // Load existing order when editing
  // Load existing order when editing
  useEffect(() => {
    if (!isEdit) return;

    setLoading(true);
    api
      .getManufacturingOrder(id)
      .then((res) => {
        if (!res.success) {
          setError(res.error);
          return;
        }

        const data = res.data;

        setOrder({
          output_product_id: data.output_product_id,
          order_name: data.order_name || "",
          bom_id: data.bom_id || null,
          output_quantity: data.output_quantity,
          output_unit_id: null,
          output_unit_name: data.output_unit_name || "",
          output_unit_conversion_factor:
            data.output_unit_conversion_factor || 1,
          labor_cost: data.labor_cost || 0,
          overhead_cost: data.overhead_cost || 0,
          date: data.date
            ? data.date.slice(0, 10)
            : new Date().toISOString().slice(0, 10),
          description: data.description || "",
        });

        setOutputAvailableUnits(data.output_available_units || []);

        // <<< REPLACED BLOCK STARTS HERE >>>
        setItems(
          data.items.map((i) => {
            const outputQty = Number(data.output_quantity || 1);
            const quantity = Number(i.quantity);
            return {
              raw_material_product_id: i.raw_material_product_id,
              name: i.raw_material_name,
              code: i.raw_material_code || "",
              available_units: i.available_units || [],
              unit_id: null,
              unit_name: i.unit_name,
              unit_conversion_factor: i.unit_conversion_factor,
              quantity,
              per_unit_quantity:
                outputQty > 0 ? quantity / outputQty : quantity,
              cost_price: i.unit_cost_snapshot,
            };
          }),
        );
        // <<< REPLACED BLOCK ENDS HERE >>>
      })
      .catch((err) => setError(err.message || t("errors.loadError")))
      .finally(() => setLoading(false));
  }, [isEdit, id]);

  // ---- Output product selection ----
  const selectOutputProduct = async (productId) => {
    if (!productId) return;
    try {
      const fullProduct = await api.getProduct(productId);
      if (!fullProduct) return;

      const productUnits = fullProduct.productUnits || [];
      const baseUnit = productUnits.find((u) => u.is_base) || null;

      setOutputAvailableUnits(productUnits);
      setOrder((prev) => ({
        ...prev,
        output_product_id: fullProduct.id,
        output_unit_id: baseUnit?.id ?? null,
        output_unit_name: baseUnit?.unit_name || "",
        output_unit_conversion_factor: 1,
      }));

      // Load this product's BOMs so the user can optionally prefill from one
      const bomsRes = await api.getBoms({ product_id: productId, limit: 50 });
      setAvailableBoms(bomsRes?.success ? bomsRes.data : []);
    } catch (err) {
      console.error("Failed to load output product detail:", err);
    }
  };

  const updateOutputUnit = (unitId) => {
    const selectedUnit = outputAvailableUnits.find(
      (u) => u.id === Number(unitId),
    );
    if (!selectedUnit) return;

    setOrder((prev) => ({
      ...prev,
      output_unit_id: selectedUnit.id,
      output_unit_name: selectedUnit.unit_name,
      output_unit_conversion_factor: selectedUnit.is_base
        ? 1
        : Number(selectedUnit.conversion_factor || 1),
    }));
  };

  // ---- Prefill raw materials from a chosen BOM ----
  const applyBom = async (bomId) => {
    if (!bomId) {
      setOrder((prev) => ({ ...prev, bom_id: null }));
      return;
    }
    try {
      const res = await api.getBom(bomId);
      if (!res.success) return;

      const outputQty = Number(order.output_quantity || 1);

      setOrder((prev) => ({ ...prev, bom_id: bomId }));
      setItems(
        res.data.items.map((i) => ({
          raw_material_product_id: i.raw_material_product_id,
          name: i.raw_material_name,
          code: i.raw_material_code || "",
          available_units: i.available_units || [],
          unit_id: i.unit_id,
          unit_name: i.unit_name,
          unit_conversion_factor: i.unit_conversion_factor,
          per_unit_quantity: Number(i.quantity), // BOM quantity = ratio for 1 unit
          quantity: Number(i.quantity) * outputQty,
          cost_price: i.raw_material_cost_price,
        })),
      );
    } catch (err) {
      console.error("Failed to load BOM:", err);
    }
  };

  // ---- Raw material item rows ----
  const addItem = () => {
    setItems((prev) => [...prev, emptyItem]);
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
      const outputQty = Number(order.output_quantity || 1);

      setItems((prev) => {
        const copy = [...prev];
        const currentQty = Number(copy[index].quantity || 1);
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
          per_unit_quantity:
            outputQty > 0 ? currentQty / outputQty : currentQty,
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
      const outputQty = Number(order.output_quantity || 1);
      const newQty = Number(quantity) || 0;

      copy[index] = {
        ...copy[index],
        quantity,
        per_unit_quantity: outputQty > 0 ? newQty / outputQty : newQty,
      };
      return copy;
    });
  };
  const updateOutputQuantity = (newQuantity) => {
    const qty = Number(newQuantity) || 0;

    setOrder((prev) => ({ ...prev, output_quantity: newQuantity }));

    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        quantity: Number(item.per_unit_quantity || 0) * qty,
      })),
    );
  };

  // ---- Live cost preview (mirrors backend calc, for display only —
  // backend always recomputes authoritatively on save) ----
  const rawMaterialCost = items.reduce((sum, item) => {
    const qty = Number(item.quantity || 0);
    const factor = Number(item.unit_conversion_factor || 1);
    return sum + qty * factor * Number(item.cost_price || 0);
  }, 0);

  const totalCost =
    rawMaterialCost +
    Number(order.labor_cost || 0) +
    Number(order.overhead_cost || 0);

  const outputBaseQuantity =
    Number(order.output_quantity || 0) *
    Number(order.output_unit_conversion_factor || 1);

  const unitCost = outputBaseQuantity > 0 ? totalCost / outputBaseQuantity : 0;

  const hasUsableItems = items.some((i) => i.raw_material_product_id);
  const canSave =
    Boolean(order.output_product_id) &&
    Number(order.output_quantity) > 0 &&
    hasUsableItems &&
    !saving;

  const submit = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiNotAvailable"));
      return;
    }
    if (!order.output_product_id) {
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
        output_product_id: order.output_product_id,
        order_name: order.order_name?.trim() || undefined,
        bom_id: order.bom_id || null,
        output_quantity: Number(order.output_quantity),
        output_unit_name: order.output_unit_name,
        output_unit_conversion_factor: order.output_unit_conversion_factor,
        labor_cost: Number(order.labor_cost || 0),
        overhead_cost: Number(order.overhead_cost || 0),
        date: order.date,
        description: order.description,
        items: items
          .filter((i) => i.raw_material_product_id)
          .map((i) => ({
            raw_material_product_id: i.raw_material_product_id,
            unit_name: i.unit_name,
            unit_conversion_factor: i.unit_conversion_factor,
            quantity: Number(i.quantity),
          })),
      };

      const res = isEdit
        ? await api.updateManufacturingOrder({ id, ...payload })
        : await api.createManufacturingOrder(payload);

      if (!res?.success) {
        throw new Error(res?.error || t("errors.saveError"));
      }

      navigate("/manufacturing-orders");
      return res;
    } catch (err) {
      setError(err.message || t("errors.saveError"));
    } finally {
      setSaving(false);
    }
  }, [api, order, items, isEdit, id]);

  return {
    isEdit,
    order,
    setOrder,
    items,
    products,
    setProducts,
    outputAvailableUnits,
    availableBoms,
    addItem,
    removeItem,
    selectOutputProduct,
    updateOutputUnit,
    applyBom,
    selectItemProduct,
    updateItemUnit,
    updateItemQuantity,
    updateOutputQuantity,
    rawMaterialCost,
    totalCost,
    unitCost,
    canSave,
    loading,
    saving,
    error,
    submit,
  };
}
