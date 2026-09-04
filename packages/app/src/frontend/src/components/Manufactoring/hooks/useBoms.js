// packages/app/src/renderer/features/boms/hooks/useBoms.js

import { useCallback, useEffect, useState } from "react";

export default function useBoms() {
  const [boms, setBoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFiltersState] = useState({
    product_id: null,
    related_product_id: null,
  });

  const setFilters = (patch) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const clearFilters = () => {
    setFiltersState({ product_id: null, related_product_id: null });
    setPage(1);
  };

  const [openDeleteModel, setOpenDeleteModel] = useState(false);
  const [selectDeleteBom, setSelectDeleteBom] = useState(null);

  const fetchBoms = useCallback(() => {
    setLoading(true);
    setError(null);
    window.api
      .getBoms({
        page,
        limit,
        search: search || undefined,
        product_id: filters.product_id || undefined,
        related_product_id: filters.related_product_id || undefined,
      })
      .then((res) => {
        if (res.success) {
          setBoms(res.data);
          setTotal(res.total);
          setTotalPages(res.totalPages);
        } else {
          setError(res.error);
        }
      })
      .finally(() => setLoading(false));
  }, [page, limit, search, filters]);

  useEffect(() => {
    fetchBoms();
  }, [fetchBoms]);

  const handleDeleteBom = async (bom) => {
    setActionError(null);
    const res = await window.api.deleteBom(bom.id);
    if (!res.success) {
      setActionError(res.error);
    } else {
      fetchBoms();
    }
    setOpenDeleteModel(false);
    setSelectDeleteBom(null);
    return res;
  };

  return {
    boms,
    loading,
    error,
    refetch: fetchBoms,
    actionError,
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
    handleDeleteBom,
    openDeleteModel,
    setOpenDeleteModel,
    selectDeleteBom,
    setSelectDeleteBom,
  };
}
