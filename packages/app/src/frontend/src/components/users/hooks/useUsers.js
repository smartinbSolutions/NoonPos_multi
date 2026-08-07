import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const useUsers = () => {
  const { t } = useTranslation();
  const api = window.api;

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = create mode

  // Maps backend error codes (e.g. "USERNAME_TAKEN") to translated messages.
  // Falls back to the code itself if somehow unmapped, so nothing silently
  // disappears — but every code returned by authIpc.js should have an entry.
  const translateError = useCallback(
    (code, fallback) => {
      const map = {
        INVALID_PIN: t("errors.invalidPin"),
        PIN_INVALID_LENGTH: t("errors.pinInvalidLength"),
        USERNAME_TAKEN: t("errors.usernameTaken"),
        PIN_ALREADY_IN_USE: t("errors.pinAlreadyInUse"),
        USER_NOT_FOUND: t("errors.userNotFound"),
        USE_RESET_PIN_FLOW: t("errors.useResetPinFlow"),
        LAST_ADMIN_MUST_REMAIN: t("errors.lastAdminMustRemain"),
        ADMIN_AUTH_FAILED: t("errors.adminAuthFailed"),
        RECOVERY_FAILED: t("errors.recoveryFailed"),
        DEACTIVATE_BEFORE_DELETE: t("errors.deactivateBeforeDelete"),
      };
      return map[code] || fallback || code;
    },
    [t]
  );

  const refetch = useCallback(async () => {
    if (!api) {
      setError(t("errors.apiUnavailable"));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await api.getUsers();
      if (res?.success) {
        setUsers(res.users || []);
      } else {
        setError(
          translateError(
            res?.error,
            t("errors.loadFailed", { field: t("ui.users") })
          )
        );
      }
    } catch (err) {
      console.error("Failed to load users:", err);
      setError(
        err?.message || t("errors.loadFailed", { field: t("ui.users") })
      );
    } finally {
      setLoading(false);
    }
  }, [api, t, translateError]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const activeAdminCount = users.filter(
    (u) => u.role === "admin" && u.is_active
  ).length;

  const openCreateModal = () => {
    setEditingUser(null);
    setActionError("");
    setModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setActionError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingUser(null);
    setActionError("");
  };

  const submitUser = async (formData) => {
    setSaving(true);
    try {
      let res;
      if (editingUser) {
        const payload = { id: editingUser.id, ...formData };
        if (!payload.pin) delete payload.pin; // keep existing PIN if left blank
        res = await api.updateUser(payload);
      } else {
        res = await api.createUser(formData);
      }

      if (res?.success) {
        setActionError("");
        await refetch();
        closeModal();
        return true;
      }

      setActionError(
        translateError(
          res?.error,
          t("errors.saveFailed", { field: t("ui.user") })
        )
      );
      return false;
    } catch (err) {
      console.error("Failed to save user:", err);
      setActionError(
        err?.message || t("errors.saveFailed", { field: t("ui.user") })
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deactivateUser = async (user) => {
    if (user.role === "admin" && user.is_active && activeAdminCount <= 1) {
      setActionError(t("errors.lastAdmin"));
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateUser({ id: user.id, is_active: 0 });
      if (res?.success) {
        setActionError("");
        await refetch();
      } else {
        setActionError(
          translateError(res?.error, t("errors.deactivateFailed"))
        );
      }
    } catch (err) {
      console.error("Failed to deactivate user:", err);
      setActionError(err?.message || t("errors.deactivateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const reactivateUser = async (user) => {
    setSaving(true);
    try {
      const res = await api.updateUser({ id: user.id, is_active: 1 });
      if (res?.success) {
        setActionError("");
        await refetch();
      } else {
        setActionError(
          translateError(
            res?.error,
            t("errors.updateFailed", { field: t("ui.user") })
          )
        );
      }
    } catch (err) {
      console.error("Failed to reactivate user:", err);
      setActionError(
        err?.message || t("errors.updateFailed", { field: t("ui.user") })
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user) => {
    setSaving(true);
    try {
      const res = await api.deleteUser(user.id);
      console.log(res);
      if (res?.success) {
        setActionError("");
        await refetch();
      } else {
        setActionError(
          translateError(
            res?.error,
            t("errors.deleteFailed", { field: t("ui.user") })
          )
        );
      }
    } catch (err) {
      console.error("Failed to delete user:", err);
      setActionError(
        err?.message || t("errors.deleteFailed", { field: t("ui.user") })
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    users,
    loading,
    saving,
    error,
    actionError,
    modalOpen,
    editingUser,
    openCreateModal,
    openEditModal,
    closeModal,
    submitUser,
    deactivateUser,
    reactivateUser,
    deleteUser,
    activeAdminCount,
  };
};

export default useUsers;
