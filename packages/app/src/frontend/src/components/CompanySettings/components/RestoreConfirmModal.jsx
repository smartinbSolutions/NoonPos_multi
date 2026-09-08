import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../Global/AuthContext";
import AdminCredentialsModal from "./AdminCredentialsModal";

export default function RestoreConfirmModal({ open, onClose, backup, hook }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { restoreBackup, restoring } = hook;

  // Stage 1: explicit warning + typed acknowledgment. Stage 2: credentials,
  // now handled entirely by the shared AdminCredentialsModal. Kept as two
  // literal steps rather than one form so a rushed click can't skip past
  // the warning straight into typing a PIN.
  const [acknowledged, setAcknowledged] = useState(false);
  const [ackText, setAckText] = useState("");

  const ACK_PHRASE = "RESTORE";

  const resetAndClose = () => {
    setAcknowledged(false);
    setAckText("");
    onClose();
  };

  if (!open || !backup) return null;

  const canProceedToAuth = ackText.trim().toUpperCase() === ACK_PHRASE;

  const handleConfirmRestore = async ({ pin, recoveryKey }) => {
    const res = await restoreBackup({
      filePath: backup.filePath,
      administratorId: user?.id,
      administratorPin: pin,
      recoveryKey,
      administratorUsername: user?.username,
    });
    // On success, main process relaunches the whole app — nothing left to
    // render here, so AdminCredentialsModal's own success path (closing
    // itself) never actually gets seen; but on failure it needs the
    // {success, error} shape back to show the message and let the user
    // retry.
    return res;
  };

  if (acknowledged) {
    return (
      <AdminCredentialsModal
        open={open}
        onClose={resetAndClose}
        title={t("screens.backup.restoreTitle", "Restore backup")}
        description={t(
          "screens.backup.authRequired",
          "Confirm your identity to proceed",
        )}
        confirmLabel={t(
          "screens.backup.confirmRestore",
          "Restore and relaunch",
        )}
        confirmingLabel={t("screens.backup.restoring", "Restoring...")}
        isConfirming={restoring}
        onConfirm={handleConfirmRestore}
        danger
      />
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1c2340]/60 backdrop-blur-sm"
        onClick={resetAndClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(28,35,64,0.35)]">
        <div className="flex items-center justify-between border-b border-red-100 bg-red-50 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <AlertTriangle size={18} />
            </span>
            <h2 className="text-base font-black text-red-700">
              {t("screens.backup.restoreTitle", "Restore backup")}
            </h2>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50/60 p-3 text-xs font-bold text-red-700">
            {t(
              "screens.backup.restoreWarning",
              "This will permanently overwrite ALL current data with the selected backup. This cannot be undone.",
            )}
          </div>

          <p className="mb-3 truncate text-xs font-bold text-slate-500">
            {backup.fileName}
          </p>

          <label className="mb-1.5 block text-xs font-bold text-slate-600">
            {t(
              "screens.backup.typeToConfirm",
              `Type "${ACK_PHRASE}" to confirm you understand`,
            )}
          </label>
          <input
            autoFocus
            value={ackText}
            onChange={(e) => setAckText(e.target.value)}
            dir="ltr"
            className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-black tracking-widest text-red-700 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
            placeholder={ACK_PHRASE}
          />
          <button
            type="button"
            disabled={!canProceedToAuth}
            onClick={() => setAcknowledged(true)}
            className="mt-4 w-full rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("common.continue", "Continue")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
