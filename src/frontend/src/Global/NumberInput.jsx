import { normalizeDigits } from "./FormatNumber";

// Unified numeric input for the whole app. Handles Arabic-Indic digit
// normalization, safe in-progress decimal typing (doesn't collapse "5." or
// "0.5" mid-keystroke), and clamps/cleans the value only on blur — not on
// every keystroke, which is what caused the original decimal-typing bug.
//
// Props:
//   value        - current value (string or number, controlled)
//   onChange(val)- called with the new value (string while typing is normal —
//                  don't assume it's always a clean number until blur)
//   allowDecimal - true for prices/rates/anything fractional (default true)
//   min          - clamp floor on blur (default 0; pass null to disable)
//   max          - clamp ceiling on blur (default none)
//   ...rest      - spread onto the underlying <input> (className, placeholder, etc.)
export default function NumberInput({
  value,
  onChange,
  allowDecimal = true,
  min = 0,
  max = null,
  ...rest
}) {
  const pattern = allowDecimal ? /^\d*\.?\d*$/ : /^\d*$/;

  const handleChange = (e) => {
    const normalized = normalizeDigits(e.target.value);
    if (normalized === "" || pattern.test(normalized)) {
      onChange(normalized);
    }
  };

  const handleBlur = () => {
    if (value === "" || value === null || value === undefined) {
      onChange("");
      return;
    }
    let num = Number(value);
    if (isNaN(num)) {
      onChange("");
      return;
    }
    if (min !== null) num = Math.max(min, num);
    if (max !== null) num = Math.min(max, num);
    onChange(num);
  };

  return (
    <input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      dir="ltr"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      {...rest}
    />
  );
}
