"use client";

import { useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";

const expenses = [
  { id: 1, date: "2026-07-20", category: "Food & Beverage", vendor: "Ocean Fresh Seafood", description: "Weekly seafood order", amount: "$4,200", paymentMethod: "Bank Transfer" },
  { id: 2, date: "2026-07-19", category: "Payroll", vendor: "—", description: "Staff wages - Week 29", amount: "$18,400", paymentMethod: "Direct Deposit" },
  { id: 3, date: "2026-07-18", category: "Utilities", vendor: "City Electric", description: "Electricity - July", amount: "$1,850", paymentMethod: "Auto-pay" },
  { id: 4, date: "2026-07-17", category: "Food & Beverage", vendor: "Valley Farms Produce", description: "Fresh produce delivery", amount: "$2,100", paymentMethod: "Bank Transfer" },
  { id: 5, date: "2026-07-16", category: "Maintenance", vendor: "HVAC Solutions", description: "AC unit repair", amount: "$750", paymentMethod: "Credit Card" },
  { id: 6, date: "2026-07-15", category: "Marketing", vendor: "Social Buzz Agency", description: "Social media management - July", amount: "$2,000", paymentMethod: "Invoice" },
  { id: 7, date: "2026-07-14", category: "Supplies", vendor: "CleanPro Supplies", description: "Cleaning products restock", amount: "$480", paymentMethod: "Credit Card" },
  { id: 8, date: "2026-07-13", category: "Food & Beverage", vendor: "Prime Cuts Meats", description: "Beef & poultry order", amount: "$3,600", paymentMethod: "Bank Transfer" },
  { id: 9, date: "2026-07-12", category: "Insurance", vendor: "Guardian Business Ins.", description: "Monthly premium", amount: "$1,200", paymentMethod: "Auto-pay" },
  { id: 10, date: "2026-07-11", category: "Rent", vendor: "Harbor Properties", description: "Monthly lease payment", amount: "$8,500", paymentMethod: "Bank Transfer" },
];

export function ExpensesPage() {
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  const filtered = expenses.filter(
    (e) =>
      e.category.toLowerCase().includes(search.toLowerCase()) ||
      e.vendor.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.amount.includes(search)
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t("expenses.title")}</h1>
        <p className="page-subtitle">{t("expenses.subtitle")}</p>
      </div>

      <div className="page-toolbar">
        <input
          type="text"
          className="page-search"
          placeholder={t("expenses.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="page-table-wrap">
        <table className="page-table">
          <thead>
            <tr>
              <th>{t("expenses.date")}</th>
              <th>{t("expenses.category")}</th>
              <th>{t("expenses.vendor")}</th>
              <th>{t("expenses.description")}</th>
              <th>{t("expenses.amount")}</th>
              <th>{t("expenses.paymentMethod")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td>{e.date}</td>
                <td><span className="badge badge-expense">{e.category}</span></td>
                <td>{e.vendor}</td>
                <td>{e.description}</td>
                <td><strong>{e.amount}</strong></td>
                <td>{e.paymentMethod}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="no-results">{t("expenses.noResults")}</p>}
      </div>
    </div>
  );
}
