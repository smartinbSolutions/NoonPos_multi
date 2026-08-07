import { useState } from "react";
import {
  AlertCircle,
  KeyRound,
  Pen,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserX,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import useUsers from "../hooks/useUsers";
import UserFormModal from "./UserFormModal";
import DeleteModal from "../../../Global/DeleteModel";
import ResetPinModal from "./ResetPinModal";
import { useAuth } from "../../../Global/AuthContext";
import RecoveryKeyModal from "../../Auth/component/RecoveryKeyModal";
import RegenerateRecoveryKeyModal from "./RegenerateRecoveryKeyModal";

const UsersList = () => {
  const { t } = useTranslation();
  const { user: administrator } = useAuth();
  const {
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
  } = useUsers();

  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);

  const pageClass =
    "min-h-screen bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_50%,#eefaf6_100%)] p-6 text-slate-900";
  const panelClass =
    "rounded-[28px] border border-white/80 bg-white/80 shadow-[0_24px_80px_rgba(70,99,255,0.12)] backdrop-blur";
  const primaryButtonClass =
    "flex items-center justify-center gap-2 rounded-xl bg-[#4663ff] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:opacity-50";

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <div className="max-w-6xl mx-auto">
        <div
          className={`${panelClass} mb-5 flex items-center justify-between p-6 `}
        >
          <div>
            <p className="mb-1 text-xs font-bold uppercase  text-[#4663ff] ">
              {t("ui.setup")}
            </p>
            <h2 className="text-2xl font-black text-slate-950">
              {t("screens.users.title")}
            </h2>
            <p className="text-sm text-slate-500">
              {t("screens.users.subtitle")}
            </p>
          </div>

          <button onClick={openCreateModal} className={primaryButtonClass}>
            <Plus size={16} />
            {t("screens.users.addButton")}
          </button>
        </div>

        {(error || actionError) && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} />
            {error || actionError}
          </div>
        )}

        <div className={`${panelClass} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5ebff] bg-[#f8faff] text-xs font-bold uppercase  text-slate-500">
                <th className="px-5 py-3 text-start">
                  {t("screens.users.username")}
                </th>
                <th className="px-5 py-3 text-start">
                  {t("screens.users.fullName")}
                </th>
                <th className="px-5 py-3 text-start">
                  {t("screens.users.role")}
                </th>
                <th className="px-5 py-3 text-start">
                  {t("screens.users.status")}
                </th>
                <th className="px-5 py-3 text-start">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-[#f0f3ff] last:border-0 hover:bg-[#f8faff]"
                >
                  <td className="px-5 py-3.5 text-start font-bold text-slate-900">
                    {user.username}
                  </td>
                  <td className="px-5 py-3.5 text-start text-slate-600">
                    {user.full_name || t("screens.users.notProvided")}
                  </td>
                  <td className="px-5 py-3.5 text-start">
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${
                        user.role === "admin"
                          ? "bg-[#eef3ff] text-[#4663ff]"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {user.role === "admin" && <ShieldCheck size={12} />}
                      {t(`screens.users.role_${user.role}`)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-start">
                    <span
                      className={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-bold ${
                        user.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {user.is_active
                        ? t("screens.users.active")
                        : t("screens.users.inactive")}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-start gap-1">
                      <button
                        title={t("common.edit")}
                        onClick={() => openEditModal(user)}
                        className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-[#eef3ff] hover:text-[#4663ff]"
                      >
                        <Pen size={16} />
                      </button>
                      <button
                        title={t("screens.users.resetPin")}
                        onClick={() => setResetTarget(user)}
                        className="rounded-xl px-3 py-1.5 text-[#4663ff] hover:bg-[#eef3ff]"
                      >
                        <KeyRound size={16} />
                      </button>

                      {user.is_active ? (
                        <button
                          title={t("screens.users.deactivate")}
                          onClick={() => setDeactivateTarget(user)}
                          className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
                        >
                          <UserX size={16} />
                        </button>
                      ) : (
                        <>
                          <button
                            title={t("screens.users.reactivate")}
                            onClick={() => reactivateUser(user)}
                            className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50"
                          >
                            <RotateCcw size={16} />
                          </button>
                          <button
                            title={t("common.delete")}
                            onClick={() => setDeleteTarget(user)}
                            className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <div className="mb-1 text-sm text-slate-400">
                      {t("screens.users.empty")}
                    </div>
                    <div className="text-xs text-slate-400">
                      {t("screens.users.emptyHint")}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <UserFormModal
          open={modalOpen}
          onClose={closeModal}
          onSubmit={submitUser}
          user={editingUser}
          saving={saving}
          actionError={actionError}
        />
        <ResetPinModal
          user={resetTarget}
          administratorId={administrator?.id}
          onClose={() => setResetTarget(null)}
          onSuccess={() => setResetTarget(null)}
        />

        <div className={`${panelClass} mt-5 p-5`}>
          <h3 className="font-black">{t("screens.recovery.keyManagement")}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {t("screens.recovery.keyManagementHint")}
          </p>
          <button
            className="mt-3 rounded-xl border border-[#4663ff] px-4 py-2 text-sm font-bold text-[#4663ff]"
            onClick={() => setRegenerateModalOpen(true)}
          >
            {t("screens.recovery.regenerate")}
          </button>
        </div>
        <RegenerateRecoveryKeyModal
          open={regenerateModalOpen}
          administratorId={administrator?.id}
          onClose={() => setRegenerateModalOpen(false)}
          onSuccess={(newRecoveryKey) => {
            setRegenerateModalOpen(false);
            setRecoveryKey(newRecoveryKey);
          }}
        />
        <RecoveryKeyModal
          recoveryKey={recoveryKey}
          onClose={() => setRecoveryKey("")}
        />

        <DeleteModal
          open={Boolean(deactivateTarget)}
          onClose={() => setDeactivateTarget(null)}
          onConfirm={async () => {
            await deactivateUser(deactivateTarget);
            setDeactivateTarget(null);
          }}
          title={t("screens.users.deactivateTitle")}
          message={t("screens.users.deactivateMessage", {
            name: deactivateTarget?.username,
          })}
          subTitle="screens.users.deactivate"
          btnTxt="screens.users.deactivate"
        />

        <DeleteModal
          open={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await deleteUser(deleteTarget);
            setDeleteTarget(null);
          }}
          title={t("screens.users.deleteTitle")}
          message={t("screens.users.deleteMessage", {
            name: deleteTarget?.username,
          })}
        />
      </div>
    </div>
  );
};

export default UsersList;
