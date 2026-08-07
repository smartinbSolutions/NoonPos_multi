import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";

import {
  Home,
  Package,
  ShoppingCart,
  CreditCard,
  Landmark,
  Factory,
  Users,
  Boxes,
  Building2,
  Layers,
  ChevronDown,
  Settings,
  Handshake,
  Zap,
  LogOut,
  User as UserIcon,
  Coins,
  ReceiptIcon,
} from "lucide-react";

import LanguageSwitcher from "./LanguageSwitcher";
import { useAuth } from "../Global/AuthContext";

export default function Sidebar() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const location = useLocation();
  const { user, logout } = useAuth();

  const isPos = location.pathname.startsWith("/pos");

  const [open, setOpen] = useState({});

  const menu = [
    {
      title: "navigation.dashboard",
      icon: <Home size={18} />,
      path: "/",
    },
    {
      title: "navigation.sales",
      icon: <ShoppingCart size={18} />,
      children: [
        { title: "navigation.sales", path: "/sales" },
        { title: "navigation.salesQuotations", path: "/sales-quotations" },
        { title: "navigation.salesReturn", path: "/sales-return" },
        { title: "navigation.customers", path: "/customer" },
      ],
    },
    {
      title: "navigation.purchase",
      icon: <CreditCard size={18} />,
      children: [
        { title: "navigation.purchase", path: "/purchase" },
        { title: "navigation.purchaseReturn", path: "/purchase-return" },
        { title: "navigation.suppliers", path: "/supplier" },
      ],
    },
    {
      title: "navigation.expense",
      icon: <Coins size={18} />,
      children: [
        { title: "navigation.expense", path: "/expense" },
        { title: "navigation.expensesCategory", path: "/expense-category" },
      ],
    },
    {
      title: "navigation.cash",
      icon: <Landmark size={18} />,
      children: [
        { title: "navigation.funds", path: "/funds" },
        { title: "navigation.payment", path: "/payments" },
        { title: "navigation.transfers", path: "/fundTransfer" },
      ],
    },
    {
      title: "navigation.stock",
      icon: <Package size={18} />,
      children: [
        { title: "navigation.products", path: "/products" },
        { title: "navigation.importReports", path: "/import-reports" },
      ],
    },
    {
      title: "navigation.partners",
      icon: <Handshake size={18} />,
      path: "/partners",
    },
    {
      title: "navigation.reports",
      icon: <ReceiptIcon size={18} />,
      children: [
        { title: "navigation.profitLoss", path: "/reports/profit-loss" },
        { title: "navigation.salesReport", path: "/reports/sales" },
      ],
    },
    {
      title: "navigation.settings",
      icon: <Settings size={18} />,
      children: [
        { title: "navigation.units", path: "/unit" },
        { title: "navigation.currency", path: "/currency" },
        { title: "navigation.taxes", path: "/tax" },
        ...(user?.role === "admin"
          ? [{ title: "navigation.users", path: "/users" }]
          : []),
        { title: "navigation.companySettings", path: "/company-info" },
        { title: "navigation.settings", path: "/company-settings" },
      ],
    },
  ];

  useEffect(() => {
    const newOpen = {};

    menu.forEach((item, index) => {
      if (!item.children) return;

      const match = item.children.some((c) =>
        location.pathname.startsWith(c.path)
      );

      if (match) newOpen[index] = true;
    });

    setOpen((prev) => ({ ...prev, ...newOpen }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.role]);

  function toggleGroup(index) {
    setOpen((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  }

  if (isPos) {
    return (
      <div className="fixed top-4 left-4 z-50">
        <NavLink
          to="/"
          className="inline-flex items-center gap-2 rounded-2xl bg-[#4663ff] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_32px_rgba(70,99,255,0.35)] transition hover:brightness-110"
        >
          ← {t("navigation.dashboard")}
        </NavLink>
      </div>
    );
  }

  function SidebarSubItem({ to, title }) {
    return (
      <NavLink
        to={to}
        className={({ isActive }) =>
          `relative flex items-center rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
            isActive
              ? "bg-[#4663ff]/15 text-[#8fa5ff]"
              : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
          }`
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[#4663ff]" />
            )}
            <span className={isActive ? "ml-2" : ""}>{t(title)}</span>
          </>
        )}
      </NavLink>
    );
  }

  function SidebarGroupTitle({ icon, title, index, active }) {
    return (
      <button
        onClick={() => toggleGroup(index)}
        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold transition ${
          active
            ? "text-slate-100"
            : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
              active
                ? "bg-[#4663ff]/20 text-[#8fa5ff]"
                : "bg-white/[0.04] text-slate-400"
            }`}
          >
            {icon}
          </span>
          <span>{t(title)}</span>
        </div>

        <ChevronDown
          size={15}
          className={`text-slate-500 transition-transform ${
            open[index] ? "rotate-180" : ""
          }`}
        />
      </button>
    );
  }

  return (
    <div
      className={`fixed ${
        isRtl ? "right-0 border-l" : "left-0 border-r"
      } top-0 flex h-screen w-64 flex-col border-white/5 bg-[linear-gradient(180deg,#0b1220_0%,#0d1526_60%,#0b1220_100%)] text-white`}
      style={{ zIndex: "1000" }}
    >
      {/* BRAND */}
      <div className="border-b border-white/5 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#4663ff] shadow-[0_8px_24px_rgba(70,99,255,0.35)]">
            <Layers size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-black leading-tight">
              {t("app.name")}
            </h1>
            <p className="text-[11px] font-semibold uppercase  text-slate-500">
              {t("app.tagline")}
            </p>
          </div>
        </div>
      </div>

      {/* POS QUICK ACCESS */}
      <div className="px-3 pt-4">
        <NavLink
          to="/pos"
          className="group relative flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-[#4663ff] to-[#5b7bff] px-4 py-3 text-sm font-black text-white shadow-[0_12px_32px_rgba(70,99,255,0.3)] transition hover:shadow-[0_16px_40px_rgba(70,99,255,0.4)]"
        >
          <span className="absolute inset-0 -translate-x-full bg-white/10 transition-transform duration-500 group-hover:translate-x-0" />
          <Zap size={18} className="relative fill-white" />
          <span className="relative">{t("navigation.posSystem")}</span>
        </NavLink>
      </div>

      {/* NAV */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {menu.map((item, index) => {
          const hasChildren = item.children && item.children.length > 0;

          if (!hasChildren) {
            return (
              <NavLink
                key={index}
                to={item.path}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                    isActive
                      ? "text-slate-100"
                      : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[#4663ff]" />
                    )}
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                        isActive
                          ? "bg-[#4663ff]/20 text-[#8fa5ff]"
                          : "bg-white/[0.04] text-slate-400"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span>{t(item.title)}</span>
                  </>
                )}
              </NavLink>
            );
          }

          const isActiveGroup = item.children.some((c) =>
            location.pathname.startsWith(c.path)
          );

          return (
            <div key={index}>
              <SidebarGroupTitle
                icon={item.icon}
                title={item.title}
                index={index}
                active={isActiveGroup}
              />

              {open[index] && (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-white/[0.06] pl-3">
                  {item.children.map((child) => (
                    <SidebarSubItem
                      key={child.path}
                      to={child.path}
                      title={child.title}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* FOOTER */}
      <div className="border-t border-white/5 p-4">
        <div className="mb-3 flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2.5">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4663ff]/20 text-[#8fa5ff]">
              <UserIcon size={15} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-100">
                {user?.full_name || user?.username}
              </p>
              <p className="text-[11px] font-semibold uppercase  text-slate-500">
                {t(`screens.users.role_${user?.role}`)}
              </p>
            </div>
          </div>

          <button
            onClick={logout}
            title={t("navigation.logout")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut size={15} />
          </button>
        </div>

        <LanguageSwitcher />
      </div>
    </div>
  );
}
