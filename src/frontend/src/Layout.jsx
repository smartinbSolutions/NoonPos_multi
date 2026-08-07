import Sidebar from "./components/Sidebar";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";

export default function Layout() {
  const { i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";

  const location = useLocation();
  const isPos = location.pathname.startsWith("/pos");

  const [collapsed, setCollapsed] = useState(false);

  // POS mode → no sidebar
  if (isPos) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Outlet />
      </div>
    );
  }

  return (
    <div>
      <Sidebar onCollapseChange={setCollapsed} />

      <div
        className={`bg-gray-100 min-h-screen p-4 transition-all ${
          collapsed ? (isRtl ? "mr-16" : "ml-16") : isRtl ? "mr-64" : "ml-64"
        }`}
      >
        <Outlet />
      </div>
    </div>
  );
}
