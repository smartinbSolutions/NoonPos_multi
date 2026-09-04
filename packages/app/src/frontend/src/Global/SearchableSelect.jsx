import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";

const SearchableSelect = ({
  label,
  labelWidth = "20",
  height = "2.75",
  placeholder,
  options,
  selectedValue,
  selectedLabel,
  onChange,
  onInputChange,
  disabled,
  error,
  getOptionLabel = (option) => option.name,
  disableTyping = false,
  onKeyDown,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const optionList = useMemo(
    () => (Array.isArray(options) ? options : options?.data || []),
    [options],
  );

  const [menuRect, setMenuRect] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 192,
  });

  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!rootRef.current) return;
      const clickedInsideRoot = rootRef.current.contains(event.target);
      const clickedInsideMenu = menuRef.current?.contains(event.target);
      if (!clickedInsideRoot && !clickedInsideMenu) setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [disableTyping]);

  const filteredOptions = useMemo(() => {
    const query = String(searchQuery || "").toLowerCase();
    return optionList.filter((option) =>
      String(getOptionLabel(option) || "")
        .toLowerCase()
        .includes(query),
    );
  }, [getOptionLabel, optionList, searchQuery]);

  useEffect(() => {
    if (isOpen) return;

    if (selectedLabel) {
      setSearchQuery(selectedLabel);
      return;
    }

    if (selectedValue && typeof selectedValue === "object") {
      setSearchQuery(getOptionLabel(selectedValue));
      return;
    }

    if (
      selectedValue !== "" &&
      selectedValue !== null &&
      selectedValue !== undefined
    ) {
      const selectedOption = optionList.find(
        (option) =>
          String(option.id) === String(selectedValue) ||
          String(option._id) === String(selectedValue),
      );
      setSearchQuery(selectedOption ? getOptionLabel(selectedOption) : "");
      return;
    }

    setSearchQuery("");
  }, [getOptionLabel, isOpen, optionList, selectedLabel, selectedValue]);

  const handleSelect = (option) => {
    onChange?.(option);
    setSearchQuery(getOptionLabel(option));
    setIsOpen(false);
  };

  const updateMenuPosition = () => {
    const el = inputRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const desiredMaxHeight = 192;
    const spaceBelow = viewportHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      120,
      Math.min(desiredMaxHeight, openUp ? spaceAbove : spaceBelow),
    );

    setMenuRect({
      left: rect.left,
      width: rect.width,
      top: openUp ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 6,
      maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
  }, [isOpen, searchQuery]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    window.addEventListener("scroll", onScrollOrResize, {
      passive: true,
      capture: true,
    });

    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, {
        capture: true,
      });
    };
  }, [isOpen]);

  // useEffect(() => {
  //   const handleClickOutside = (event) => {
  //     if (!rootRef.current) return;
  //     if (!rootRef.current.contains(event.target)) setIsOpen(false);
  //   };

  //   document.addEventListener("mousedown", handleClickOutside);
  //   return () => document.removeEventListener("mousedown", handleClickOutside);
  // }, []);

  return (
    <div className="relative w-full" ref={rootRef}>
      <div className="flex items-center">
        {label && (
          <span
            className="flex items-center rounded-l-2xl border border-r-0 border-slate-200 bg-slate-100 px-3 text-left text-sm font-bold text-slate-700"
            style={{
              width: `${labelWidth}%`,
              height: `${height}rem`,
              minHeight: 0,
            }}
          >
            {label}
          </span>
        )}

        <div className="relative" style={{ width: `${100 - labelWidth}%` }}>
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            readOnly={disableTyping}
            className={`w-full border bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 ${
              label ? "rounded-r-2xl" : "rounded-2xl"
            } ${error ? "border-red-300" : "border-slate-200"}`}
            style={{
              height: `${height}rem`,
              minHeight: 0,
            }}
            placeholder={placeholder}
            value={searchQuery}
            onChange={(event) => {
              if (disableTyping) return;
              setSearchQuery(event.target.value);
              setIsOpen(true);
              onInputChange?.(event.target.value);
            }}
            onFocus={() => {
              if (!disabled) setIsOpen(true);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>

      {isOpen &&
        !disabled &&
        createPortal(
          <div
            ref={menuRef}
            className="z-[9999] flex flex-col rounded-2xl border border-slate-200 bg-white py-2 shadow-xl"
            style={{
              position: "fixed",
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              maxHeight: menuRect.maxHeight,
              overflowY: "auto",
            }}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  type="button"
                  key={option.id || option._id}
                  className="cursor-pointer px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                  onClick={() => handleSelect(option)}
                >
                  {getOptionLabel(option)}
                </button>
              ))
            ) : (
              <div className="px-4 py-2 text-xs text-slate-500">
                {t("ui.noOptionsFound")}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};

export default SearchableSelect;
