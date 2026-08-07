import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight } from "lucide-react";

// Sizing presets — controls both the button's box and the icon inside it,
// so callers pick one prop instead of juggling two class strings.
const SIZES = {
  sm: { box: "h-9 w-9", icon: 16 },
  md: { box: "h-10 w-10", icon: 18 },
  lg: { box: "h-12 w-12", icon: 20 },
};

/**
 * RTL-aware back button used across the app. Arrow direction flips
 * automatically based on i18n.dir() (Arabic -> right-pointing arrow,
 * since "back" visually moves toward the reading-start side).
 *
 * Defaults to navigate(-1); pass `to` to go to a fixed route instead,
 * or `onClick` to override the action entirely (e.g. close a modal).
 */
const BackButton = ({ to, onClick, size = "lg", className = "" }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isRtl = i18n.dir() === "rtl";
  const Icon = isRtl ? ArrowRight : ArrowLeft;
  const { box, icon } = SIZES[size] || SIZES.md;

  const handleClick = () => {
    if (onClick) return onClick();
    if (to) return navigate(to);
    navigate(-1);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t("common.back")}
      className={`flex shrink-0 items-center justify-center rounded-2xl border border-[#dbe4ff] bg-white text-slate-500 transition hover:bg-[#eef3ff] hover:text-[#4663ff] ${box} ${className}`}
    >
      <Icon size={icon} />
    </button>
  );
};

export default BackButton;
