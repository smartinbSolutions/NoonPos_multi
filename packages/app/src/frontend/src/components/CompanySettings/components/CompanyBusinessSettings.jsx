import { useEffect, useState } from "react";
import {
  Save,
  PackageX,
  Receipt,
  X,
  Lock,
  Unlock,
  Printer,
  CheckCircle2,
  Settings2,
  DatabaseBackup,
} from "lucide-react";
import useUpdateCompanySettings from "../hooks/useUpdateCompanySettings";
import { useTranslation } from "react-i18next";
import { ToastContainer } from "react-toastify";
import PrinterSettingsModal from "./PrinterSettingsModal";
import BackupSettingsModal from "./BackupSettingsModal";

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      dir="ltr"
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        checked ? "bg-indigo-600" : "bg-gray-200"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function CompanyBusinessSettings() {
  const { t } = useTranslation();
  const {
    handleSave,
    toggleAllowNegativeStock,
    setPosInvoiceTaxMode,
    addDefaultPosTax,
    removeDefaultPosTax,
    handleChange,
    form,
    taxes,
    saving,
    loading,
  } = useUpdateCompanySettings();

  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const [defaultPrinterName, setDefaultPrinterName] = useState(null);
  const [backupModalOpen, setBackupModalOpen] = useState(false);

  // Lightweight standalone check — deliberately NOT using the full
  // usePrinterSettings hook here, since this row only needs to know
  // "is a default printer configured", not the whole detect/test/save
  // machinery the modal needs.
  const refreshPrinterStatus = async () => {
    if (!window.api) return;
    try {
      const res = await window.api.getPrinterSettings();
      const defaultPrinter = res?.success
        ? res.data.find((p) => p.is_default)
        : null;
      setDefaultPrinterName(defaultPrinter?.device_name || null);
    } catch (err) {
      console.error("Failed to check printer status:", err);
    }
  };

  useEffect(() => {
    refreshPrinterStatus();
  }, []);

  const closePrinterModal = () => {
    setPrinterModalOpen(false);
    refreshPrinterStatus(); // pick up any change made while the modal was open
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500 text-lg">
        {t("common.loading")}
      </div>
    );
  }

  const isFixedTaxMode = form.pos_invoice_tax_mode === "fixed";

  return (
    <div className="p-6 bg-[#f5f7fb] min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            {t("screens.company.businessSettingsTitle", "Business Settings")}
          </h1>
          <p className="text-gray-500 mt-2">
            {t(
              "screens.company.businessSettingsSubtitle",
              "Rules that shape how sales and POS behave across the app.",
            )}
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8 space-y-6">
            {/* Negative stock */}
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <PackageX size={17} />
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-800">
                    {t(
                      "screens.company.allowNegativeStock",
                      "Allow selling out-of-stock items",
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t(
                      "screens.company.allowNegativeStockHint",
                      "When off, the POS and manual sales block checkout on items with zero stock.",
                    )}
                  </p>
                </div>
              </div>
              <Toggle
                checked={Boolean(form.allow_negative_stock)}
                onChange={toggleAllowNegativeStock}
              />
            </div>
            {/* Minimum stock threshold */}
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <PackageX size={17} />
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-800">
                    {t(
                      "screens.company.minimumStock",
                      "Minimum stock threshold",
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t(
                      "screens.company.minimumStockHint",
                      "Products at or below this quantity are flagged as low stock on the dashboard.",
                    )}
                  </p>
                </div>
              </div>
              <input
                type="number"
                min={0}
                value={form.minimum_stock}
                onChange={(e) =>
                  handleChange({
                    target: { name: "minimum_stock", value: e.target.value },
                  })
                }
                className="h-10 w-24 rounded-xl border border-gray-200 bg-white px-3 text-center text-sm font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* POS invoice tax mode */}
            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Receipt size={17} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">
                    {t("screens.company.posTaxMode", "POS invoice-level tax")}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t(
                      "screens.company.posTaxModeHint",
                      "Choose whether the cashier can pick invoice taxes freely, or the taxes are fixed by you and applied automatically.",
                    )}
                  </p>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPosInvoiceTaxMode("manual")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                        !isFixedTaxMode
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      <Unlock size={13} />
                      {t(
                        "screens.company.taxModeManual",
                        "Manual — cashier picks",
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPosInvoiceTaxMode("fixed")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                        isFixedTaxMode
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      <Lock size={13} />
                      {t(
                        "screens.company.taxModeFixed",
                        "Fixed — locked by owner",
                      )}
                    </button>
                  </div>

                  {isFixedTaxMode && (
                    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                        {t(
                          "screens.company.defaultPosTaxes",
                          "Default taxes applied to every POS sale",
                        )}
                      </label>

                      {(form.default_pos_taxes || []).length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {form.default_pos_taxes.map((tax) => (
                            <span
                              key={tax.tax_id}
                              className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 shadow-sm"
                            >
                              {tax.name} ({tax.rate}%)
                              <button
                                type="button"
                                onClick={() => removeDefaultPosTax(tax.tax_id)}
                                className="rounded p-0.5 text-emerald-500/60 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <select
                        value=""
                        onChange={(e) => {
                          const selected = taxes.find(
                            (tx) => tx.id === Number(e.target.value),
                          );
                          if (selected) addDefaultPosTax(selected);
                        }}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-300"
                      >
                        <option value="">
                          {t(
                            "screens.company.addDefaultTax",
                            "Add a default tax",
                          )}
                        </option>
                        {taxes
                          .filter(
                            (tx) =>
                              (tx.category === "invoice" ||
                                tx.category === "both") &&
                              !(form.default_pos_taxes || []).some(
                                (applied) => applied.tax_id === tx.id,
                              ),
                          )
                          .map((tx) => (
                            <option key={tx.id} value={tx.id}>
                              {tx.name} ({tx.rate}%)
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Receipt printer — trigger row, opens PrinterSettingsModal */}
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Printer size={17} />
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-800">
                    {t("screens.printers.rowTitle", "Receipt printer")}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                    {defaultPrinterName ? (
                      <>
                        <CheckCircle2 size={13} className="text-emerald-600" />
                        <span className="font-bold text-emerald-700">
                          {defaultPrinterName}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-500">
                        {t("screens.printers.notSetUp", "Not set up yet")}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPrinterModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
              >
                <Settings2 size={14} />
                {t("screens.printers.manage", "Manage")}
              </button>
            </div>

            {/* Database backups — trigger row, opens BackupSettingsModal */}
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <DatabaseBackup size={17} />{" "}
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-800">
                    {t("screens.backup.rowTitle", "Database backups")}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t(
                      "screens.backup.rowHint",
                      "Back up locally, on a schedule or on demand.",
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBackupModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
              >
                <Settings2 size={14} />
                {t("screens.backup.manage", "Manage")}
              </button>
            </div>
          </div>

          <div className="px-8 pb-8 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-2xl bg-[#4663ff] px-6 py-3 text-sm font-black text-white shadow-[0_12px_32px_rgba(70,99,255,0.35)] transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? t("common.saving") : t("screens.company.saveSettings")}
            </button>
          </div>
        </div>
      </div>

      <PrinterSettingsModal
        isOpen={printerModalOpen}
        onClose={closePrinterModal}
      />

      <BackupSettingsModal
        isOpen={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
      />

      <ToastContainer />
    </div>
  );
}
