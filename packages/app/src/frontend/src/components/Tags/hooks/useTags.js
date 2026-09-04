// packages/app/src/renderer/hooks/useTags.js

import { useState, useEffect, useCallback } from "react";

export function useTags() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTag, setEditingTag] = useState(null); // null=closed, {}=new, {...}=edit
  const [confirmState, setConfirmState] = useState(null); // { type: 'delete'|'scope', payload, info }

  const loadTags = useCallback(async () => {
    setLoading(true);
    const res = await window.api.listTags(null);
    if (res.success) setTags(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  function openCreate() {
    setEditingTag({});
  }

  function openEdit(tag) {
    setEditingTag(tag);
  }

  function closeForm() {
    setEditingTag(null);
  }

  async function saveTag(form) {
    if (editingTag?.id) {
      const res = await window.api.updateTag({ id: editingTag.id, ...form });
      if (
        !res.success &&
        res.error === "TAG_SCOPE_MISMATCH_NEEDS_CONFIRMATION"
      ) {
        setConfirmState({
          type: "scope",
          payload: { id: editingTag.id, ...form },
          info: res.data.mismatched,
        });
        return { success: false, pendingConfirm: true };
      }
      if (res.success) {
        setEditingTag(null);
        await loadTags();
      }
      return res;
    }

    const res = await window.api.createTag(form);
    if (res.success) {
      setEditingTag(null);
      await loadTags();
    }
    return res;
  }

  async function confirmScopeChange() {
    const res = await window.api.updateTag({
      ...confirmState.payload,
      force: true,
    });
    setConfirmState(null);
    if (res.success) {
      setEditingTag(null);
      await loadTags();
    }
    return res;
  }

  async function requestDelete(tag) {
    const res = await window.api.deleteTag(tag.id, false);
    if (!res.success && res.error === "TAG_IN_USE_NEEDS_CONFIRMATION") {
      setConfirmState({ type: "delete", payload: tag, info: res.data.count });
      return;
    }
    if (res.success) await loadTags();
  }

  async function confirmDelete() {
    const res = await window.api.deleteTag(confirmState.payload.id, true);
    setConfirmState(null);
    if (res.success) await loadTags();
  }

  function cancelConfirm() {
    setConfirmState(null);
  }

  return {
    tags,
    loading,
    editingTag,
    confirmState,
    openCreate,
    openEdit,
    closeForm,
    saveTag,
    confirmScopeChange,
    requestDelete,
    confirmDelete,
    cancelConfirm,
  };
}
