"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useTranslation } from "../i18n/LanguageProvider";
import { fetchOrders, type Order } from "../lib/dynamodb";
import { SEATING_SPOTS, SeatingChart } from "./SeatingChart";
import { tableName } from "../lib/tableName";
import { authedFetch } from "../lib/apiFetch";

type Rating = { rating: number; createdAt: string };

const REFRESH_MS = 30_000;

function formatMoney(value: number): string {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function isToday(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Guests at an order: distinct seats used on its lines (at least 1). */
function guestsOf(o: Order): number {
  const seats = new Set<number>();
  for (const l of o.items ?? []) if (l.seat) seats.add(l.seat);
  return Math.max(1, seats.size);
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

type WeatherData = {
  location: string;
  temperature: string;
  condition: string;
};

function getWeatherCondition(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 65) return "Rainy";
  if (code <= 67) return "Freezing rain";
  if (code <= 77) return "Snowy";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

function useWeather(): WeatherData {
  const [weather, setWeather] = useState<WeatherData>({
    location: "Loading...",
    temperature: "--",
    condition: "",
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setWeather({ location: "Unknown", temperature: "--", condition: "" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const [geoRes, weatherRes] = await Promise.all([
            fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
            ),
            fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius`
            ),
          ]);

          const geoData = await geoRes.json();
          const weatherData = await weatherRes.json();

          const city =
            geoData.address?.city ||
            geoData.address?.town ||
            geoData.address?.village ||
            geoData.address?.municipality ||
            "Unknown";

          const temp = Math.round(weatherData.current?.temperature_2m ?? 0);
          const code = weatherData.current?.weather_code ?? 0;

          setWeather({
            location: city,
            temperature: `${temp}°C`,
            condition: getWeatherCondition(code),
          });
        } catch {
          setWeather({ location: "Unknown", temperature: "--", condition: "" });
        }
      },
      () => {
        setWeather({ location: "Unknown", temperature: "--", condition: "" });
      }
    );
  }, []);

  return weather;
}

function getFirstName(name: string): string {
  return name.split(" ")[0] || name;
}

export function OverviewPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const weather = useWeather();
  const displayName = user?.name || "there";
  const [noticeOverride, setNoticeOverride] = useState<string | null>(null);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("");
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ords = await fetchOrders();
        if (!cancelled) setAllOrders(ords);
      } catch (err) {
        console.error("Failed to load orders for overview:", err);
      }
      try {
        const res = await authedFetch("/api/feedback", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setRatings(data.ratings ?? []);
        }
      } catch (err) {
        console.error("Failed to load feedback for overview:", err);
      }
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const stats = useMemo(() => {
    const open = allOrders.filter((o) => o.status === "open");
    const held = allOrders.filter((o) => o.status === "held");
    const capacity = SEATING_SPOTS.reduce((n, s) => n + s.seats, 0);
    const guests = open
      .filter((o) => o.serviceType !== "takeout")
      .reduce((n, o) => n + guestsOf(o), 0);
    const paidToday = allOrders.filter(
      (o) => o.status === "paid" && isToday(o.paidAt ?? o.createdAt)
    );
    const sales = paidToday.reduce((n, o) => n + (o.total ?? 0), 0);
    const todaysRatings = ratings.filter((r) => isToday(r.createdAt));
    const avgRating = todaysRatings.length
      ? todaysRatings.reduce((n, r) => n + r.rating, 0) / todaysRatings.length
      : null;
    const inProgress = [...open].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const completed = allOrders.filter((o) => o.completedAt || (o.source !== "uber-eats" && o.paidAt));
    const durations = completed.map((o) => Math.max(0, Math.round((new Date(o.completedAt ?? o.paidAt!).getTime() - new Date(o.createdAt).getTime()) / 60_000))).filter(Number.isFinite);
    const averageTurnMinutes = durations.length ? Math.round(durations.reduce((sum, minutes) => sum + minutes, 0) / durations.length) : null;
    return {
      open,
      held,
      capacity,
      guests,
      paidCount: paidToday.length,
      sales,
      ratingCount: todaysRatings.length,
      avgRating,
      inProgress,
      occupied: new Set(open.map((o) => o.tableLabel)),
      averageTurnMinutes,
      completedCount: durations.length,
    };
  }, [allOrders, ratings]);

  const notice =
    noticeOverride ??
    (stats.open.length === 0 ? t("overview.serviceIdle") : t("overview.serviceOnTrack"));

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? t("greeting.morning") : hour < 18 ? t("greeting.afternoon") : t("greeting.evening"));
  }, [t]);

  return (
    <>
      <section className="hero-row">
        <div>
          <p className="eyebrow">{t("overview.eyebrow")}</p>
          <h1>{greeting}, {getFirstName(displayName)}.</h1>
          <p className="subhead">{t("overview.subhead", { guests: String(stats.guests) })}</p>
        </div>
        <div className="weather">
          <span>{weather.temperature}</span>
          <small>{weather.location}<br />{weather.condition}</small>
          <span className="sun">☼</span>
        </div>
      </section>

      <section className="metrics">
        <article>
          <span className="metric-icon rose">♙</span>
          <div><small>{t("overview.guestsOnFloor")}</small><strong>{stats.guests} <em>of {stats.capacity}</em></strong></div>
          <p>{t("overview.guestsChange", { n: String(stats.open.length) })}</p>
        </article>
        <article>
          <span className="metric-icon amber">◷</span>
          <div><small>{t("overview.avgTurnTime")}</small><strong>{stats.averageTurnMinutes === null ? "—" : formatDuration(stats.averageTurnMinutes)}</strong></div>
          <p>{stats.completedCount ? t("overview.completedOrders", { n: String(stats.completedCount) }) : t("overview.turnTimeChange")}</p>
        </article>
        <article>
          <span className="metric-icon mint">$</span>
          <div><small>{t("overview.salesTonight")}</small><strong>{formatMoney(stats.sales)}</strong></div>
          <p>{t("overview.salesPercent", { n: String(stats.paidCount) })}</p>
        </article>
        <article>
          <span className="metric-icon blue">✦</span>
          <div><small>{t("overview.guestSentiment")}</small><strong>{stats.avgRating === null ? "—" : stats.avgRating.toFixed(1)} <em>/ 5</em></strong></div>
          <p>{stats.avgRating === null ? t("overview.noRatings") : t("overview.sentimentChange", { n: String(stats.ratingCount) })}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="floor-card">
          <div className="card-head">
            <div><h2>{t("overview.diningRoom")}</h2><p>{t("overview.tapTable")}</p></div>
            <button className="outline" onClick={() => { window.location.hash = "orders"; }}>{t("nav.orders")}</button>
          </div>
          <div className="legend">
            <span><i className="seat" /> {t("overview.seated")}</span>
            <span><i className="ready" /> {t("overview.ready")}</span>
          </div>
          <SeatingChart
            selected={activeTable}
            occupied={(id) => stats.occupied.has(id)}
            onSelect={(id) => setActiveTable(id)}
            seatsLabel={t("overview.seats")}
          />
        </article>

        <aside className="right-rail">
          <article className="service-card">
            <div className="card-head">
              <div><p className="eyebrow">{t("overview.servicePulse")}</p><h2>{notice}</h2></div>
              <span className="pulse">●</span>
            </div>
            <div className="service-line"><span>{t("overview.frontOfHouse")}</span><b>{t("overview.fullyStaffed", { n: String(stats.open.length) })}</b></div>
            <div className="service-line"><span>{t("overview.kitchenTickets")}</span><b className="warning">{t("overview.inProgress", { n: String(stats.inProgress.length) })}</b></div>
            <div className="service-line"><span>{t("overview.nextReservation")}</span><b>{stats.held.length}</b></div>
            <button className="text-button" onClick={() => setNoticeOverride(t("overview.allInSync"))}>{t("overview.viewServiceNotes")}</button>
          </article>

          <article className="reservation-card">
            <div className="card-head">
              <div><p className="eyebrow">{t("overview.upNext")}</p><h2>{t("overview.reservations")}</h2></div>
              <button className="round-button" onClick={() => setNoticeOverride(t("overview.newReservationOpened"))}>+</button>
            </div>
            <div className="reservation"><div className="time">7:00<small>PM</small></div><div><strong>Adrian Parker</strong><p>2 guests · Table 02</p></div><span className="tag">VIP</span></div>
            <div className="reservation"><div className="time">7:15<small>PM</small></div><div><strong>Riley Morgan</strong><p>4 guests · Table 05</p></div></div>
            <button className="text-button">{t("overview.viewAllReservations")}</button>
          </article>
        </aside>
      </section>

      <section className="orders-card">
        <div className="card-head">
          <div><p className="eyebrow">{t("overview.kitchen")}</p><h2>{t("overview.ordersInProgress")} <span>{stats.inProgress.length}</span></h2></div>
          <button className="outline" onClick={() => { window.location.hash = "orders"; }}>{t("overview.openOrderBoard")}</button>
        </div>
        <div className="order-list">
          {stats.inProgress.length === 0 && (
            <p className="subhead">{t("overview.noOrdersInProgress")}</p>
          )}
          {stats.inProgress.map((o) => {
            const label = o.serviceType === "takeout" ? t("overview.takeout") : tableName(t, o.tableLabel) || "—";
            const qty = (o.items ?? []).reduce((n, l) => n + l.quantity, 0);
            return (
              <button className="order" key={o.id} onClick={() => { window.location.hash = "orders"; }}>
                <span className="order-table">{label}</span>
                <div><strong>{o.customerName || o.splitLabel || label}</strong><small>{t("overview.items", { n: String(qty) })}</small></div>
                <b>{formatMoney(o.total ?? 0)}</b>
                <span className="eta">{t("overview.min", { n: String(minutesSince(o.createdAt)) })}</span>
                <span className="arrow">→</span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
