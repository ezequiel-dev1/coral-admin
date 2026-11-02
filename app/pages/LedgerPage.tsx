"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { useIsAdmin } from "../hooks/useIsAdmin";
import { CoralDataGrid, ColumnDef } from "@/components/ui/data-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  fetchLedger,
  createLedgerEntry,
  updateLedgerEntry,
  deleteLedgerEntry,
  LedgerEntry,
  LedgerEntryInput,
} from "../lib/dynamodb";

function tipoVariant(tipo: string) {
  switch (tipo) {
    case "Inversion": return "secondary" as const;
    case "Gasto": return "destructive" as const;
    case "Ingreso": return "default" as const;
    default: return "outline" as const;
  }
}

const emptyForm: LedgerEntryInput = {
  tipo: "Ingreso",
  fecha: "",
  abono: "",
  cargo: "",
  descripcion: "",
  origen: "",
  destinoCLABE: "",
  destinoBeneficiario: "",
  notas: "",
};

export function LedgerPage() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // CRUD state
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [form, setForm] = useState<LedgerEntryInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    try {
      const data = await fetchLedger();
      setEntries(data);
    } catch (err) {
      console.error("Failed to fetch ledger:", err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingEntry(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(entry: LedgerEntry) {
    setEditingEntry(entry);
    setForm({
      tipo: entry.tipo,
      fecha: entry.fecha,
      abono: entry.abono,
      cargo: entry.cargo,
      descripcion: entry.descripcion,
      origen: entry.origen,
      destinoCLABE: entry.destinoCLABE,
      destinoBeneficiario: entry.destinoBeneficiario,
      notas: entry.notas,
    });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editingEntry) {
        await updateLedgerEntry(editingEntry.id, form);
      } else {
        await createLedgerEntry(form);
      }
      setShowModal(false);
      await loadEntries();
    } catch (err) {
      console.error("Failed to save ledger entry:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: LedgerEntry) {
    if (!confirm(t("ledger.confirmDelete"))) return;
    try {
      await deleteLedgerEntry(entry.id);
      await loadEntries();
    } catch (err) {
      console.error("Failed to delete ledger entry:", err);
    }
  }

  const columns: ColumnDef<LedgerEntry, unknown>[] = useMemo(() => {
    const cols: ColumnDef<LedgerEntry, unknown>[] = [
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
      { accessorKey: "destinoCLABE", header: t("ledger.clabe"), size: 180 },
      { accessorKey: "notas", header: t("ledger.notas"), size: 200 },
    ];

    if (isAdmin) {
      cols.push({
        id: "actions",
        header: "",
        size: 80,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(row.original)} aria-label="Edit">
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(row.original)} aria-label="Delete">
              <Trash2 />
            </Button>
          </div>
        ),
      });
    }

    return cols;
  }, [t, isAdmin]);

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>{t("ledger.title")}</h1>
          <p className="page-subtitle">{t("ledger.subtitle")} — {entries.length} {t("ledger.records").toLowerCase()}</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}>
            <Plus data-icon="inline-start" />
            {t("ledger.addEntry")}
          </Button>
        )}
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

      {/* Create / Edit Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? t("ledger.editEntry") : t("ledger.addEntry")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("ledger.tipo")}</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  <option value="Ingreso">{t("ledger.tipoIngreso")}</option>
                  <option value="Gasto">{t("ledger.tipoGasto")}</option>
                  <option value="Inversion">{t("ledger.tipoInversion")}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{t("ledger.fecha")}</Label>
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("ledger.abono")}</Label>
                <CurrencyInput value={form.abono} onChange={(v) => setForm({ ...form, abono: v })} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label>{t("ledger.cargo")}</Label>
                <CurrencyInput value={form.cargo} onChange={(v) => setForm({ ...form, cargo: v })} placeholder="0" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("ledger.descripcion")}</Label>
              <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="e.g. Pago de nómina" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("ledger.origen")}</Label>
                <Input value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })} placeholder="e.g. Banco" />
              </div>
              <div className="grid gap-2">
                <Label>{t("ledger.beneficiario")}</Label>
                <Input value={form.destinoBeneficiario} onChange={(e) => setForm({ ...form, destinoBeneficiario: e.target.value })} placeholder="e.g. Proveedor X" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("ledger.clabe")}</Label>
              <Input value={form.destinoCLABE} onChange={(e) => setForm({ ...form, destinoCLABE: e.target.value })} placeholder="e.g. 012345678901234567" />
            </div>
            <div className="grid gap-2">
              <Label>{t("ledger.notas")}</Label>
              <textarea
                className="w-full min-h-[80px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t("ledger.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? (editingEntry ? t("ledger.saving") : t("ledger.creating"))
                : t("ledger.save")
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
