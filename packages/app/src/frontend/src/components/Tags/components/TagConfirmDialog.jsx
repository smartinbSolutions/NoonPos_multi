// packages/app/src/renderer/components/tags/TagConfirmDialog.jsx

import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

export default function TagConfirmDialog({
  confirmState,
  onCancel,
  onConfirmDelete,
  onConfirmScopeChange,
}) {
  const { t } = useTranslation();
  const isDelete = confirmState.type === "delete";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[28px] border border-white/80 bg-white/90 p-6 text-center shadow-[0_24px_80px_rgba(70,99,255,0.18)] backdrop-blur">
        <AlertTriangle className="mx-auto mb-3 text-[#9C7B45]" size={32} />

        {isDelete ? (
          <>
            <h2 className="mb-2 font-black text-[#1c2340]">
              {t("screens.tags.confirmDeleteTitle")}
            </h2>
            <p className="mb-5 text-sm text-[#1c2340]/60">
              {t("screens.tags.confirmDeleteBody", {
                count: confirmState.info,
              })}
            </p>
          </>
        ) : (
          <>
            <h2 className="mb-2 font-black text-[#1c2340]">
              {t("screens.tags.confirmScopeTitle")}
            </h2>
            <p className="mb-5 text-sm text-[#1c2340]/60">
              {t("screens.tags.confirmScopeBody")}
            </p>
            <ul className="mb-5 space-y-1 text-start text-sm text-[#1c2340]/70">
              {confirmState.info.map((m) => (
                <li key={m.entity_type}>
                  {t(`screens.tags.scopes.${m.entity_type}`)}:{" "}
                  <span className="font-bold tabular-nums">{m.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex justify-center gap-2">
          <button
            onClick={onCancel}
            className="rounded-[14px] px-4 py-2 font-bold text-[#1c2340]/60 hover:bg-[#1c2340]/5"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={isDelete ? onConfirmDelete : onConfirmScopeChange}
            className="rounded-[14px] bg-red-500 px-4 py-2 font-bold text-white shadow-[0_12px_30px_rgba(239,68,68,0.35)]"
          >
            {t("common.confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
