import { createContext, useContext, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { t } = useTranslation();
  const [user, setUser] = useState(null); // null = not logged in
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const navigate = useNavigate();

  const login = useCallback(
    async (pin) => {
      setLoggingIn(true);
      setError("");
      try {
        const res = await window.api.login(pin);
        if (res?.success) {
          setUser(res.user);
          navigate(res.user.role === "pos" ? "/pos" : "/", { replace: true });
          return true;
        }
        setError(t("errors.invalidPin") || res?.error);
        return false;
      } catch (err) {
        setError(err?.message || String(err));
        return false;
      } finally {
        setLoggingIn(false);
      }
    },
    [navigate]
  );

  const logout = useCallback(() => {
    setUser(null);
    setError("");
    navigate("/", { replace: true });
  }, [navigate]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isAdmin: user?.role === "admin",
        login,
        logout,
        error,
        loggingIn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
