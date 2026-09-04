import { useState, useEffect, useCallback } from "react";

export function useEntityTags(entityType, entityId) {
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [allRes, entityRes] = await Promise.all([
      window.api.listTags(entityType),
      entityId
        ? window.api.getEntityTags(entityType, entityId)
        : Promise.resolve({ success: true, data: [] }),
    ]);

    if (allRes.success) setAvailableTags(allRes.data);
    if (entityRes.success) {
      setSelectedTagIds(entityRes.data.map((t) => t.id));
    }
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleTag(tagId) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  }

  async function save() {
    if (!entityId) return { success: false, error: "ENTITY_ID_REQUIRED" };
    setSaving(true);
    const res = await window.api.setEntityTags(
      entityType,
      entityId,
      selectedTagIds,
    );
    setSaving(false);
    return res;
  }

  return {
    availableTags,
    selectedTagIds,
    loading,
    saving,
    toggleTag,
    save,
    reload: load,
  };
}
