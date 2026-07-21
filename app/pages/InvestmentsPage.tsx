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

const investments = [
  { id: 1, name: "Kitchen Renovation", category: "Infrastructure", invested: "$45,000", returnEstimate: "18%", startDate: "2026-03-01", status: "In Progress" },
  { id: 2, name: "Outdoor Patio Expansion", category: "Infrastructure", invested: "$28,000", returnEstimate: "22%", startDate: "2026-01-15", status: "Completed" },
  { id: 3, name: "POS System Upgrade", category: "Technology", invested: "$12,500", returnEstimate: "30%", startDate: "2026-05-10", status: "In Progress" },
  { id: 4, name: "Wine Cellar Collection", category: "Inventory", invested: "$18,000", returnEstimate: "15%", startDate: "2026-02-20", status: "Active" },
  { id: 5, name: "Staff Training Program", category: "Human Resources", invested: "$8,500", returnEstimate: "25%", startDate: "2026-04-01", status: "Completed" },
  { id: 6, name: "Marketing Campaign Q3", category: "Marketing", invested: "$15,000", returnEstimate: "35%", startDate: "2026-07-01", status: "Active" },
  { id: 7, name: "Delivery Fleet", category: "Operations", invested: "$32,000", returnEstimate: "20%", startDate: "2026-06-15", status: "Pending" },
  { id: 8, name: "Solar Panel Installation", category: "Infrastructure", invested: "$22,000", returnEstimate: "12%", startDate: "2025-11-01", status: "Completed" },
];

function statusVariant(status: string) {
  switch (status.toLowerCase()) {
    case "active": return "secondary" as const;
    case "completed": return "default" as const;
    case "in progress": return "outline" as const;
    case "pending": return "outline" as const;
    default: return "secondary" as const;
  }
}

export function InvestmentsPage() {
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  const filtered = investments.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.category.toLowerCase().includes(search.toLowerCase()) ||
      i.status.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t("investments.title")}</h1>
        <p className="page-subtitle">{t("investments.subtitle")}</p>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t("investments.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("investments.name")}</TableHead>
              <TableHead>{t("investments.category")}</TableHead>
              <TableHead>{t("investments.invested")}</TableHead>
              <TableHead>{t("investments.estReturn")}</TableHead>
              <TableHead>{t("investments.startDate")}</TableHead>
              <TableHead>{t("investments.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.name}</TableCell>
                <TableCell>{i.category}</TableCell>
                <TableCell>{i.invested}</TableCell>
                <TableCell>{i.returnEstimate}</TableCell>
                <TableCell>{i.startDate}</TableCell>
                <TableCell><Badge variant={statusVariant(i.status)}>{i.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t("investments.noResults")}</p>}
      </div>
    </div>
  );
}
