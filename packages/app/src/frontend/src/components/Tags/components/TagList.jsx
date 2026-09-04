// packages/app/src/renderer/components/tags/TagList.jsx

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tag, Plus } from "lucide-react";

/**
 * Read-only tag display for use in lists, tables, or detail cards.
 * Shows up to `limit` tags as pills, then a "+N" pill — hovering the "+N"
 * reveals the rest in a floating tooltip.
 *
 * Usage: <TagList tags={product.tags} limit={2} />
 */
export default function TagList({ tags = [], limit = 2 }) {
  const [hovered, setHovered] = useState(false);
  const [rect, setRect] = useState(null);
  const moreRef = useRef(null);

  if (!tags || tags.length === 0) return null;

  const visible = tags.slice(0, limit);
  const hidden = tags.slice(limit);

  function handleEnter() {
    const r = moreRef.current?.getBoundingClientRect();
    if (r) {
      setRect({ top: r.bottom + 6, left: r.left });
    }
    setHovered(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{
            backgroundColor: `${tag.color || "#4663ff"}14`,
            color: tag.color || "#4663ff",
          }}
        >
          <Tag size={11} className="shrink-0" />
          {tag.name}
        </span>
      ))}

      {hidden.length > 0 && (
        <span
          ref={moreRef}
          onMouseEnter={handleEnter}
          onMouseLeave={() => setHovered(false)}
          className="inline-flex cursor-default items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500"
        >
          <Plus size={10} />
          {hidden.length}
        </span>
      )}

      {hovered &&
        rect &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              zIndex: 9999,
            }}
            className="flex max-w-xs flex-wrap gap-1.5 rounded-xl border border-[#e1e7fb] bg-white p-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
          >
            {hidden.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  backgroundColor: `${tag.color || "#4663ff"}14`,
                  color: tag.color || "#4663ff",
                }}
              >
                <Tag size={11} className="shrink-0" />
                {tag.name}
              </span>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
