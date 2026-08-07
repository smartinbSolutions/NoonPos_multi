import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, KeyRound, Clock } from "lucide-react";
import appLogo from "../assets/logo.png";

const ACTIVATION_ERROR_KEYS = {
  license_expired: "activation.errors.licenseExpired",
  license_not_found: "activation.errors.licenseNotFound",
  device_limit_reached: "activation.errors.deviceLimitReached",
  invalid_license_key: "activation.errors.invalidLicenseKey",
  license_revoked: "activation.errors.licenseRevoked",
};

function mapActivationErrorCode(code, t) {
  if (!code) return null;
  const key = ACTIVATION_ERROR_KEYS[code];
  return key ? t(key) : null;
}

export default function ActivationPage({ onActivated, reason }) {
  const { t } = useTranslation();
  const [licenseKey, setLicenseKey] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const year = new Date().getFullYear();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    setIsActivating(true);

    try {
      if (!window.license?.activate) {
        setMessage(t("activation.desktopOnly"));
        setIsError(true);
        return;
      }

      const result = await window.license.activate(licenseKey);

      if (!result?.success) {
        const translated = mapActivationErrorCode(result?.message, t);
        setMessage(translated || result?.message || t("activation.failed"));
        setIsError(true);
        return;
      }

      setMessage(t("activation.success"));
      setIsError(false);
      onActivated?.(result.payload);
    } catch (error) {
      setMessage(error.message || t("activation.failed"));
      setIsError(true);
    } finally {
      setIsActivating(false);
    }
  };

  const Shell = ({ children }) => (
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
              {t("activation.brandTitle", "Activate SmartInb POS")}
            </h1>
            <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-slate-500">
              {t(
                "activation.brandSubtitle",
                "One-time activation ties this installation to your device."
              )}
            </p>
          </div>

          <div className="relative flex items-center gap-2 text-sm font-semibold text-[#4663ff]">
            <ShieldCheck size={16} />
            {t("activation.brandHint", "Secured and verified per device")}
          </div>
        </div>

        {/* Right — content panel */}
        <div className="flex flex-col items-center justify-center p-8 sm:p-12">
          {/* Mobile-only compact header */}
          <div className="mb-6 flex flex-col items-center md:hidden">
            <div className="mb-3 rounded-2xl bg-[#eef1ff] p-3">
              <img
                src={appLogo}
                alt={t("app.name")}
                className="h-12 w-12 rounded-xl"
              />
            </div>
            <h1 className="text-xl font-black text-[#1c2340]">
              {t("activation.brandTitle", "Activate SmartInb POS")}
            </h1>
          </div>

          {children}
        </div>
      </div>

      {/* Firm attribution */}
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

  // Clock tampering isn't fixable by entering a license key — show a
  // dedicated message instead of the form.
  if (reason === "clock_tampered") {
    return (
      <Shell>
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
            <Clock size={28} className="text-amber-500" />
          </div>
          <h2 className="text-xl font-black text-[#1c2340]">
            {t("activation.clockTamperedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            {t("activation.clockTamperedDescription")}
          </p>
          <p className="mt-4 text-xs text-slate-400">
            {t("activation.clockTamperedHint")}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 hidden text-center md:block">
        <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
          {t("activation.enterKey", "Enter your license key")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-[#e9edfb] bg-[#f8faff] px-4 py-3">
          <KeyRound size={18} className="shrink-0 text-[#4663ff]" />
          <input
            id="license-key"
            value={licenseKey}
            onChange={(event) => setLicenseKey(event.target.value)}
            className="w-full bg-transparent  text-sm tracking-wide text-[#1c2340] outline-none placeholder:text-slate-400"
            placeholder={t("activation.licensePlaceholder")}
            autoComplete="off"
            spellCheck="false"
          />
        </div>

        {message ? (
          <p
            className={`mb-4 text-center text-sm font-semibold ${
              isError ? "text-red-500" : "text-[#4663ff]"
            }`}
          >
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isActivating || !licenseKey.trim()}
          className="w-full rounded-2xl bg-[#4663ff] px-4 py-3.5 font-bold text-white shadow-[0_12px_30px_rgba(70,99,255,0.35)] transition hover:bg-[#3854e8] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isActivating ? t("activation.activating") : t("activation.activate")}
        </button>
      </form>
    </Shell>
  );
}
