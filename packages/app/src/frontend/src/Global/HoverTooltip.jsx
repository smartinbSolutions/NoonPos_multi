import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Portal-based tooltip — renders into document.body so it's never clipped by
// a parent's overflow-hidden/overflow-x-auto (e.g. table wrappers). Position
// is computed from the trigger's actual bounding box on hover, not CSS
// absolute positioning relative to a parent.
export default function HoverTooltip({
  trigger,
  content,
  placement = "bottom",
}) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const top = placement === "top" ? rect.top - 8 : rect.bottom + 8;
    const left = rect.left + rect.width / 2;

    setCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (visible) updatePosition();
  }, [visible]);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-block"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        {trigger}
      </span>

      {visible &&
        coords &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] w-52 -translate-x-1/2 rounded-xl border border-[#e5ebff] bg-white p-2.5 text-xs font-semibold text-slate-600 shadow-lg"
            style={{
              top: coords.top,
              left: coords.left,
              transform:
                placement === "top"
                  ? "translate(-50%, -100%)"
                  : "translate(-50%, 0)",
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
