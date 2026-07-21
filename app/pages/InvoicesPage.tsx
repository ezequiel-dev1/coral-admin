"use client";

import { useMemo } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { CoralDataGrid, ColumnDef } from "@/components/ui/data-grid";
import { Badge } from "@/components/ui/badge";

type Invoice = { id: number; number: string; client: string; date: string; dueDate: string; amount: string; status: string };

const invoices: Invoice[] = [
  { id: 1, number: "INV-001", client: "Corporate Event Co.", date: "2026-07-20", dueDate: "2026-08-05", amount: "$5,800", status: "Pending" },
  { id: 2, number: "INV-002", client: "Martinez Wedding", date: "2026-07-15", dueDate: "2026-07-30", amount: "$12,400", status: "Paid" },
  { id: 3, number: "INV-003", client: "Tech Summit Catering", date: "2026-07-10", dueDate: "2026-07-25", amount: "$8,900", status: "Overdue" },
  { id: 4, number: "INV-004", client: "Harbor Yacht Club", date: "2026-07-08", dueDate: "2026-07-22", amount: "$3,200", status: "Paid" },
  { id: 5, number: "INV-005", client: "Sunrise Brunch Co.", date: "2026-07-05", dueDate: "2026-07-20", amount: "$2,100", status: "Overdue" },
  { id: 6, number: "INV-006", client: "Ocean View Hotel", date: "2026-07-01", dueDate: "2026-07-15", amount: "$15,600", status: "Paid" },
  { id: 7, number: "INV-007", client: "Downtown Office Party", date: "2026-06-28", dueDate: "2026-07-12", amount: "$4,500", status: "Paid" },
  { id: 8, number: "INV-008", client: "Rivera Birthday", date: "2026-06-25", dueDate: "2026-07-10", amount: "$1,800", status: "Paid" },
];

function statusVariant(s: string) {
  switch (s.toLowerCase()) { case "paid": return "secondary" as const; case "overdue": return "destructive" as const; default: return "outline" as const; }
}

export function InvoicesPage() {
  const { t } = useTranslation();

  const columns: ColumnDef<Invoice, unknown>[] = useMemo(() => [
    { accessorKey: "number", header: t("invoices.number"), size: 120 },
    { accessorKey: "client", header: t("invoices.client"), size: 200 },
    { accessorKey: "date", header: t("invoices.date"), size: 120 },
    { accessorKey: "dueDate", header: t("invoices.dueDate"), size: 120 },
    { accessorKey: "amount", header: t("invoices.amount"), size: 120, cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { accessorKey: "status", header: t("invoices.status"), size: 110, cell: ({ getValue }) => <Badge variant={statusVariant(getValue() as string)}>{getValue() as string}</Badge> },
  ], [t]);

  return (
    <div className="page">
      <div className="page-header"><div><h1>{t("invoices.title")}</h1><p className="page-subtitle">{t("invoices.subtitle")}</p></div></div>
      <CoralDataGrid data={invoices} columns={columns} height={500} defaultSorting={[{ id: "date", desc: true }]} />
    </div>
  );
}
