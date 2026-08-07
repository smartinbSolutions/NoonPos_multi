import { useEffect, useState } from "react";
import { Delete, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../Global/AuthContext";
import appLogo from "../../../assets/logo.png";
import AdminRecoveryModal from "./AdminRecoveryModal";
import { normalizeDigits } from "../../../Global/FormatNumber";

const LoginScreen = () => {
  const { t } = useTranslation();
  const { login, error, loggingIn } = useAuth();
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  const submitPin = async (value) => {
    const ok = await login(value);
    if (!ok) {
      setShake(true);
      setTimeout(() => setShake(false), 450);
    }
    setPin("");
  };

  const pressDigit = (d) => {
    if (loggingIn || pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 6) submitPin(next);
  };

  const pressBackspace = () => {
    if (loggingIn) return;
    setPin((p) => p.slice(0, -1));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (loggingIn || recoveryOpen) return;

      const key = normalizeDigits(e.key);

      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        pressDigit(key);
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        pressBackspace();
        return;
      }

      if (e.key === "Enter" && pin.length === 6) {
        e.preventDefault();
        submitPin(pin);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, loggingIn]);

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const year = new Date().getFullYear();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f6fb] px-4">
      <style>{`
        @keyframes dotFill {
          0% { transform: scale(0.4); opacity: 0.4; }
          60% { transform: scale(1.25); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes panelShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(7px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(3px); }
        }
        .dot-fill { animation: dotFill 0.2s ease-out; }
        .panel-shake { animation: panelShake 0.45s ease-in-out; }
        @media (prefers-reduced-motion: reduce) {
          .dot-fill, .panel-shake { animation: none; }
        }
      `}</style>

      {/* Soft ambient backdrop — white base, blue accents only */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 15% 15%, rgba(70,99,255,0.10), transparent 70%), radial-gradient(50% 45% at 90% 90%, rgba(38,54,148,0.07), transparent 70%)",
        }}
      />

      <div
        className={`relative grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-[32px] border border-[#e9edfb] bg-white shadow-[0_40px_120px_rgba(38,54,148,0.12)] md:grid-cols-2 ${
          shake ? "panel-shake" : ""
        }`}
      >
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
              {t("screens.login.title")}
            </h1>
            <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-slate-500">
              {t("screens.login.subtitle")}
            </p>
          </div>

          <div className="relative flex items-center gap-2 text-sm font-semibold text-[#4663ff]">
            <ShieldCheck size={16} />
            {t("screens.login.hint")}
          </div>
        </div>

        {/* Right — keypad panel */}
        <div className="flex flex-col items-center justify-center p-8 sm:p-12">
          {/* Mobile-only compact header, since the brand panel is hidden below md */}
          <div className="mb-6 flex flex-col items-center md:hidden">
            <div className="mb-3 rounded-2xl bg-[#eef1ff] p-3">
              <img
                src={appLogo}
                alt={t("app.name")}
                className="h-12 w-12 rounded-xl"
              />
            </div>
            <h1 className="text-xl font-black text-[#1c2340]">
              {t("screens.login.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t("screens.login.subtitle")}
            </p>
          </div>

          <p className="mb-5 hidden text-sm font-bold uppercase tracking-wide text-slate-400 md:block">
            {t("screens.login.enterPin", "Enter your PIN")}
          </p>

          {/* PIN dots */}
          <div className="mb-7 flex justify-center">
            <div className="flex items-center gap-3.5 rounded-2xl border border-[#e9edfb] bg-[#f8faff] px-6 py-4">
              {Array.from({ length: 6 }).map((_, i) => {
                const filled = i < pin.length;
                return (
                  <span
                    key={i}
                    className={`block h-3 w-3 rounded-full transition-colors duration-150 ${
                      filled ? "dot-fill bg-[#4663ff]" : "bg-[#dbe4ff]"
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {error && (
            <p className="mb-4 text-center text-sm font-semibold text-red-500">
              {error}
            </p>
          )}

          <div className="grid grid-cols-3 gap-4">
            {digits.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => pressDigit(String(d))}
                disabled={loggingIn}
                className="mx-auto h-20 w-20 rounded-full border border-[#e9edfb] bg-white font-mono text-2xl tabular-nums text-[#1c2340] transition hover:border-[#4663ff]/40 hover:bg-[#f6f8fd] active:scale-95 disabled:opacity-40"
              >
                {d}
              </button>
            ))}
            <div />
            <button
              type="button"
              onClick={() => pressDigit("0")}
              disabled={loggingIn}
              className="mx-auto h-20 w-20 rounded-full border border-[#e9edfb] bg-white font-mono text-2xl tabular-nums text-[#1c2340] transition hover:border-[#4663ff]/40 hover:bg-[#f6f8fd] active:scale-95 disabled:opacity-40"
            >
              0
            </button>
            <button
              type="button"
              onClick={pressBackspace}
              disabled={loggingIn}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#e9edfb] bg-white text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 active:scale-95 disabled:opacity-40"
            >
              <Delete size={22} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setRecoveryOpen(true)}
            className="mt-8 text-center text-sm font-bold text-[#4663ff] transition hover:text-[#3854e8]"
          >
            {t("screens.login.forgotPin")}
          </button>
        </div>
      </div>

      {/* Firm attribution — bottom of screen, quiet and permanent */}
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-1 text-center text-sm">
        <span className="text-slate-500">
          {t("screens.login.poweredBy", "Powered by")}{" "}
          <span className=" text-[#26348f]">SmartInb</span>
        </span>
        <span className=" text-slate-500">
          © {year}·{" "}
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

      <AdminRecoveryModal
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
      />
    </main>
  );
};

export default LoginScreen;
