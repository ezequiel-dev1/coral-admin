"use client";

import { useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";

const providers = [
  { id: 1, name: "Ocean Fresh Seafood", category: "Seafood", contact: "Luis Martinez", phone: "+1 555-0101", email: "luis@oceanfresh.com", status: "Active" },
  { id: 2, name: "Valley Farms Produce", category: "Vegetables & Fruits", contact: "Sarah Chen", phone: "+1 555-0102", email: "sarah@valleyfarms.com", status: "Active" },
  { id: 3, name: "Prime Cuts Meats", category: "Beef & Poultry", contact: "James Walker", phone: "+1 555-0103", email: "james@primecuts.com", status: "Active" },
  { id: 4, name: "Coastal Wines & Spirits", category: "Beverages", contact: "Maria Lopez", phone: "+1 555-0104", email: "maria@coastalwines.com", status: "Active" },
  { id: 5, name: "Baker's Best", category: "Bakery & Bread", contact: "Tom Richards", phone: "+1 555-0105", email: "tom@bakersbest.com", status: "Inactive" },
  { id: 6, name: "Tropical Imports", category: "Specialty Items", contact: "Ana Rivera", phone: "+1 555-0106", email: "ana@tropicalimports.com", status: "Active" },
  { id: 7, name: "CleanPro Supplies", category: "Cleaning & Supplies", contact: "Dave Johnson", phone: "+1 555-0107", email: "dave@cleanpro.com", status: "Active" },
  { id: 8, name: "Dairy Direct", category: "Dairy & Cheese", contact: "Emily Park", phone: "+1 555-0108", email: "emily@dairydirect.com", status: "Pending" },
];

export function ProvidersPage() {
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  const filtered = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.contact.toLowerCase().includes(search.toLowerCase()) ||
      p.status.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t("providers.title")}</h1>
        <p className="page-subtitle">{t("providers.subtitle")}</p>
      </div>

      <div className="page-toolbar">
        <input
          type="text"
          className="page-search"
          placeholder={t("providers.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="page-table-wrap">
        <table className="page-table">
          <thead>
            <tr>
              <th>{t("providers.name")}</th>
              <th>{t("providers.category")}</th>
              <th>{t("providers.contact")}</th>
              <th>{t("providers.phone")}</th>
              <th>{t("providers.email")}</th>
              <th>{t("providers.status")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong></td>
                <td>{p.category}</td>
                <td>{p.contact}</td>
                <td>{p.phone}</td>
                <td>{p.email}</td>
                <td><span className={`status status-${p.status.toLowerCase()}`}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="no-results">{t("providers.noResults")}</p>}
      </div>
    </div>
  );
}
