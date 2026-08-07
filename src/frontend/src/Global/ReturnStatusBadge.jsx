// src/Global/ReturnStatusBadge.jsx
import { useTranslation } from "react-i18next";
import { Undo2 } from "lucide-react";

const STYLES = {
  full: "bg-red-50 text-red-600",
  partial: "bg-amber-50 text-amber-600",
};

export default function ReturnStatusBadge({ status }) {
  const { t } = useTranslation();

  if (!status || status === "none") return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${STYLES[status]}`}
    >
      <Undo2 size={11} />
      {status === "full" ? t("ui.fully-refunded") : t("ui.partially-refunded")}
    </span>
  );
}
