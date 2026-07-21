"use client";

import { useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";

const sharedLoans = [
  { id: 1, lender: "Pacific Business Credit", purpose: "Kitchen equipment", totalAmount: "$60,000", remaining: "$42,000", monthlyPayment: "$3,000", rate: "6.5%", dueDate: "2028-03-01", status: "Active" },
  { id: 2, lender: "Coastal Bank", purpose: "Renovation loan", totalAmount: "$100,000", remaining: "$75,000", monthlyPayment: "$4,500", rate: "5.8%", dueDate: "2029-01-15", status: "Active" },
  { id: 3, lender: "SBA Loan Program", purpose: "Business expansion", totalAmount: "$150,000", remaining: "$120,000", monthlyPayment: "$5,200", rate: "4.2%", dueDate: "2030-06-01", status: "Active" },
  { id: 4, lender: "Partner: Carlos M.", purpose: "Initial capital share", totalAmount: "$50,000", remaining: "$20,000", monthlyPayment: "$2,500", rate: "0%", dueDate: "2027-01-01", status: "Active" },
  { id: 5, lender: "Equipment Finance Co.", purpose: "POS & tech systems", totalAmount: "$25,000", remaining: "$8,300", monthlyPayment: "$1,400", rate: "7.0%", dueDate: "2027-04-01", status: "Active" },
  { id: 6, lender: "Partner: Diana R.", purpose: "Patio build-out share", totalAmount: "$30,000", remaining: "$0", monthlyPayment: "—", rate: "0%", dueDate: "2026-05-01", status: "Paid Off" },
  { id: 7, lender: "Green Energy Fund", purpose: "Solar installation", totalAmount: "$22,000", remaining: "$16,500", monthlyPayment: "$900", rate: "3.5%", dueDate: "2028-11-01", status: "Active" },
];

export function SharedLoansPage() {
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  const filtered = sharedLoans.filter(
    (l) =>
      l.lender.toLowerCase().includes(search.toLowerCase()) ||
      l.purpose.toLowerCase().includes(search.toLowerCase()) ||
      l.status.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t("sharedLoans.title")}</h1>
        <p className="page-subtitle">{t("sharedLoans.subtitle")}</p>
      </div>

      <div className="page-toolbar">
        <input
          type="text"
          className="page-search"
          placeholder={t("sharedLoans.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="page-table-wrap">
        <table className="page-table">
          <thead>
            <tr>
              <th>{t("sharedLoans.lender")}</th>
              <th>{t("sharedLoans.purpose")}</th>
              <th>{t("sharedLoans.total")}</th>
              <th>{t("sharedLoans.remaining")}</th>
              <th>{t("sharedLoans.monthly")}</th>
              <th>{t("sharedLoans.rate")}</th>
              <th>{t("sharedLoans.dueDate")}</th>
              <th>{t("sharedLoans.status")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td><strong>{l.lender}</strong></td>
                <td>{l.purpose}</td>
                <td>{l.totalAmount}</td>
                <td>{l.remaining}</td>
                <td>{l.monthlyPayment}</td>
                <td>{l.rate}</td>
                <td>{l.dueDate}</td>
                <td><span className={`status status-${l.status.toLowerCase().replace(" ", "-")}`}>{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="no-results">{t("sharedLoans.noResults")}</p>}
      </div>
    </div>
  );
}
