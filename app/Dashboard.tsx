"use client";

import { useState, useEffect, useRef } from "react";
import { fetchOrders, type Order } from "./lib/dynamodb";
import { useAuth } from "./auth/AuthProvider";
import { useTranslation } from "./i18n/LanguageProvider";
import { ThemeToggle } from "./ThemeToggle";
import { OverviewPage } from "./pages/OverviewPage";
import { MenuItemsPage } from "./pages/MenuItemsPage";
import { MenuIngredientsPage } from "./pages/MenuIngredientsPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { UberTestPage } from "./pages/UberTestPage";
import { APP_ENV } from "./lib/tables";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Carrot,
  Users,
  ShoppingCart,
  ClipboardList,
  CalendarDays,
  Search,
  Bell,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  FlaskConical,
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

  const validTabs = ["Overview", "Orders", "Reservations", "Checkout", "Menu Items", "Menu Ingredients", "Employees", "Uber Test"];

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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [uberNotifications, setUberNotifications] = useState<Array<{ id: string; title: string; at: string; read: boolean }>>([]);
  const knownUberOrderIds = useRef<Set<string> | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  function playUberAlert() {
    try {
      const context = audioContext.current ?? new AudioContext();
      audioContext.current = context;
      if (context.state !== "running") return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.setValueAtTime(1175, context.currentTime + 0.16);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.43);
    } catch (error) { console.warn("Unable to play Uber order alert:", error); }
  }

  useEffect(() => {
    // On narrow screens the sidebar is a fixed icon rail
    if (window.matchMedia("(max-width: 700px)").matches) setSidebarOpen(false);
  }, []);

  useEffect(() => {
    setDateStr(new Date().toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" }));
  }, [lang]);

  useEffect(() => {
    let active = true;
    async function checkUberOrders() {
      try {
        const incoming = (await fetchOrders()).filter((order: Order) => order.source === "uber-eats" && (order.uberWorkflowStatus ?? "new") === "new");
        const ids = new Set(incoming.map((order) => order.id));
        if (knownUberOrderIds.current) {
          const fresh = incoming.filter((order) => !knownUberOrderIds.current!.has(order.id));
          if (active && fresh.length) {
            setUberNotifications((previous) => [...fresh.map((order) => ({ id: order.id, title: order.uberDisplayId || order.uberOrderId || order.id, at: new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), read: false })), ...previous].slice(0, 8));
            playUberAlert();
          }
        }
        knownUberOrderIds.current = ids;
      } catch (error) { console.error("Failed to check Uber orders:", error); }
    }
    checkUberOrders();
    const enableAudio = () => { if (!audioContext.current) audioContext.current = new AudioContext(); audioContext.current.resume().catch(() => undefined); };
    window.addEventListener("pointerdown", enableAudio, { once: true });
    const timer = window.setInterval(checkUberOrders, 10_000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("pointerdown", enableAudio); };
  }, []);

  const isPrivileged = user?.groups?.some(
    (g) => g === "Administrator" || g === "Overlord"
  ) ?? false;

  // Managers and Meseros get the day-to-day pages (Orders, Checkout); admin-only pages need Administrator/Overlord.
  const isStaff =
    isPrivileged ||
    (user?.groups?.some((g) => g === "Manager" || g === "Mesero") ?? false);

  // UAT-only tooling: hidden (and its API refuses to run) in production.
  const showUberTest = APP_ENV !== "production";

  const allNavItems = [
    { key: "Overview", label: t("nav.overview"), icon: LayoutDashboard, public: false },
    { key: "Orders", staff: true, label: t("nav.orders"), icon: ClipboardList, public: false },
    { key: "Reservations", label: t("nav.reservations"), icon: CalendarDays, public: false },
    { key: "Checkout", staff: true, label: t("nav.checkout"), icon: ShoppingCart, public: false },
    { key: "Menu Items", label: t("nav.menuItems"), icon: UtensilsCrossed, public: false },
    { key: "Menu Ingredients", label: t("nav.menuIngredients"), icon: Carrot, public: false },
    { key: "Employees", label: t("nav.employees"), icon: Users, public: false },
    ...(showUberTest ? [{ key: "Uber Test", label: "Uber Test", icon: FlaskConical, public: false }] : []),
  ];

  const navItems = allNavItems.filter((item) =>
    item.public || isPrivileged || (item.staff && isStaff)
  );

  // If the requested tab isn't allowed for this user (e.g. default "Overview"), fall back to their first one (Orders for managers).
  const activeTab = navItems.some((i) => i.key === tab) ? tab : navItems[0]?.key ?? tab;

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
                  className={activeTab === item.key ? "nav-item active" : "nav-item"}
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
            <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar" className="sidebar-toggle text-[var(--text-muted)] hover:text-[#3D4F9B]">
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </Button>
            <span>{dateStr}</span>
          </div>
          <div className="top-actions">
            <ThemeToggle />
            <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
              <option value="en-US">🇺🇸 {t("lang.english")}</option>
              <option value="es-MX">🇲🇽 {t("lang.spanish")}</option>
            </select>
            <Button variant="ghost" size="icon" className="text-[#E48664]" aria-label="Search">
              <Search size={18} />
            </Button>
            <div className="notifications-wrap">
            <Button variant="ghost" size="icon" onClick={() => setNotificationsOpen((open) => !open)} className="text-[#E48664] relative" aria-label="Notifications">
              <Bell size={18} />
              {uberNotifications.filter((note) => !note.read).length > 0 && <span className="notification-count">{uberNotifications.filter((note) => !note.read).length}</span>}
            </Button>
            {notificationsOpen && <div className="notifications-menu"><strong>{t("notifications.title")}</strong>{uberNotifications.length === 0 ? <p>{t("notifications.empty")}</p> : uberNotifications.map((note) => <button className={note.read ? "notification-read" : ""} key={note.id} onClick={() => { setTab("Orders"); setUberNotifications((previous) => previous.map((item) => item.id === note.id ? { ...item, read: true } : item)); setNotificationsOpen(false); }}><span>{t("notifications.uberNew", { id: note.title })}</span><small>{note.at}</small></button>)}</div>}
            </div>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out" className="text-[#E48664] hover:text-[#E48664] hover:bg-[#E48664]/10">
              <LogOut size={18} />
            </Button>
          </div>
        </header>

        <div className="content">
          {isPrivileged && activeTab === "Overview" && <OverviewPage />}
          {isStaff && activeTab === "Orders" && <OrdersPage />}
          {isPrivileged && activeTab === "Reservations" && <ReservationsPage />}
          {isStaff && activeTab === "Checkout" && <CheckoutPage />}
          {isPrivileged && activeTab === "Menu Items" && <MenuItemsPage />}
          {isPrivileged && activeTab === "Menu Ingredients" && <MenuIngredientsPage />}
          {isPrivileged && activeTab === "Employees" && <EmployeesPage />}
          {isPrivileged && showUberTest && activeTab === "Uber Test" && <UberTestPage />}
        </div>
      </section>
    </main>
  );
}
