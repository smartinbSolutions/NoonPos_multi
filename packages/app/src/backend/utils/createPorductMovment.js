// packages/app/src/backend/utils/createPorductMovment.js
const VALID_REFERENCE_TYPES = [
  "purchase",
  "purchase_return",
  "sale",
  "sale_return",
  "initial",
  "import",
  "adjustment",
  "manufacturing",
];

const VALID_TYPES = ["in", "out"];

function buildMovementDateTime(callerDate) {
  const now = new Date();
  const time = now.toTimeString().slice(0, 8);

  const dateOnly = callerDate
    ? String(callerDate).slice(0, 10)
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return `${dateOnly} ${time}`;
}

export default async function createProductMovement(query, data) {
  if (!data.product_id) {
    throw new Error("createProductMovement: product_id is required");
  }

  if (!VALID_REFERENCE_TYPES.includes(data.reference_type)) {
    throw new Error(
      `createProductMovement: invalid reference_type "${data.reference_type}". ` +
        `Must be one of: ${VALID_REFERENCE_TYPES.join(", ")}`,
    );
  }

  if (!VALID_TYPES.includes(data.type)) {
    throw new Error(
      `createProductMovement: invalid type "${data.type}". Must be one of: ${VALID_TYPES.join(", ")}`,
    );
  }

  if (!data.action || typeof data.action !== "string") {
    throw new Error("createProductMovement: action is required");
  }

  const { rows } = await query(
    `INSERT INTO product_movements (
      product_id, reference_id, reference_type, type, action,
      enter_price, out_price, date, quantity,
      base_unit_name, unit_name, conversion_factor
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING id`,
    [
      data.product_id,
      data.reference_id ?? null,
      data.reference_type,
      data.type,
      data.action,
      Number(data.enterPrice || 0),
      Number(data.outPrice || 0),
      buildMovementDateTime(data.date),
      Number(data.quantity || 0),
      data.base_unit_name ?? null,
      data.unit_name ?? null,
      data.conversion_factor ?? 1,
    ],
  );

  return rows[0].id;
}
