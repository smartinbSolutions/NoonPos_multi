// packages/app/src/backend/tags.ipc.js
import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";

const ENTITY_TYPES = [
  "product",
  "customer",
  "supplier",
  "partner",
  "sales_invoice",
  "sales_return",
  "sales_quotation",
  "purchase_invoice",
  "purchase_return",
  "expense",
  "payment",
];

function isValidScope(scope) {
  return scope === null || scope === undefined || ENTITY_TYPES.includes(scope);
}

const TAG_COLUMNS = `id, name, latin_name AS "latinName", color, scope, created_at::text AS "createdAt"`;

export default function registerTagsIPC() {
  // ---- CREATE ----
  ipcMain.handle(
    "create-tag",
    async (event, { name, latinName, color, scope }) => {
      try {
        if (!name || !name.trim()) {
          return { success: false, error: "TAG_NAME_REQUIRED" };
        }
        if (!isValidScope(scope)) {
          return { success: false, error: "INVALID_TAG_SCOPE" };
        }

        const normalizedScope = scope || null;

        const { rows: existingRows } = await query(
          `SELECT id FROM tags WHERE name = $1 AND scope IS NOT DISTINCT FROM $2`,
          [name.trim(), normalizedScope],
        );
        if (existingRows[0]) {
          return { success: false, error: "TAG_NAME_ALREADY_EXISTS" };
        }

        const { rows } = await query(
          `INSERT INTO tags (name, latin_name, color, scope)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [name.trim(), latinName || null, color || null, normalizedScope],
        );

        return { success: true, data: { id: rows[0].id } };
      } catch (err) {
        console.error(err);
        return { success: false, error: "TAG_CREATE_FAILED" };
      }
    },
  );

  // ---- LIST ----
  ipcMain.handle("list-tags", async (event, { scope } = {}) => {
    try {
      let rows;
      if (scope) {
        ({ rows } = await query(
          `SELECT ${TAG_COLUMNS} FROM tags WHERE scope = $1 OR scope IS NULL ORDER BY name`,
          [scope],
        ));
      } else {
        ({ rows } = await query(
          `SELECT ${TAG_COLUMNS} FROM tags ORDER BY name`,
        ));
      }
      return { success: true, data: rows };
    } catch (err) {
      console.error(err);
      return { success: false, error: "TAG_LIST_FAILED" };
    }
  });

  // ---- UPDATE ----
  ipcMain.handle(
    "update-tag",
    async (event, { id, name, latinName, color, scope, force }) => {
      try {
        const { rows: tagRows } = await query(
          `SELECT ${TAG_COLUMNS} FROM tags WHERE id = $1`,
          [id],
        );
        const tag = tagRows[0];
        if (!tag) {
          return { success: false, error: "TAG_NOT_FOUND" };
        }
        if (!isValidScope(scope)) {
          return { success: false, error: "INVALID_TAG_SCOPE" };
        }

        const normalizedScope = scope === undefined ? tag.scope : scope || null;
        const scopeChanged = normalizedScope !== tag.scope;

        if (scopeChanged && !force) {
          const { rows: mismatched } = await query(
            `SELECT entity_type, COUNT(*) AS count
             FROM taggables
             WHERE tag_id = $1 AND entity_type != $2
             GROUP BY entity_type`,
            [id, normalizedScope || ""],
          );

          if (mismatched.length > 0) {
            return {
              success: false,
              error: "TAG_SCOPE_MISMATCH_NEEDS_CONFIRMATION",
              data: {
                mismatched: mismatched.map((m) => ({
                  ...m,
                  count: Number(m.count),
                })),
              },
            };
          }
        }

        if (name !== undefined) {
          const { rows: dupRows } = await query(
            `SELECT id FROM tags WHERE name = $1 AND scope IS NOT DISTINCT FROM $2 AND id != $3`,
            [name.trim(), normalizedScope, id],
          );
          if (dupRows[0]) {
            return { success: false, error: "TAG_NAME_ALREADY_EXISTS" };
          }
        }

        await query(
          `UPDATE tags SET name = $1, latin_name = $2, color = $3, scope = $4 WHERE id = $5`,
          [
            name !== undefined ? name.trim() : tag.name,
            latinName !== undefined ? latinName : tag.latinName,
            color !== undefined ? color : tag.color,
            normalizedScope,
            id,
          ],
        );

        return { success: true };
      } catch (err) {
        console.error(err);
        return { success: false, error: "TAG_UPDATE_FAILED" };
      }
    },
  );

  // ---- DELETE ----
  ipcMain.handle("delete-tag", async (event, { id, force }) => {
    try {
      const { rows: tagRows } = await query(
        `SELECT id FROM tags WHERE id = $1`,
        [id],
      );
      if (!tagRows[0]) {
        return { success: false, error: "TAG_NOT_FOUND" };
      }

      const { rows: countRows } = await query(
        `SELECT COUNT(*) AS count FROM taggables WHERE tag_id = $1`,
        [id],
      );
      const count = Number(countRows[0].count);

      if (count > 0 && !force) {
        return {
          success: false,
          error: "TAG_IN_USE_NEEDS_CONFIRMATION",
          data: { count },
        };
      }

      await query(`DELETE FROM tags WHERE id = $1`, [id]); // cascades to taggables
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: "TAG_DELETE_FAILED" };
    }
  });

  // ---- GET TAGS FOR ENTITY ----
  ipcMain.handle("get-entity-tags", async (event, { entityType, entityId }) => {
    try {
      const { rows } = await query(
        `SELECT t.id, t.name, t.latin_name AS "latinName", t.color, t.scope, t.created_at::text AS "createdAt"
           FROM tags t
           JOIN taggables tg ON tg.tag_id = t.id
           WHERE tg.entity_type = $1 AND tg.entity_id = $2
           ORDER BY t.name`,
        [entityType, entityId],
      );
      return { success: true, data: rows };
    } catch (err) {
      console.error(err);
      return { success: false, error: "ENTITY_TAGS_LIST_FAILED" };
    }
  });

  // ---- SET TAGS FOR ENTITY (replace-all, on save) ----
  ipcMain.handle(
    "set-entity-tags",
    async (event, { entityType, entityId, tagIds }) => {
      if (!ENTITY_TYPES.includes(entityType)) {
        return { success: false, error: "INVALID_TAG_SCOPE" };
      }

      const ids = Array.isArray(tagIds) ? [...new Set(tagIds)] : [];

      const client = await getClient();
      try {
        await client.query("BEGIN");
        const q = client.query.bind(client);

        // Validate every tag either matches this entity_type or is global
        if (ids.length > 0) {
          const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
          const { rows: validTags } = await q(
            `SELECT id FROM tags
             WHERE id IN (${placeholders})
             AND (scope = $${ids.length + 1} OR scope IS NULL)`,
            [...ids, entityType],
          );

          if (validTags.length !== ids.length) {
            throw new Error("TAG_SCOPE_NOT_ALLOWED");
          }
        }

        await q(
          `DELETE FROM taggables WHERE entity_type = $1 AND entity_id = $2`,
          [entityType, entityId],
        );

        for (const tagId of ids) {
          await q(
            `INSERT INTO taggables (tag_id, entity_type, entity_id) VALUES ($1, $2, $3)`,
            [tagId, entityType, entityId],
          );
        }

        await client.query("COMMIT");
        return { success: true };
      } catch (err) {
        await client.query("ROLLBACK");
        if (err.message === "TAG_SCOPE_NOT_ALLOWED") {
          return { success: false, error: "TAG_SCOPE_NOT_ALLOWED" };
        }
        console.error(err);
        return { success: false, error: "SET_ENTITY_TAGS_FAILED" };
      } finally {
        client.release();
      }
    },
  );

  // ---- GET TAGS FOR MULTIPLE ENTITIES (batch, for list views) ----
  ipcMain.handle(
    "get-entities-tags",
    async (event, { entityType, entityIds }) => {
      try {
        if (!Array.isArray(entityIds) || entityIds.length === 0) {
          return { success: true, data: {} };
        }

        const placeholders = entityIds.map((_, i) => `$${i + 2}`).join(",");
        const { rows } = await query(
          `SELECT tg.entity_id, t.id, t.name, t.latin_name AS "latinName", t.color, t.scope
           FROM taggables tg
           JOIN tags t ON t.id = tg.tag_id
           WHERE tg.entity_type = $1 AND tg.entity_id IN (${placeholders})
           ORDER BY t.name`,
          [entityType, ...entityIds],
        );

        const grouped = {};
        for (const row of rows) {
          if (!grouped[row.entity_id]) grouped[row.entity_id] = [];
          grouped[row.entity_id].push({
            id: row.id,
            name: row.name,
            latinName: row.latinName,
            color: row.color,
            scope: row.scope,
          });
        }

        return { success: true, data: grouped };
      } catch (err) {
        console.error(err);
        return { success: false, error: "ENTITY_TAGS_LIST_FAILED" };
      }
    },
  );
}
