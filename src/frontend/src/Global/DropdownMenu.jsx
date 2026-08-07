import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Portal-based dropdown — renders into document.body so it's never clipped
// by a parent's overflow-hidden (item rows, panels, etc). Position is
// computed from the trigger's actual bounding box when opened, same
// approach as HoverTooltip.
export default function DropdownMenu({ trigger, options, align = "right" }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);

  const visibleOptions = options.filter((o) => o.visible !== false);

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const top = rect.bottom + 6;
    const left = align === "right" ? rect.right : rect.left;

    setCoords({ top, left, align });
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open]);

  if (visibleOptions.length === 0) return null;

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-block"
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </span>

      {open &&
        coords &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed z-[9999] min-w-[10rem] overflow-hidden rounded-xl border border-[#e9edfb] bg-white py-1 shadow-[0_10px_28px_rgba(15,23,42,0.14)]"
              style={{
                top: coords.top,
                left: coords.left,
                transform:
                  coords.align === "right" ? "translateX(-100%)" : "none",
              }}
            >
              {visibleOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    option.onClick();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-slate-600 transition hover:bg-[#f6f8fd] hover:text-[#4663ff]"
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
