"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useTranslation } from "../i18n/LanguageProvider";

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

const tables = [
  { id: "01", seats: 2, state: "seated", time: "6:30", guests: "Maya & 1", spend: "$84" },
  { id: "02", seats: 4, state: "ready", time: "7:00", guests: "Reserved", spend: "" },
  { id: "03", seats: 2, state: "turning", time: "7:15", guests: "Walk-in", spend: "" },
  { id: "04", seats: 6, state: "seated", time: "6:45", guests: "Navarro party", spend: "$212" },
  { id: "05", seats: 4, state: "ready", time: "7:30", guests: "Reserved", spend: "" },
  { id: "06", seats: 2, state: "seated", time: "7:00", guests: "Theo & 1", spend: "$67" },
  { id: "07", seats: 8, state: "seated", time: "6:15", guests: "Dawson group", spend: "$318" },
  { id: "08", seats: 4, state: "ready", time: "7:45", guests: "Reserved", spend: "" },
];

const orders = [
  ["01", "Maya Chen", "2 items", "$84", "10 min"],
  ["04", "Navarro party", "6 items", "$212", "14 min"],
  ["06", "Theo Green", "3 items", "$67", "7 min"],
  ["07", "Dawson group", "8 items", "$318", "18 min"],
];

export function OverviewPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const weather = useWeather();
  const displayName = user?.name || "there";
  const [notice, setNotice] = useState(t("overview.serviceOnTrack"));
  const [activeTable, setActiveTable] = useState("01");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("greeting.morning") : hour < 18 ? t("greeting.afternoon") : t("greeting.evening");

  return (
    <>
      <section className="hero-row">
        <div>
          <p className="eyebrow">{t("overview.eyebrow")}</p>
          <h1>{greeting}, {getFirstName(displayName)}.</h1>
          <p className="subhead">{t("overview.subhead")}</p>
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
          <div><small>{t("overview.guestsOnFloor")}</small><strong>46 <em>of 64</em></strong></div>
          <p>{t("overview.guestsChange")}</p>
        </article>
        <article>
          <span className="metric-icon amber">◷</span>
          <div><small>{t("overview.avgTurnTime")}</small><strong>1h 38m</strong></div>
          <p>{t("overview.turnTimeChange")}</p>
        </article>
        <article>
          <span className="metric-icon mint">$</span>
          <div><small>{t("overview.salesTonight")}</small><strong>$2,846</strong></div>
          <p>{t("overview.salesPercent")}</p>
        </article>
        <article>
          <span className="metric-icon blue">✦</span>
          <div><small>{t("overview.guestSentiment")}</small><strong>4.8 <em>/ 5</em></strong></div>
          <p>{t("overview.sentimentChange")}</p>
        </article>
      </section>

      <section className="orders-card">
        <div className="card-head">
          <div><p className="eyebrow">{t("overview.payments")}</p><h2>{t("overview.pendingPayments")} <span>4</span></h2></div>
          <button className="outline">{t("overview.viewAll")}</button>
        </div>
        <div className="order-list">
          <button className="order"><span className="order-table">🐟</span><div><strong>Ocean Fresh Seafood</strong><small>{t("overview.weeklySeafoodOrder")}</small></div><b>$4,200</b><span className="eta">Due Jul 25</span><span className="arrow">→</span></button>
          <button className="order"><span className="order-table">🏦</span><div><strong>Pacific Business Credit</strong><small>{t("overview.kitchenEquipmentLoan")}</small></div><b>$3,000</b><span className="eta">Due Aug 1</span><span className="arrow">→</span></button>
          <button className="order"><span className="order-table">⚡</span><div><strong>City Electric</strong><small>{t("overview.utilitiesElectricity")}</small></div><b>$1,850</b><span className="eta">Due Jul 28</span><span className="arrow">→</span></button>
          <button className="order"><span className="order-table">🏠</span><div><strong>Harbor Properties</strong><small>{t("overview.monthlyLease")}</small></div><b>$8,500</b><span className="eta">Due Aug 1</span><span className="arrow">→</span></button>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="floor-card">
          <div className="card-head">
            <div><h2>{t("overview.diningRoom")}</h2><p>{t("overview.tapTable")}</p></div>
            <button className="outline">{t("overview.editFloor")}</button>
          </div>
          <div className="legend">
            <span><i className="seat" /> {t("overview.seated")}</span>
            <span><i className="ready" /> {t("overview.ready")}</span>
            <span><i className="turning" /> {t("overview.turning")}</span>
          </div>
          <div className="floor-plan">
            <div className="bar">BAR <span>● ● ● ● ●</span></div>
            <div className="floor-label label-a">WINDOW</div>
            <div className="floor-label label-b">DINING ROOM</div>
            {tables.map((table) => (
              <button
                key={table.id}
                onClick={() => setActiveTable(table.id)}
                className={`table table-${table.state} ${activeTable === table.id ? "selected" : ""}`}
                style={{ gridArea: `t${table.id}` }}
              >
                <b>{table.id}</b>
                <small>{table.seats} {t("overview.seats")}</small>
              </button>
            ))}
            <div className="pass">KITCHEN PASS</div>
          </div>
        </article>

        <aside className="right-rail">
          <article className="service-card">
            <div className="card-head">
              <div><p className="eyebrow">{t("overview.servicePulse")}</p><h2>{notice}</h2></div>
              <span className="pulse">●</span>
            </div>
            <div className="service-line"><span>{t("overview.frontOfHouse")}</span><b>{t("overview.fullyStaffed")}</b></div>
            <div className="service-line"><span>{t("overview.kitchenTickets")}</span><b className="warning">{t("overview.inProgress")}</b></div>
            <div className="service-line"><span>{t("overview.nextReservation")}</span><b>7:00 · 2 guests</b></div>
            <button className="text-button" onClick={() => setNotice(t("overview.allInSync"))}>{t("overview.viewServiceNotes")}</button>
          </article>

          <article className="reservation-card">
            <div className="card-head">
              <div><p className="eyebrow">{t("overview.upNext")}</p><h2>{t("overview.reservations")}</h2></div>
              <button className="round-button" onClick={() => setNotice(t("overview.newReservationOpened"))}>+</button>
            </div>
            <div className="reservation"><div className="time">7:00<small>PM</small></div><div><strong>Adrian Parker</strong><p>2 guests · Table 02</p></div><span className="tag">VIP</span></div>
            <div className="reservation"><div className="time">7:15<small>PM</small></div><div><strong>Riley Morgan</strong><p>4 guests · Table 05</p></div></div>
            <button className="text-button">{t("overview.viewAllReservations")}</button>
          </article>
        </aside>
      </section>

      <section className="orders-card">
        <div className="card-head">
          <div><p className="eyebrow">{t("overview.kitchen")}</p><h2>{t("overview.ordersInProgress")} <span>4</span></h2></div>
          <button className="outline">{t("overview.openOrderBoard")}</button>
        </div>
        <div className="order-list">
          {orders.map(([table, guest, items, total, eta]) => (
            <button className="order" key={table} onClick={() => setNotice(t("overview.orderBeingPrepared", { table: table }))}>
              <span className="order-table">{table}</span>
              <div><strong>{guest}</strong><small>{items}</small></div>
              <b>{total}</b>
              <span className="eta">{eta}</span>
              <span className="arrow">→</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
