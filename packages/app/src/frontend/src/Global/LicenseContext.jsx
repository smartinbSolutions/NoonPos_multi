import { createContext, useContext, useMemo } from "react";

const LicenseContext = createContext(null);

// Deliberately doesn't call window.license.status() itself — App.jsx
// already does that once at startup to decide whether to show
// ActivationPage. This just re-exposes that same result to the rest of
// the tree, so there's one fetch, one source of truth, not two.
export function LicenseProvider({ licenseStatus, children }) {
  const value = useMemo(() => {
    const payload = licenseStatus?.valid ? licenseStatus.payload : null;
    return {
      payload,
      hasFeature: (featureName) =>
        Boolean(payload?.features?.includes(featureName)),
    };
  }, [licenseStatus]);

  return (
    <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>
  );
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense must be used within LicenseProvider");
  return ctx;
}
