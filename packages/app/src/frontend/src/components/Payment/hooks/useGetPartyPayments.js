import { useEffect, useState } from "react";

const DEFAULT_LIMIT = 10;

export default function usePartyLedger(partyId, partyType) {
  const api = window.api;

  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({
    total_increase: 0,
    total_decrease: 0,
    total_invoice: 0,
    total_return: 0,
    total_payment: 0,
    opening_balance: 0,
  });
  const [loading, setLoading] = useState(false);
  const [party, setParty] = useState(null);

  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(DEFAULT_LIMIT);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Page-level date filter — independent of the export modal's own range.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Changing page size mid-list is confusing without also snapping back to
  // page 1 — same reasoning as the date-filter reset below.
  const setLimit = (nextLimit) => {
    setLimitState(nextLimit);
    setPage(1);
  };

  const fetchData = async () => {
    if (!partyId || !partyType) return;

    setLoading(true);

    try {
      const {
        data: rows,
        total: totalCount,
        totalPages: pages,
        summary: summaryData,
      } = await api.getPartyHistoryLedger({
        partyId,
        partyType,
        page,
        limit,
        startDate: dateFrom || undefined,
        endDate: dateTo || undefined,
      });

      if (partyType === "customer") {
        const customer = await api.getCustomer(partyId);
        setParty(customer);
      } else if (partyType === "supplier") {
        const supplier = await api.getSupplier(partyId);
        setParty(supplier);
      } else if (partyType === "partner") {
        const partner = await api.getPartner(partyId);
        setParty(partner);
      }

      setData(rows);
      setTotal(totalCount);
      setTotalPages(pages);
      setSummary(summaryData);
    } catch (err) {
      console.error("Ledger Error:", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, partyType, page, limit, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [partyId, partyType]);

  // Changing the date filter should reset back to page 1 too.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  return {
    data,
    summary,
    loading,
    refetch: fetchData,
    party,
    page,
    setPage,
    total,
    totalPages,
    limit,
    setLimit,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
  };
}
