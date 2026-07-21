"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { CoralDataGrid, ColumnDef } from "@/components/ui/data-grid";
import { Badge } from "@/components/ui/badge";
import { fetchLedger, LedgerEntry } from "../lib/dynamodb";

function tipoVariant(tipo: string) {
  switch (tipo) {
    case "Inversion": return "secondary" as const;
    case "Gasto": return "destructive" as const;
    case "Ingreso": return "default" as const;
    default: return "outline" as const;
  }
}

export function LedgerPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLedger()
      .then(setEntries)
      .catch((err) => console.error("Failed to fetch ledger:", err))
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnDef<LedgerEntry, unknown>[] = useMemo(() => [
    {
      accessorKey: "tipo",
      header: t("ledger.tipo"),
      size: 120,
      cell: ({ getValue }) => <Badge variant={tipoVariant(getValue() as string)}>{getValue() as string}</Badge>,
    },
    { accessorKey: "fecha", header: t("ledger.fecha"), size: 120 },
    {
      accessorKey: "abono",
      header: t("ledger.abono"),
      size: 130,
      cell: ({ getValue }) => {
        const v = parseFloat((getValue() as string) || "0");
        return v ? <span className="text-green-700 font-medium">${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> : "";
      },
    },
    {
      accessorKey: "cargo",
      header: t("ledger.cargo"),
      size: 130,
      cell: ({ getValue }) => {
        const v = parseFloat((getValue() as string) || "0");
        return v ? <span className="text-red-600 font-medium">${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> : "";
      },
    },
    { accessorKey: "descripcion", header: t("ledger.descripcion"), size: 280 },
    { accessorKey: "origen", header: t("ledger.origen"), size: 180 },
    { accessorKey: "destinoBeneficiario", header: t("ledger.beneficiario"), size: 200 },
    { accessorKey: "destinoCLABE", header: "CLABE", size: 180 },
    { accessorKey: "notas", header: t("ledger.notas"), size: 200 },
  ], [t]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t("ledger.title")}</h1>
          <p className="page-subtitle">{t("ledger.subtitle")} — {entries.length} {t("ledger.records").toLowerCase()}</p>
        </div>
      </div>

      <CoralDataGrid
        data={entries}
        columns={columns}
        loading={loading}
        height={700}
        defaultPageSize={100}
        defaultSorting={[{ id: "fecha", desc: true }]}
        footerSummary={(rows) => {
          const abono = rows.reduce((s, r) => s + parseFloat(r.abono || "0"), 0);
          const cargo = rows.reduce((s, r) => s + parseFloat(r.cargo || "0"), 0);
          const bal = abono - cargo;
          return (
            <>
              <span><span className="text-[var(--text-muted)]">{t("ledger.abono")}:</span> <strong className="text-green-700">${abono.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
              <span><span className="text-[var(--text-muted)]">{t("ledger.cargo")}:</span> <strong className="text-red-600">${cargo.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
              <span><span className="text-[var(--text-muted)]">Balance:</span> <strong className={bal >= 0 ? "text-green-700" : "text-red-600"}>${bal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
            </>
          );
        }}
      />
    </div>
  );
}
