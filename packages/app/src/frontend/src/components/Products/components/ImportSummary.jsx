import React, { useEffect, useState } from "react";
import {
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Package,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ImportHistoryList() {
  const { t, i18n } = useTranslation();
  const api = window.api;

  const [imports, setImports] = useState([]);
  const [stats, setStats] = useState({
    total_imports: 0,
    total_created: 0,
    total_skipped: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [itemsByImport, setItemsByImport] = useState({});
  const [loadingItems, setLoadingItems] = useState({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await api.getProductImports();
        if (!cancelled) {
          setImports(res?.data || []);
          setStats(
            res?.stats || {
              total_imports: 0,
              total_created: 0,
              total_skipped: 0,
            },
          );
        }
      } catch (err) {
        console.error("Failed to load import history:", err);
        if (!cancelled) setError(err?.message || t("errors.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const toggleExpand = async (importRow) => {
    const isExpanded = expandedId === importRow.id;
    setExpandedId(isExpanded ? null : importRow.id);

    if (!isExpanded && !itemsByImport[importRow.id]) {
      setLoadingItems((prev) => ({ ...prev, [importRow.id]: true }));
      try {
        const res = await api.getProductImportItems(importRow.id);
        setItemsByImport((prev) => ({ ...prev, [importRow.id]: res || [] }));
      } catch (err) {
        console.error("Failed to load import items:", err);
        setItemsByImport((prev) => ({ ...prev, [importRow.id]: [] }));
      } finally {
        setLoadingItems((prev) => ({ ...prev, [importRow.id]: false }));
      }
    }
  };

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900">
      <main className="mx-auto max-w-7xl space-y-6">
        {/* HERO HEADER */}
        <section className="overflow-hidden rounded-[32px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.14)] backdrop-blur">
          <div className="grid gap-6 p-7 xl:grid-cols-[1fr_420px]">
            <div>
              <p className="mb-2 text-xs font-bold uppercase  text-[#4663ff]">
                {t("ui.inventory")}
              </p>
              <h1 className="max-w-2xl text-4xl font-black leading-tight text-slate-950">
                {t("screens.products.importHistory.title")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                {t("screens.products.importHistory.subtitle")}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-3xl border border-[#e5ebff] bg-[#f8faff] p-4">
                <FileSpreadsheet size={20} className="mb-4 text-[#4663ff]" />
                <div className="text-2xl font-black text-slate-950">
                  {stats.total_imports}
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  {t("screens.products.importHistory.totalImports")}
                </div>
              </div>
              <div className="rounded-3xl border border-[#e5ebff] bg-[#f8faff] p-4">
                <Package size={20} className="mb-4 text-emerald-600" />
                <div className="text-2xl font-black text-slate-950">
                  {stats.total_created}
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  {t("screens.products.importHistory.totalCreated")}
                </div>
              </div>
              <div className="rounded-3xl border border-[#e5ebff] bg-[#f8faff] p-4">
                <AlertTriangle size={20} className="mb-4 text-amber-600" />
                <div className="text-2xl font-black text-slate-950">
                  {stats.total_skipped}
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  {t("screens.products.importHistory.totalSkipped")}
                </div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* LIST */}
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)]">
          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">
              {t("common.loading")}
            </div>
          ) : imports.length === 0 ? (
            <div className="p-12 text-center">
              <FileSpreadsheet size={42} className="mx-auto text-[#4663ff]" />
              <h2 className="mt-4 text-xl font-black text-slate-950">
                {t("screens.products.importHistory.noImports")}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {t("screens.products.importHistory.noImportsHint")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#eef1ff]">
              {imports.map((imp) => {
                const isExpanded = expandedId === imp.id;
                const items = itemsByImport[imp.id];
                const isLoadingItems = loadingItems[imp.id];
                const totalSkippedForRow =
                  (imp.skipped_products_count || 0) +
                  (imp.skipped_barcodes_count || 0) +
                  (imp.skipped_units_count || 0) +
                  (imp.skipped_tags_count || 0);
                const hasIssues = totalSkippedForRow > 0;

                return (
                  <div key={imp.id}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(imp)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#f8faff]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400">
                          {isExpanded ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </span>
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef3ff] text-[#4663ff]">
                          <FileSpreadsheet size={18} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">
                            {imp.file_name ||
                              t(
                                "screens.products.importHistory.untitledImport",
                              )}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatDate(imp.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1 font-bold text-emerald-700">
                          <CheckCircle2 size={14} />
                          {imp.created_count}
                        </span>
                        {hasIssues && (
                          <span className="flex items-center gap-1 font-bold text-amber-600">
                            <AlertTriangle size={14} />
                            {totalSkippedForRow}
                          </span>
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="bg-[#f8faff]/60 px-5 py-4">
                        {isLoadingItems ? (
                          <div className="text-sm text-slate-500">
                            {t("common.loading")}
                          </div>
                        ) : items && items.length > 0 ? (
                          <div className="space-y-1.5">
                            {items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs"
                              >
                                <span className="font-bold text-slate-700">
                                  {t("ui.row")} {item.row_number} ·{" "}
                                  {item.product_name || item.barcode}
                                </span>
                                <span className="shrink-0 text-amber-700">
                                  {t(`errors.${item.reason}`)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                            <CheckCircle2 size={14} />
                            {t(
                              "screens.products.importHistory.noIssuesInImport",
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
