import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Database, Server, CheckCircle2, XCircle } from "lucide-react";
import appLogo from "../../../assets/logo.png";

const CONNECTION_ERROR_KEYS = {
  DB_CONNECTION_REFUSED: "dbSetup.errors.connectionRefused",
  DB_HOST_UNREACHABLE: "dbSetup.errors.hostUnreachable",
  DB_CONNECTION_TIMEOUT: "dbSetup.errors.timeout",
  DB_AUTH_FAILED: "dbSetup.errors.authFailed",
  DB_DATABASE_NOT_FOUND: "dbSetup.errors.databaseNotFound",
  DB_CONNECTION_FAILED: "dbSetup.errors.connectionFailed",
};

function mapDbErrorCode(code, t) {
  if (!code) return null;
  const key = CONNECTION_ERROR_KEYS[code];
  return key ? t(key) : null;
}

const DEFAULT_FORM = {
  host: "",
  port: "5432",
  database: "noonpos",
  user: "noonpos_app",
  password: "",
};

export default function DbSetupPage({ onConnected }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testedOk, setTestedOk] = useState(false);

  const year = new Date().getFullYear();

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    // Any edit invalidates a previous successful test — force re-testing
    // before allowing save, since the values on screen no longer match
    // what was actually verified.
    setTestedOk(false);
    setMessage("");
  };

  const buildConfig = () => ({
    host: form.host.trim(),
    port: Number(form.port.trim()) || 5432,
    database: form.database.trim(),
    user: form.user.trim(),
    password: form.password.trim(),
  });

  const handleTest = async () => {
    setMessage("");
    setIsError(false);
    setIsTesting(true);
    setTestedOk(false);

    try {
      if (!window.db?.testConnection) {
        setMessage(t("dbSetup.desktopOnly"));
        setIsError(true);
        return;
      }
      console.log("Testing connection with config:", buildConfig());
      const result = await window.db.testConnection(buildConfig());

      if (!result?.success) {
        const translated = mapDbErrorCode(result?.error, t);
        setMessage(translated || t("dbSetup.errors.connectionFailed"));
        setIsError(true);
        return;
      }

      setMessage(t("dbSetup.testSuccess"));
      setIsError(false);
      setTestedOk(true);
    } catch (error) {
      setMessage(error.message || t("dbSetup.errors.connectionFailed"));
      setIsError(true);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setMessage("");
    setIsError(false);
    setIsSaving(true);

    try {
      if (!window.db?.saveConfig) {
        setMessage(t("dbSetup.desktopOnly"));
        setIsError(true);
        return;
      }

      const result = await window.db.saveConfig(buildConfig());

      if (!result?.success) {
        const translated = mapDbErrorCode(result?.error, t);
        setMessage(translated || t("dbSetup.errors.connectionFailed"));
        setIsError(true);
        setTestedOk(false);
        return;
      }

      onConnected?.();
    } catch (error) {
      setMessage(error.message || t("dbSetup.errors.connectionFailed"));
      setIsError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (testedOk) {
      handleSave();
    } else {
      handleTest();
    }
  };

  const isBusy = isTesting || isSaving;
  const canSubmit =
    form.host.trim() &&
    form.port.trim() &&
    form.database.trim() &&
    form.user.trim() &&
    form.password.trim() &&
    !isBusy;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f6fb] px-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 15% 15%, rgba(70,99,255,0.10), transparent 70%), radial-gradient(50% 45% at 90% 90%, rgba(38,54,148,0.07), transparent 70%)",
        }}
      />

      <div className="relative grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-[32px] border border-[#e9edfb] bg-white shadow-[0_40px_120px_rgba(38,54,148,0.12)] md:grid-cols-2">
        {/* Left — brand panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[#eef1ff] p-10 md:flex">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(70% 60% at 20% 20%, rgba(70,99,255,0.16), transparent 70%), radial-gradient(60% 50% at 90% 85%, rgba(38,54,148,0.10), transparent 70%)",
            }}
          />
          <div className="relative">
            <div className="mb-6 inline-flex rounded-2xl bg-white p-3 shadow-sm">
              <img
                src={appLogo}
                alt={t("app.name")}
                className="h-14 w-14 rounded-xl"
              />
            </div>
            <h1 className="text-3xl font-black leading-tight text-[#1c2340]">
              {t("dbSetup.brandTitle", "Connect to Your Database")}
            </h1>
            <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-slate-500">
              {t(
                "dbSetup.brandSubtitle",
                "Enter the connection details for the database host on your network."
              )}
            </p>
          </div>

          <div className="relative flex items-center gap-2 text-sm font-semibold text-[#4663ff]">
            <Server size={16} />
            {t(
              "dbSetup.brandHint",
              "Find these details in noonpos-connection.txt"
            )}
          </div>
        </div>

        {/* Right — content panel */}
        <div className="flex flex-col items-center justify-center p-8 sm:p-12">
          <div className="mb-6 flex flex-col items-center md:hidden">
            <div className="mb-3 rounded-2xl bg-[#eef1ff] p-3">
              <img
                src={appLogo}
                alt={t("app.name")}
                className="h-12 w-12 rounded-xl"
              />
            </div>
            <h1 className="text-xl font-black text-[#1c2340]">
              {t("dbSetup.brandTitle", "Connect to Your Database")}
            </h1>
          </div>

          <div className="mb-6 hidden text-center md:block">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
              {t(
                "dbSetup.enterDetails",
                "Enter your database connection details"
              )}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
            <FormField
              icon={<Server size={18} className="shrink-0 text-[#4663ff]" />}
              placeholder={t("dbSetup.hostPlaceholder", "Host / IP address")}
              value={form.host}
              onChange={handleChange("host")}
            />
            <FormField
              icon={<Database size={18} className="shrink-0 text-[#4663ff]" />}
              placeholder={t("dbSetup.portPlaceholder", "Port")}
              value={form.port}
              onChange={handleChange("port")}
              dir="ltr"
            />
            <FormField
              icon={<Database size={18} className="shrink-0 text-[#4663ff]" />}
              placeholder={t("dbSetup.databasePlaceholder", "Database name")}
              value={form.database}
              onChange={handleChange("database")}
            />
            <FormField
              icon={<Database size={18} className="shrink-0 text-[#4663ff]" />}
              placeholder={t("dbSetup.userPlaceholder", "Username")}
              value={form.user}
              onChange={handleChange("user")}
            />
            <FormField
              icon={<Database size={18} className="shrink-0 text-[#4663ff]" />}
              placeholder={t("dbSetup.passwordPlaceholder", "Password")}
              value={form.password}
              onChange={handleChange("password")}
              type="password"
            />

            {message ? (
              <p
                className={`flex items-center justify-center gap-1.5 text-center text-sm font-semibold ${
                  isError ? "text-red-500" : "text-[#4663ff]"
                }`}
              >
                {isError ? (
                  <XCircle size={15} className="shrink-0" />
                ) : (
                  <CheckCircle2 size={15} className="shrink-0" />
                )}
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-2xl bg-[#4663ff] px-4 py-3.5 font-bold text-white shadow-[0_12px_30px_rgba(70,99,255,0.35)] transition hover:bg-[#3854e8] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving
                ? t("dbSetup.saving", "Saving...")
                : isTesting
                  ? t("dbSetup.testing", "Testing connection...")
                  : testedOk
                    ? t("dbSetup.connectAndContinue", "Connect and continue")
                    : t("dbSetup.testConnection", "Test connection")}
            </button>
          </form>
        </div>
      </div>

      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-1 text-center text-sm">
        <span className="text-slate-500">
          {t("screens.login.poweredBy", "Powered by")}{" "}
          <span className="text-[#26348f]">SmartInb</span>
        </span>
        <span className="text-slate-500">
          © {year} ·{" "}
          <a
            href="https://smartinb.com"
            target="_blank"
            rel="noreferrer"
            className="text-[#4663ff] underline decoration-[#4663ff]/30 underline-offset-2 hover:text-[#3854e8] hover:decoration-[#3854e8]/50"
          >
            smartinb.com
          </a>
        </span>
      </div>
    </main>
  );
}

function FormField({ icon, dir, ...inputProps }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[#e9edfb] bg-[#f8faff] px-4 py-3">
      {icon}
      <input
        {...inputProps}
        dir={dir}
        className="w-full bg-transparent text-sm tracking-wide text-[#1c2340] outline-none placeholder:text-slate-400"
        autoComplete="off"
        spellCheck="false"
      />
    </div>
  );
}
