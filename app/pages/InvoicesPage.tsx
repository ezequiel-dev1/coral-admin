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

const invoices = [
  { id: 1, number: "INV-001", client: "Corporate Event Co.", date: "2026-07-20", dueDate: "2026-08-05", amount: "$5,800", status: "Pending" },
  { id: 2, number: "INV-002", client: "Martinez Wedding", date: "2026-07-15", dueDate: "2026-07-30", amount: "$12,400", status: "Paid" },
  { id: 3, number: "INV-003", client: "Tech Summit Catering", date: "2026-07-10", dueDate: "2026-07-25", amount: "$8,900", status: "Overdue" },
  { id: 4, number: "INV-004", client: "Harbor Yacht Club", date: "2026-07-08", dueDate: "2026-07-22", amount: "$3,200", status: "Paid" },
  { id: 5, number: "INV-005", client: "Sunrise Brunch Co.", date: "2026-07-05", dueDate: "2026-07-20", amount: "$2,100", status: "Overdue" },
  { id: 6, number: "INV-006", client: "Ocean View Hotel", date: "2026-07-01", dueDate: "2026-07-15", amount: "$15,600", status: "Paid" },
  { id: 7, number: "INV-007", client: "Downtown Office Party", date: "2026-06-28", dueDate: "2026-07-12", amount: "$4,500", status: "Paid" },
  { id: 8, number: "INV-008", client: "Rivera Birthday", date: "2026-06-25", dueDate: "2026-07-10", amount: "$1,800", status: "Paid" },
];

function statusVariant(status: string) {
  switch (status.toLowerCase()) {
    case "paid": return "secondary" as const;
    case "pending": return "outline" as const;
    case "overdue": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export function InvoicesPage() {
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  const filtered = invoices.filter(
    (i) =>
      i.number.toLowerCase().includes(search.toLowerCase()) ||
      i.client.toLowerCase().includes(search.toLowerCase()) ||
      i.status.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t("invoices.title")}</h1>
        <p className="page-subtitle">{t("invoices.subtitle")}</p>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t("invoices.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("invoices.number")}</TableHead>
              <TableHead>{t("invoices.client")}</TableHead>
              <TableHead>{t("invoices.date")}</TableHead>
              <TableHead>{t("invoices.dueDate")}</TableHead>
              <TableHead>{t("invoices.amount")}</TableHead>
              <TableHead>{t("invoices.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.number}</TableCell>
                <TableCell>{i.client}</TableCell>
                <TableCell>{i.date}</TableCell>
                <TableCell>{i.dueDate}</TableCell>
                <TableCell className="font-medium">{i.amount}</TableCell>
                <TableCell><Badge variant={statusVariant(i.status)}>{i.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t("invoices.noResults")}</p>}
      </div>
    </div>
  );
}
