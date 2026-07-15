"use client";

import { useState } from "react";

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

export default function Home() {
  const [tab, setTab] = useState("Floor");
  const [notice, setNotice] = useState("Service is on track");
  const [activeTable, setActiveTable] = useState("01");

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">B</span><span>BRASSERIE</span></div>
        <div className="venue"><span className="venue-dot" /> Brasserie No. 8 <span className="chev">⌄</span></div>
        <nav aria-label="Restaurant sections">
          {["Overview", "Floor", "Reservations", "Orders", "Menu", "Inventory", "Team"].map((item) => (
            <button key={item} className={tab === item ? "nav-item active" : "nav-item"} onClick={() => setTab(item)}>
              <span>{({ Overview: "⌂", Floor: "▦", Reservations: "▣", Orders: "◴", Menu: "≡", Inventory: "◇", Team: "♧" } as Record<string, string>)[item]}</span>{item}
              {item === "Orders" && <b>4</b>}
            </button>
          ))}
        </nav>
        <div className="side-footer">
          <div className="avatar">ML</div><div><strong>Marina Lewis</strong><small>Floor manager</small></div><button aria-label="Settings">⚙</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumb"><span>Tuesday, 15 July</span><strong>·</strong><span>Dinner service</span><i>Live</i></div>
          <div className="top-actions"><button className="icon-button" aria-label="Search">⌕</button><button className="icon-button" aria-label="Notifications">♧<em /></button><button className="help">?</button></div>
        </header>

        <div className="content">
          <section className="hero-row">
            <div><p className="eyebrow">LIVE FLOOR</p><h1>Good evening, Marina.</h1><p className="subhead">46 guests are dining. Your next seating is in 12 minutes.</p></div>
            <div className="weather"><span>72°</span><small>San Diego<br />Clear evening</small><span className="sun">☼</span></div>
          </section>

          <section className="metrics">
            <article><span className="metric-icon rose">♙</span><div><small>Guests on floor</small><strong>46 <em>of 64</em></strong></div><p>+8 since 6 PM</p></article>
            <article><span className="metric-icon amber">◷</span><div><small>Average turn time</small><strong>1h 38m</strong></div><p>4 min faster today</p></article>
            <article><span className="metric-icon mint">$</span><div><small>Sales tonight</small><strong>$2,846</strong></div><p>71% of forecast</p></article>
            <article><span className="metric-icon blue">✦</span><div><small>Guest sentiment</small><strong>4.8 <em>/ 5</em></strong></div><p>14 new mentions</p></article>
          </section>

          <section className="dashboard-grid">
            <article className="floor-card">
              <div className="card-head"><div><h2>Dining room</h2><p>Tap a table to view its details</p></div><button className="outline">Edit floor</button></div>
              <div className="legend"><span><i className="seat" /> Seated</span><span><i className="ready" /> Ready</span><span><i className="turning" /> Turning</span></div>
              <div className="floor-plan">
                <div className="bar">BAR <span>● ● ● ● ●</span></div>
                <div className="floor-label label-a">WINDOW</div><div className="floor-label label-b">DINING ROOM</div>
                {tables.map((table) => <button key={table.id} onClick={() => setActiveTable(table.id)} className={`table table-${table.state} ${activeTable === table.id ? "selected" : ""}`} style={{ gridArea: `t${table.id}` }}><b>{table.id}</b><small>{table.seats} seats</small></button>)}
                <div className="pass">KITCHEN PASS</div>
              </div>
            </article>

            <aside className="right-rail">
              <article className="service-card"><div className="card-head"><div><p className="eyebrow">SERVICE PULSE</p><h2>{notice}</h2></div><span className="pulse">●</span></div><div className="service-line"><span>Front of house</span><b>Fully staffed</b></div><div className="service-line"><span>Kitchen tickets</span><b className="warning">4 in progress</b></div><div className="service-line"><span>Next reservation</span><b>7:00 · 2 guests</b></div><button className="text-button" onClick={() => setNotice("All teams are in sync")}>View service notes →</button></article>
              <article className="reservation-card"><div className="card-head"><div><p className="eyebrow">UP NEXT</p><h2>Reservations</h2></div><button className="round-button" onClick={() => setNotice("New reservation panel opened")}>+</button></div><div className="reservation"><div className="time">7:00<small>PM</small></div><div><strong>Adrian Parker</strong><p>2 guests · Table 02</p></div><span className="tag">VIP</span></div><div className="reservation"><div className="time">7:15<small>PM</small></div><div><strong>Riley Morgan</strong><p>4 guests · Table 05</p></div></div><button className="text-button" onClick={() => setTab("Reservations")}>View all reservations →</button></article>
            </aside>
          </section>

          <section className="orders-card"><div className="card-head"><div><p className="eyebrow">KITCHEN</p><h2>Orders in progress <span>4</span></h2></div><button className="outline" onClick={() => setTab("Orders")}>Open order board</button></div><div className="order-list">{orders.map(([table, guest, items, total, eta]) => <button className="order" key={table} onClick={() => setNotice(`Table ${table} order is being prepared`)}><span className="order-table">{table}</span><div><strong>{guest}</strong><small>{items}</small></div><b>{total}</b><span className="eta">{eta}</span><span className="arrow">→</span></button>)}</div></section>
        </div>
      </section>
    </main>
  );
}
