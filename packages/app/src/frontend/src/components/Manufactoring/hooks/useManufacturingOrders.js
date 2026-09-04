// packages/app/src/renderer/features/manufacturingOrders/hooks/useManufacturingOrders.js

import { useCallback, useEffect, useState } from "react";

export default function useManufacturingOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [units, setUnits] = useState([]);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFiltersState] = useState({
    output_product_id: null,
    unit_id: null,
    dateFrom: null,
    dateTo: null,
  });

  const [outputProductOptions, setOutputProductOptions] = useState([]);
  const [outputProductLabel, setOutputProductLabel] = useState("");

  const setFilters = (patch) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const clearFilters = () => {
    setFiltersState({
      output_product_id: null,
      unit_id: null,
      dateFrom: null,
      dateTo: null,
    });
    setOutputProductLabel("");
    setPage(1);
  };

  const searchOutputProducts = async (value) => {
    try {
      const res = await window.api.getProducts({
        page: 1,
        limit: 50,
        type: "normal",
        search: value.trim() || undefined,
      });
      setOutputProductOptions(res?.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const [openDeleteModel, setOpenDeleteModel] = useState(false);
  const [selectDeleteOrder, setSelectDeleteOrder] = useState(null);

  useEffect(() => {
    window.api.getUnits?.({ limit: 100 }).then((res) => {
      setUnits(res?.data || res || []);
    });
  }, []);

  useEffect(() => {
    window.api.getUnits?.({ limit: 100 }).then((res) => {
      setUnits(res?.data || res || []);
    });

    // Initial batch so the dropdown isn't empty before the user types anything
    searchOutputProducts("");
  }, []);

  const fetchOrders = useCallback(() => {
    setLoading(true);
    setError(null);
    window.api
      .getManufacturingOrders({
        page,
        limit,
        search: search || undefined,
        output_product_id: filters.output_product_id || undefined,
        unit_id: filters.unit_id || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      })
      .then((res) => {
        if (res.success) {
          setOrders(res.data);
          setTotal(res.total);
          setTotalPages(res.totalPages);
        } else {
          setError(res.error);
        }
      })
      .finally(() => setLoading(false));
  }, [page, limit, search, filters]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleDeleteOrder = async (order) => {
    setActionError(null);
    const res = await window.api.deleteManufacturingOrder(order.id);
    if (!res.success) {
      setActionError(res.error);
    } else {
      fetchOrders();
    }
    setOpenDeleteModel(false);
    setSelectDeleteOrder(null);
    return res;
  };

  return {
    orders,
    loading,
    error,
    refetch: fetchOrders,
    actionError,
    units,
    search,
    setSearch,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    filters,
    setFilters,
    clearFilters,
    outputProductOptions,
    outputProductLabel,
    setOutputProductLabel,
    searchOutputProducts,
    handleDeleteOrder,
    openDeleteModel,
    setOpenDeleteModel,
    selectDeleteOrder,
    setSelectDeleteOrder,
  };
}
