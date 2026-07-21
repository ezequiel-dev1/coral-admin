"use client";

import { useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Search } from "lucide-react";

const entries = [
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

function typeVariant(type: string) {
  return type === "Credit" ? "secondary" as const : "destructive" as const;
}

export function AccountingPage() {
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  const filtered = entries.filter(
    (e) =>
      e.account.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t("accounting.title")}</h1>
        <p className="page-subtitle">{t("accounting.subtitle")}</p>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t("accounting.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("accounting.date")}</TableHead>
              <TableHead>{t("accounting.account")}</TableHead>
              <TableHead>{t("accounting.type")}</TableHead>
              <TableHead>{t("accounting.description")}</TableHead>
              <TableHead>{t("accounting.amount")}</TableHead>
              <TableHead>{t("accounting.balance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.date}</TableCell>
                <TableCell className="font-medium">{e.account}</TableCell>
                <TableCell><Badge variant={typeVariant(e.type)}>{e.type}</Badge></TableCell>
                <TableCell>{e.description}</TableCell>
                <TableCell className="font-medium">{e.amount}</TableCell>
                <TableCell>{e.balance}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t("accounting.noResults")}</p>}
      </div>
    </div>
  );
}
