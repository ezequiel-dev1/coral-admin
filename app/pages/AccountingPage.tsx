"use client";

import { useMemo } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { CoralDataGrid, ColumnDef } from "@/components/ui/data-grid";
import { Badge } from "@/components/ui/badge";

type Entry = { id: number; date: string; account: string; type: string; description: string; amount: string; balance: string };

const entries: Entry[] = [
  { id: 1, date: "2026-07-20", account: "Revenue", type: "Credit", description: "Dinner service sales", amount: "$8,420", balance: "$124,600" },
  { id: 2, date: "2026-07-20", account: "Cost of Goods", type: "Debit", description: "Seafood supplier payment", amount: "$4,200", balance: "$67,300" },
  { id: 3, date: "2026-07-19", account: "Payroll", type: "Debit", description: "Staff wages - Week 29", amount: "$18,400", balance: "$48,900" },
  { id: 4, date: "2026-07-18", account: "Utilities", type: "Debit", description: "Electricity - July", amount: "$1,850", balance: "$12,400" },
  { id: 5, date: "2026-07-18", account: "Revenue", type: "Credit", description: "Lunch service sales", amount: "$3,200", balance: "$116,180" },
  { id: 6, date: "2026-07-17", account: "Assets", type: "Debit", description: "Kitchen equipment purchase", amount: "$12,500", balance: "$85,000" },
  { id: 7, date: "2026-07-16", account: "Marketing", type: "Debit", description: "Social media ads", amount: "$2,000", balance: "$6,500" },
  { id: 8, date: "2026-07-15", account: "Revenue", type: "Credit", description: "Catering event", amount: "$5,800", balance: "$112,980" },
  { id: 9, date: "2026-07-14", account: "Rent", type: "Debit", description: "Monthly lease payment", amount: "$8,500", balance: "$8,500" },
  { id: 10, date: "2026-07-13", account: "Loan Payment", type: "Debit", description: "Pacific Business Credit", amount: "$3,000", balance: "$42,000" },
];

function typeVariant(type: string) { return type === "Credit" ? "secondary" as const : "destructive" as const; }

export function AccountingPage() {
  const { t } = useTranslation();

  const columns: ColumnDef<Entry, unknown>[] = useMemo(() => [
    { accessorKey: "date", header: t("accounting.date"), size: 120 },
    { accessorKey: "account", header: t("accounting.account"), size: 150 },
    { accessorKey: "type", header: t("accounting.type"), size: 100, cell: ({ getValue }) => <Badge variant={typeVariant(getValue() as string)}>{getValue() as string}</Badge> },
    { accessorKey: "description", header: t("accounting.description"), size: 280 },
    { accessorKey: "amount", header: t("accounting.amount"), size: 120, cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { accessorKey: "balance", header: t("accounting.balance"), size: 120 },
  ], [t]);

  return (
    <div className="page">
      <div className="page-header"><div><h1>{t("accounting.title")}</h1><p className="page-subtitle">{t("accounting.subtitle")}</p></div></div>
      <CoralDataGrid data={entries} columns={columns} height={500} defaultSorting={[{ id: "date", desc: true }]} />
    </div>
  );
}
