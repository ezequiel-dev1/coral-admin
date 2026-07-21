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

const providers = [
  { id: 1, name: "Ocean Fresh Seafood", category: "Seafood", contact: "Luis Martinez", phone: "+1 555-0101", email: "luis@oceanfresh.com", status: "Active" },
  { id: 2, name: "Valley Farms Produce", category: "Vegetables & Fruits", contact: "Sarah Chen", phone: "+1 555-0102", email: "sarah@valleyfarms.com", status: "Active" },
  { id: 3, name: "Prime Cuts Meats", category: "Beef & Poultry", contact: "James Walker", phone: "+1 555-0103", email: "james@primecuts.com", status: "Active" },
  { id: 4, name: "Coastal Wines & Spirits", category: "Beverages", contact: "Maria Lopez", phone: "+1 555-0104", email: "maria@coastalwines.com", status: "Active" },
  { id: 5, name: "Baker's Best", category: "Bakery & Bread", contact: "Tom Richards", phone: "+1 555-0105", email: "tom@bakersbest.com", status: "Inactive" },
  { id: 6, name: "Tropical Imports", category: "Specialty Items", contact: "Ana Rivera", phone: "+1 555-0106", email: "ana@tropicalimports.com", status: "Active" },
  { id: 7, name: "CleanPro Supplies", category: "Cleaning & Supplies", contact: "Dave Johnson", phone: "+1 555-0107", email: "dave@cleanpro.com", status: "Active" },
  { id: 8, name: "Dairy Direct", category: "Dairy & Cheese", contact: "Emily Park", phone: "+1 555-0108", email: "emily@dairydirect.com", status: "Pending" },
];

function statusVariant(status: string) {
  switch (status.toLowerCase()) {
    case "active": return "secondary" as const;
    case "inactive": return "outline" as const;
    case "pending": return "default" as const;
    default: return "secondary" as const;
  }
}

export function ProvidersPage() {
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  const filtered = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.contact.toLowerCase().includes(search.toLowerCase()) ||
      p.status.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t("providers.title")}</h1>
        <p className="page-subtitle">{t("providers.subtitle")}</p>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t("providers.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("providers.name")}</TableHead>
              <TableHead>{t("providers.category")}</TableHead>
              <TableHead>{t("providers.contact")}</TableHead>
              <TableHead>{t("providers.phone")}</TableHead>
              <TableHead>{t("providers.email")}</TableHead>
              <TableHead>{t("providers.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.category}</TableCell>
                <TableCell>{p.contact}</TableCell>
                <TableCell>{p.phone}</TableCell>
                <TableCell>{p.email}</TableCell>
                <TableCell><Badge variant={statusVariant(p.status)}>{p.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t("providers.noResults")}</p>}
      </div>
    </div>
  );
}
