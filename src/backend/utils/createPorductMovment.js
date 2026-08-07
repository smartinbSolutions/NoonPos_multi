const VALID_REFERENCE_TYPES = [
  "purchase",
  "purchase_return",
  "sale",
  "sale_return",
  "initial",
  "import",
  "adjustment",
];

const VALID_TYPES = ["in", "out"];

// Builds "YYYY-MM-DD HH:MM:SS" — matches the app-wide date storage convention
// so string-comparison ordering in CTEs/window functions works correctly.
// Callers are expected to always pass `date`; the `now`-based date fallback
// here is purely a safeguard for the unexpected case where it's missing.
function buildMovementDateTime(callerDate) {
  const now = new Date();
  const time = now.toTimeString().slice(0, 8);

  const dateOnly = callerDate
    ? String(callerDate).slice(0, 10)
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return `${dateOnly} ${time}`;
}

export default function createProductMovement(db, data) {
  if (!data.product_id) {
    throw new Error("createProductMovement: product_id is required");
  }

  if (!VALID_REFERENCE_TYPES.includes(data.reference_type)) {
    throw new Error(
      `createProductMovement: invalid reference_type "${data.reference_type}". ` +
        `Must be one of: ${VALID_REFERENCE_TYPES.join(", ")}`
    );
  }

  if (!VALID_TYPES.includes(data.type)) {
    throw new Error(
      `createProductMovement: invalid type "${data.type}". Must be one of: ${VALID_TYPES.join(", ")}`
    );
  }

  if (!data.action || typeof data.action !== "string") {
    throw new Error("createProductMovement: action is required");
  }

  const stmt = db.prepare(`
    INSERT INTO product_movements (
      product_id,
      reference_id,
      reference_type,
      type,
      action,
      enterPrice,
      outPrice,
      date,
      quantity,
      base_unit_name,
      unit_name,
      conversion_factor
    )
    VALUES (
      @product_id,
      @reference_id,
      @reference_type,
      @type,
      @action,
      @enterPrice,
      @outPrice,
      @date,
      @quantity,
      @base_unit_name,
      @unit_name,
      @conversion_factor
    )
  `);

  return stmt.run({
    product_id: data.product_id,
    reference_id: data.reference_id ?? null,
    reference_type: data.reference_type,
    type: data.type,
    action: data.action,
    date: buildMovementDateTime(data.date),
    enterPrice: Number(data.enterPrice || 0),
    outPrice: Number(data.outPrice || 0),
    quantity: Number(data.quantity || 0),
    // Plain snapshot fields — no FK, no live join back to product_units.
    // Nullable because not every caller necessarily knows which unit was
    // involved (older/other callers may still omit these), but every
    // caller added so far (create-product, update-product) always passes
    // both names and a factor.
    base_unit_name: data.base_unit_name ?? null,
    unit_name: data.unit_name ?? null,
    conversion_factor: data.conversion_factor ?? 1,
  });
}
