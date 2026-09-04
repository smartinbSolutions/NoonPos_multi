import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X, ShieldAlert, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../Global/AuthContext";
import { normalizeDigits } from "../../../Global/FormatNumber";

export default function RestoreConfirmModal({ open, onClose, backup, hook }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { restoreBackup, restoring } = hook;

  // Stage 1: explicit warning + typed acknowledgment. Stage 2: credentials.
  // Kept as two literal steps rather than one form so a rushed click can't
  // skip past the warning straight into typing a PIN.
  const [acknowledged, setAcknowledged] = useState(false);
  const [ackText, setAckText] = useState("");
  const [pin, setPin] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [localError, setLocalError] = useState("");

  const ACK_PHRASE = "RESTORE";

  const resetAndClose = () => {
    setAcknowledged(false);
    setAckText("");
    setPin("");
    setRecoveryKey("");
    setLocalError("");
    onClose();
  };

  if (!open || !backup) return null;

  const canProceedToAuth = ackText.trim().toUpperCase() === ACK_PHRASE;

  const handleConfirmRestore = async () => {
    setLocalError("");
    if (pin.length !== 6 || !recoveryKey.trim()) {
      setLocalError(
        t(
          "screens.backup.fillBothFields",
          "Enter both the PIN and the recovery key.",
        ),
      );
      return;
    }

    const res = await restoreBackup({
      filePath: backup.filePath,
      administratorId: user?.id,
      administratorPin: pin,
      recoveryKey: recoveryKey.trim(),
      administratorUsername: user?.username,
    });

    if (!res?.success) {
      setLocalError(
        res?.error
          ? t(`errors.${res.error}`, res.error)
          : t("screens.backup.restoreFailed", "Restore failed"),
      );
      setPin("");
    }
    // On success, main process relaunches the whole app — nothing left to
    // render here, so no success state is needed.
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1c2340]/60 backdrop-blur-sm"
        onClick={restoring ? undefined : resetAndClose}
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
          {!restoring && (
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-slate-700"
            >
              <X size={18} />
            </button>
          )}
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

          {!acknowledged ? (
            <div>
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
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-500">
                <ShieldAlert size={14} />
                {t(
                  "screens.backup.authRequired",
                  "Confirm your identity to proceed",
                )}
              </div>

              <label className="mb-1.5 block text-xs font-bold text-slate-600">
                {t("screens.backup.adminPin", "Your admin PIN")}
              </label>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) =>
                  setPin(normalizeDigits(e.target.value).slice(0, 6))
                }
                dir="ltr"
                className="mb-3 w-full rounded-xl border border-[#dbe4ff] bg-white px-3 py-2 text-center text-lg font-black tracking-[0.5em] outline-none focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10"
                placeholder="••••••"
              />

              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <KeyRound size={13} />
                {t("screens.backup.recoveryKey", "Recovery key")}
              </label>
              <input
                type="text"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                dir="ltr"
                className="mb-3 w-full rounded-xl border border-[#dbe4ff] bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[#4663ff] focus:ring-4 focus:ring-[#4663ff]/10"
                placeholder={t(
                  "screens.backup.recoveryKeyPlaceholder",
                  "Enter recovery key",
                )}
              />

              {localError && (
                <p className="mb-3 text-xs font-bold text-red-600">
                  {localError}
                </p>
              )}

              <button
                type="button"
                disabled={restoring || pin.length !== 6 || !recoveryKey.trim()}
                onClick={handleConfirmRestore}
                className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {restoring
                  ? t("screens.backup.restoring", "Restoring...")
                  : t("screens.backup.confirmRestore", "Restore and relaunch")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
