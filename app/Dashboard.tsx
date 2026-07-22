"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./auth/AuthProvider";
import { useTranslation } from "./i18n/LanguageProvider";
import { OverviewPage } from "./pages/OverviewPage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { InvestmentsPage } from "./pages/InvestmentsPage";
import { SharedLoansPage } from "./pages/SharedLoansPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { AccountingPage } from "./pages/AccountingPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { LedgerPage } from "./pages/LedgerPage";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  CreditCard,
  DollarSign,
  BookOpen,
  FileText,
  BookMarked,
  Search,
  Bell,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useTranslation();

  const validTabs = ["Overview", "Providers", "Investments", "Shared Loans", "Expenses", "Accounting", "Invoices", "Ledger"];

  function getTabFromHash(): string {
    if (typeof window === "undefined") return "Overview";
    const hash = window.location.hash.slice(1).replace(/-/g, " ");
    const match = validTabs.find((t) => t.toLowerCase() === hash.toLowerCase());
    return match || "Overview";
  }

  const [tab, setTabState] = useState("Overview");

  useEffect(() => {
    setTabState(getTabFromHash());

    function onHashChange() {
      setTabState(getTabFromHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function setTab(key: string) {
    const hash = key.toLowerCase().replace(/ /g, "-");
    window.location.hash = hash;
    setTabState(key);
  }

  const displayName = user?.name || "there";
  const initials = user ? getInitials(user.name) : "??";
  const [dateStr, setDateStr] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setDateStr(new Date().toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" }));
  }, [lang]);

  const isPrivileged = user?.groups?.some(
    (g) => g === "Administrator" || g === "Overlord"
  ) ?? false;

  const allNavItems = [
    { key: "Overview", label: t("nav.overview"), icon: LayoutDashboard, public: true },
    { key: "Providers", label: t("nav.providers"), icon: Users, public: true },
    { key: "Investments", label: t("nav.investments"), icon: TrendingUp, public: false },
    { key: "Shared Loans", label: t("nav.sharedLoans"), icon: CreditCard, public: false },
    { key: "Expenses", label: t("nav.expenses"), icon: DollarSign, public: false },
    { key: "Accounting", label: t("nav.accounting"), icon: BookOpen, public: false },
    { key: "Invoices", label: t("nav.invoices"), icon: FileText, public: false },
    { key: "Ledger", label: t("nav.ledger"), icon: BookMarked, public: false },
  ];

  const navItems = allNavItems.filter((item) => item.public || isPrivileged);

  return (
    <main className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <div className="brand">
          <img src="/coral-icon.png" alt="Coral Reef and Beef" className="brand-mark" />
          {sidebarOpen && (
            <span className="brand-text">
              <span className="brand-coral">CORAL</span>
              <span className="brand-sub">REEF &amp; BEEF</span>
            </span>
          )}
        </div>
        <nav aria-label="Main navigation">
          <TooltipProvider>
            {navItems.map((item) => {
              const Icon = item.icon;
              const btn = (
                <button
                  key={item.key}
                  className={tab === item.key ? "nav-item active" : "nav-item"}
                  onClick={() => setTab(item.key)}
                  title={sidebarOpen ? undefined : item.label}
                >
                  <span className="nav-icon"><Icon size={18} /></span>
                  {sidebarOpen && item.label}
                </button>
              );
              if (!sidebarOpen) {
                return (
                  <Tooltip key={item.key}>
                    <TooltipTrigger render={btn} />
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }
              return btn;
            })}
          </TooltipProvider>
        </nav>
        <div className="side-footer">
          {sidebarOpen && (
            <>
              <div className="avatar">{initials}</div>
              <div>
                <strong>{displayName}</strong>
                <small>{user?.groups?.length ? user.groups.join(", ") : "Member"}</small>
              </div>
            </>
          )}
          <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sign out" className="ml-auto text-[#E48664] hover:text-[#E48664] hover:bg-[#E48664]/10">
            <LogOut size={18} />
          </Button>
        </div>
      </aside>

      <section className={`workspace ${sidebarOpen ? "" : "workspace-expanded"}`}>
        <header className="topbar">
          <div className="crumb">
            <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar" className="text-[var(--text-muted)] hover:text-[#3D4F9B]">
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </Button>
            <span>{dateStr}</span>
          </div>
          <div className="top-actions">
            <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
              <option value="en-US">🇺🇸 {t("lang.english")}</option>
              <option value="es-MX">🇲🇽 {t("lang.spanish")}</option>
            </select>
            <Button variant="ghost" size="icon" className="text-[#E48664]" aria-label="Search">
              <Search size={18} />
            </Button>
            <Button variant="ghost" size="icon" className="text-[#E48664] relative" aria-label="Notifications">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#E48664] rounded-full" />
            </Button>
          </div>
        </header>

        <div className="content">
          {tab === "Overview" && <OverviewPage />}
          {tab === "Providers" && <ProvidersPage />}
          {isPrivileged && tab === "Investments" && <InvestmentsPage />}
          {isPrivileged && tab === "Shared Loans" && <SharedLoansPage />}
          {isPrivileged && tab === "Expenses" && <ExpensesPage />}
          {isPrivileged && tab === "Accounting" && <AccountingPage />}
          {isPrivileged && tab === "Invoices" && <InvoicesPage />}
          {isPrivileged && tab === "Ledger" && <LedgerPage />}
        </div>
      </section>
    </main>
  );
}
