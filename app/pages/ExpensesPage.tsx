"use client";

import { useMemo } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { CoralDataGrid, ColumnDef } from "@/components/ui/data-grid";
import { Badge } from "@/components/ui/badge";

type Expense = { id: number; date: string; category: string; vendor: string; description: string; amount: string; paymentMethod: string };

const expenses: Expense[] = [
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
  const { t } = useTranslation();

  const columns: ColumnDef<Expense, unknown>[] = useMemo(() => [
    { accessorKey: "date", header: t("expenses.date"), size: 120 },
    { accessorKey: "category", header: t("expenses.category"), size: 150, cell: ({ getValue }) => <Badge variant="secondary">{getValue() as string}</Badge> },
    { accessorKey: "vendor", header: t("expenses.vendor"), size: 180 },
    { accessorKey: "description", header: t("expenses.description"), size: 250 },
    { accessorKey: "amount", header: t("expenses.amount"), size: 120, cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { accessorKey: "paymentMethod", header: t("expenses.paymentMethod"), size: 140 },
  ], [t]);

  return (
    <div className="page">
      <div className="page-header"><div><h1>{t("expenses.title")}</h1><p className="page-subtitle">{t("expenses.subtitle")}</p></div></div>
      <CoralDataGrid data={expenses} columns={columns} height={500} defaultSorting={[{ id: "date", desc: true }]} />
    </div>
  );
}
