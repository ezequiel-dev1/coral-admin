"use client";

import { useMemo } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { CoralDataGrid, ColumnDef } from "@/components/ui/data-grid";
import { Badge } from "@/components/ui/badge";

type Provider = { id: number; name: string; category: string; contact: string; phone: string; email: string; status: string };

const providers: Provider[] = [
  { id: 1, name: "Ocean Fresh Seafood", category: "Seafood", contact: "Luis Martinez", phone: "+1 555-0101", email: "luis@oceanfresh.com", status: "Active" },
  { id: 2, name: "Valley Farms Produce", category: "Vegetables & Fruits", contact: "Sarah Chen", phone: "+1 555-0102", email: "sarah@valleyfarms.com", status: "Active" },
  { id: 3, name: "Prime Cuts Meats", category: "Beef & Poultry", contact: "James Walker", phone: "+1 555-0103", email: "james@primecuts.com", status: "Active" },
  { id: 4, name: "Coastal Wines & Spirits", category: "Beverages", contact: "Maria Lopez", phone: "+1 555-0104", email: "maria@coastalwines.com", status: "Active" },
  { id: 5, name: "Baker's Best", category: "Bakery & Bread", contact: "Tom Richards", phone: "+1 555-0105", email: "tom@bakersbest.com", status: "Inactive" },
  { id: 6, name: "Tropical Imports", category: "Specialty Items", contact: "Ana Rivera", phone: "+1 555-0106", email: "ana@tropicalimports.com", status: "Active" },
  { id: 7, name: "CleanPro Supplies", category: "Cleaning & Supplies", contact: "Dave Johnson", phone: "+1 555-0107", email: "dave@cleanpro.com", status: "Active" },
  { id: 8, name: "Dairy Direct", category: "Dairy & Cheese", contact: "Emily Park", phone: "+1 555-0108", email: "emily@dairydirect.com", status: "Pending" },
];

function statusVariant(s: string) {
  switch (s.toLowerCase()) { case "active": return "secondary" as const; case "inactive": return "outline" as const; default: return "default" as const; }
}

export function ProvidersPage() {
  const { t } = useTranslation();

  const columns: ColumnDef<Provider, unknown>[] = useMemo(() => [
    { accessorKey: "name", header: t("providers.name"), size: 200 },
    { accessorKey: "category", header: t("providers.category"), size: 160 },
    { accessorKey: "contact", header: t("providers.contact"), size: 150 },
    { accessorKey: "phone", header: t("providers.phone"), size: 130 },
    { accessorKey: "email", header: t("providers.email"), size: 200 },
    { accessorKey: "status", header: t("providers.status"), size: 110, cell: ({ getValue }) => <Badge variant={statusVariant(getValue() as string)}>{getValue() as string}</Badge> },
  ], [t]);

  return (
    <div className="page">
      <div className="page-header"><div><h1>{t("providers.title")}</h1><p className="page-subtitle">{t("providers.subtitle")}</p></div></div>
      <CoralDataGrid data={providers} columns={columns} height={500} />
    </div>
  );
}
