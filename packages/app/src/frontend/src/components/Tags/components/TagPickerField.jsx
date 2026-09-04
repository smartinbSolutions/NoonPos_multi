// packages/app/src/renderer/components/tags/TagPickerField.jsx

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X, Search, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

const inputClass =
  "h-9 w-full rounded-xl border border-[#e1e7fb] bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-350 focus:border-[#4663ff] focus:ring-[3px] focus:ring-[#4663ff]/12";

export default function TagPickerField({
  scope,
  entityType,
  entityId,
  selectedIds,
  onChange,
  skipInitialFetch = false,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [availableTags, setAvailableTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuRect, setMenuRect] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);

    const listRes = await window.api.listTags(scope);
    if (listRes.success) setAvailableTags(listRes.data);

    // Only re-fetch and overwrite the current selection when the caller
    // hasn't already loaded it themselves. Callers that pre-load tags
    // (e.g. a hook that fetches entity tags as part of its own load())
    // pass skipInitialFetch to avoid this component silently clobbering
    // selectedIds with a redundant, possibly-racy fetch of its own.
    if (entityId && !skipInitialFetch) {
      const entityRes = await window.api.getEntityTags(entityType, entityId);
      if (entityRes.success) onChange(entityRes.data.map((t) => t.id));
    }

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, entityType, entityId, skipInitialFetch]);

  useEffect(() => {
    load();
  }, [load]);

  function openMenu() {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuRect({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event) {
      if (
        triggerRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
      setQuery("");
    }

    function handleReposition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setMenuRect({
          top: rect.bottom + 6,
          left: rect.left,
          width: rect.width,
        });
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open]);

  function toggle(tagId) {
    if (disabled) return;
    onChange(
      selectedIds.includes(tagId)
        ? selectedIds.filter((id) => id !== tagId)
        : [...selectedIds, tagId],
    );
  }

  function remove(tagId, event) {
    if (disabled) return;
    event.stopPropagation();
    onChange(selectedIds.filter((id) => id !== tagId));
  }

  const selectedTags = availableTags.filter((t) => selectedIds.includes(t.id));
  const filteredTags = availableTags.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={disabled}
        className={`${inputClass} flex h-auto min-h-9 items-center justify-between gap-2 py-2 text-left ${
          disabled
            ? "cursor-not-allowed bg-slate-50 text-slate-400"
            : "cursor-pointer"
        }`}
      >
        <div className="flex flex-1 flex-wrap gap-1.5">
          {loading ? (
            <span className="text-slate-400">...</span>
          ) : selectedTags.length === 0 ? (
            <span className="font-medium text-slate-350">
              {t("screens.tags.selectTags")}
            </span>
          ) : (
            selectedTags.map((tag) => (
              <span
                key={tag.id}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white"
                style={{ backgroundColor: tag.color || "#4663ff" }}
              >
                {tag.name}
                {!disabled && (
                  <X
                    size={11}
                    onClick={(e) => remove(tag.id, e)}
                    className="cursor-pointer opacity-80 hover:opacity-100"
                  />
                )}
              </span>
            ))
          )}
        </div>
        {!disabled && (
          <ChevronDown size={15} className="shrink-0 text-slate-400" />
        )}
      </button>

      {open &&
        menuRect &&
        !disabled &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-xl border border-[#e1e7fb] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
              <Search size={14} className="shrink-0 text-slate-350" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("screens.tags.searchTags")}
                className="w-full text-sm font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-350"
              />
            </div>

            <div className="max-h-60 overflow-y-auto p-3">
              {filteredTags.length === 0 ? (
                <p className="px-1 py-2 text-xs font-semibold text-slate-400">
                  {t("screens.tags.noTagsFound")}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {filteredTags.map((tag) => {
                    const isSelected = selectedIds.includes(tag.id);
                    return (
                      <button
                        type="button"
                        key={tag.id}
                        onClick={() => toggle(tag.id)}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                          isSelected
                            ? "text-white"
                            : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                        }`}
                        style={
                          isSelected
                            ? { backgroundColor: tag.color || "#4663ff" }
                            : undefined
                        }
                      >
                        {isSelected && <Check size={12} />}
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
