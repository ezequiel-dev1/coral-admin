"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { CoralDataGrid, ColumnDef } from "@/components/ui/data-grid";
import { fetchInvestments, Investment } from "../lib/dynamodb";

export function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    fetchInvestments()
      .then(setInvestments)
      .catch((err) => console.error("Failed to fetch investments:", err))
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnDef<Investment, unknown>[] = useMemo(() => [
    { accessorKey: "date", header: t("investments.startDate"), size: 130 },
    { accessorKey: "investor", header: t("investments.investor"), size: 140 },
    { accessorKey: "category", header: t("investments.category"), size: 180 },
    {
      accessorKey: "amount",
      header: t("investments.invested"),
      size: 140,
      cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span>,
    },
    { accessorKey: "returnEstimate", header: t("investments.estReturn"), size: 120 },
  ], [t]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t("investments.title")}</h1>
          <p className="page-subtitle">{t("investments.subtitle")}</p>
        </div>
      </div>

      <CoralDataGrid
        data={investments}
        columns={columns}
        loading={loading}
        height={500}
        defaultSorting={[{ id: "date", desc: false }]}
        footerSummary={(rows) => {
          const total = rows.reduce((s, r) => s + parseFloat(r.amount.replace(/[^0-9.]/g, "") || "0"), 0);
          return <span><span className="text-[var(--text-muted)]">Total:</span> <strong>${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>;
        }}
      />
    </div>
  );
}
