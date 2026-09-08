import { useState } from "react";
import { createPortal } from "react-dom";
import { ShieldAlert, KeyRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { normalizeDigits } from "../../../Global/FormatNumber";

/**
 * Shared PIN + recovery key credential prompt. Used anywhere an action
 * needs to verify "you are genuinely an admin, right now" — backup
 * restore, manual backup creation, manual cloud upload. Each caller
 * supplies its own title/description/confirm label and onConfirm
 * handler; this component only owns the credential-entry UI and local
 * validation, not what happens after confirmation.
 */
export default function AdminCredentialsModal({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  confirmingLabel,
  isConfirming,
  onConfirm,
  danger = false,
}) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [localError, setLocalError] = useState("");

  const resetAndClose = () => {
    setPin("");
    setRecoveryKey("");
    setLocalError("");
    onClose();
  };

  if (!open) return null;

  const handleConfirm = async () => {
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
    const res = await onConfirm({ pin, recoveryKey: recoveryKey.trim() });
    if (!res?.success) {
      setLocalError(
        res?.error
          ? t(`errors.${res.error}`, res.error)
          : t("screens.backup.actionFailed", "Action failed"),
      );
      setPin("");
    } else {
      resetAndClose();
    }
  };

  const accent = danger ? "red" : "[#4663ff]";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1c2340]/60 backdrop-blur-sm"
        onClick={isConfirming ? undefined : resetAndClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(28,35,64,0.35)]">
        <div
          className={`flex items-center justify-between border-b px-6 py-5 ${
            danger
              ? "border-red-100 bg-red-50"
              : "border-[#e9edfb] bg-[#eef3ff]"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                danger
                  ? "bg-red-100 text-red-600"
                  : "bg-[#4663ff]/10 text-[#4663ff]"
              }`}
            >
              <ShieldAlert size={18} />
            </span>
            <h2
              className={`text-base font-black ${danger ? "text-red-700" : "text-slate-950"}`}
            >
              {title}
            </h2>
          </div>
          {!isConfirming && (
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
          {description && (
            <p className="mb-4 text-xs font-bold text-slate-500">
              {description}
            </p>
          )}

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
            <p className="mb-3 text-xs font-bold text-red-600">{localError}</p>
          )}

          <button
            type="button"
            disabled={isConfirming || pin.length !== 6 || !recoveryKey.trim()}
            onClick={handleConfirm}
            className={`w-full rounded-xl py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[#4663ff] hover:bg-[#3854e8]"
            }`}
          >
            {isConfirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
