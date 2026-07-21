"use client";

import { useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";

const investments = [
  { id: 1, name: "Kitchen Renovation", category: "Infrastructure", invested: "$45,000", returnEstimate: "18%", startDate: "2026-03-01", status: "In Progress" },
  { id: 2, name: "Outdoor Patio Expansion", category: "Infrastructure", invested: "$28,000", returnEstimate: "22%", startDate: "2026-01-15", status: "Completed" },
  { id: 3, name: "POS System Upgrade", category: "Technology", invested: "$12,500", returnEstimate: "30%", startDate: "2026-05-10", status: "In Progress" },
  { id: 4, name: "Wine Cellar Collection", category: "Inventory", invested: "$18,000", returnEstimate: "15%", startDate: "2026-02-20", status: "Active" },
  { id: 5, name: "Staff Training Program", category: "Human Resources", invested: "$8,500", returnEstimate: "25%", startDate: "2026-04-01", status: "Completed" },
  { id: 6, name: "Marketing Campaign Q3", category: "Marketing", invested: "$15,000", returnEstimate: "35%", startDate: "2026-07-01", status: "Active" },
  { id: 7, name: "Delivery Fleet", category: "Operations", invested: "$32,000", returnEstimate: "20%", startDate: "2026-06-15", status: "Pending" },
  { id: 8, name: "Solar Panel Installation", category: "Infrastructure", invested: "$22,000", returnEstimate: "12%", startDate: "2025-11-01", status: "Completed" },
];

export function InvestmentsPage() {
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  const filtered = investments.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.category.toLowerCase().includes(search.toLowerCase()) ||
      i.status.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t("investments.title")}</h1>
        <p className="page-subtitle">{t("investments.subtitle")}</p>
      </div>

      <div className="page-toolbar">
        <input
          type="text"
          className="page-search"
          placeholder={t("investments.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="page-table-wrap">
        <table className="page-table">
          <thead>
            <tr>
              <th>{t("investments.name")}</th>
              <th>{t("investments.category")}</th>
              <th>{t("investments.invested")}</th>
              <th>{t("investments.estReturn")}</th>
              <th>{t("investments.startDate")}</th>
              <th>{t("investments.status")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id}>
                <td><strong>{i.name}</strong></td>
                <td>{i.category}</td>
                <td>{i.invested}</td>
                <td>{i.returnEstimate}</td>
                <td>{i.startDate}</td>
                <td><span className={`status status-${i.status.toLowerCase().replace(" ", "-")}`}>{i.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="no-results">{t("investments.noResults")}</p>}
      </div>
    </div>
  );
}
