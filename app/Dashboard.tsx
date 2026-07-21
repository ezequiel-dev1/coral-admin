"use client";

import { useState } from "react";
import { useAuth } from "./auth/AuthProvider";
import { useTranslation } from "./i18n/LanguageProvider";
import { OverviewPage } from "./pages/OverviewPage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { InvestmentsPage } from "./pages/InvestmentsPage";
import { SharedLoansPage } from "./pages/SharedLoansPage";
import { ExpensesPage } from "./pages/ExpensesPage";

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
  const [tab, setTab] = useState("Overview");

  const displayName = user?.name || "there";
  const initials = user ? getInitials(user.name) : "??";

  const navItems = [
    { key: "Overview", label: t("nav.overview"), icon: "▦" },
    { key: "Providers", label: t("nav.providers"), icon: "⇌" },
    { key: "Investments", label: t("nav.investments"), icon: "↗" },
    { key: "Shared Loans", label: t("nav.sharedLoans"), icon: "⊞" },
    { key: "Expenses", label: t("nav.expenses"), icon: "≋" },
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><img src="/coral-icon.png" alt="Coral Reef and Beef" className="brand-mark" /><span className="brand-text"><span className="brand-coral">CORAL</span><span className="brand-sub">REEF &amp; BEEF</span></span></div>
        <nav aria-label="Restaurant sections">
          {navItems.map((item) => (
            <button key={item.key} className={tab === item.key ? "nav-item active" : "nav-item"} onClick={() => setTab(item.key)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="side-footer">
          <div className="avatar">{initials}</div>
          <div><strong>{displayName}</strong><small>{user?.group || "Member"}</small></div>
          <button aria-label="Sign out" onClick={logout}>⚙</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumb"><span>{new Date().toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" })}</span></div>
          <div className="top-actions">
            <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
              <option value="en-US">🇺🇸 {t("lang.english")}</option>
              <option value="es-MX">🇲🇽 {t("lang.spanish")}</option>
            </select>
            <button className="icon-button" aria-label="Search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button>
            <button className="icon-button" aria-label="Notifications"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><em /></button>
          </div>
        </header>

        <div className="content">
          {tab === "Overview" && <OverviewPage />}
          {tab === "Providers" && <ProvidersPage />}
          {tab === "Investments" && <InvestmentsPage />}
          {tab === "Shared Loans" && <SharedLoansPage />}
          {tab === "Expenses" && <ExpensesPage />}
        </div>
      </section>
    </main>
  );
}
