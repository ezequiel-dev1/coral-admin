"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { useIsAdmin } from "../hooks/useIsAdmin";
import {
  fetchSharedLoans,
  createSharedLoan,
  updateSharedLoan,
  deleteSharedLoan,
  SharedLoan,
  SharedLoanInput,
} from "../lib/dynamodb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { PercentInput } from "@/components/ui/percent-input";

const emptyForm: SharedLoanInput = {
  lender: "",
  purpose: "",
  totalAmount: "",
  remaining: "",
  monthlyPayment: "",
  rate: "",
  dueDate: "",
  status: "Active",
  notes: "",
};

function statusVariant(status: string) {
  switch (status.toLowerCase()) {
    case "active": return "secondary" as const;
    case "paid off": return "default" as const;
    case "pending": return "outline" as const;
    default: return "secondary" as const;
  }
}

export function SharedLoansPage() {
  const [loans, setLoans] = useState<SharedLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState<SharedLoan | null>(null);
  const [form, setForm] = useState<SharedLoanInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();

  useEffect(() => {
    loadLoans();
  }, []);

  async function loadLoans() {
    setLoading(true);
    try {
      const data = await fetchSharedLoans();
      setLoans(data);
    } catch (err) {
      console.error("Failed to fetch shared loans:", err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingLoan(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(loan: SharedLoan) {
    setEditingLoan(loan);
    setForm({
      lender: loan.lender,
      purpose: loan.purpose,
      totalAmount: loan.totalAmount,
      remaining: loan.remaining,
      monthlyPayment: loan.monthlyPayment,
      rate: loan.rate,
      dueDate: loan.dueDate,
      status: loan.status,
      notes: loan.notes || "",
    });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editingLoan) {
        await updateSharedLoan(editingLoan.id, form);
      } else {
        await createSharedLoan(form);
      }
      setShowModal(false);
      await loadLoans();
    } catch (err) {
      console.error("Failed to save loan:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(loan: SharedLoan) {
    if (!confirm(t("sharedLoans.confirmDelete"))) return;
    try {
      await deleteSharedLoan(loan.id);
      await loadLoans();
    } catch (err) {
      console.error("Failed to delete loan:", err);
    }
  }

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>{t("sharedLoans.title")}</h1>
          <p className="page-subtitle">{t("sharedLoans.subtitle")}</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}>
            <Plus data-icon="inline-start" />
            {t("sharedLoans.addLoan")}
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-white">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("sharedLoans.lender")}</TableHead>
                <TableHead>{t("sharedLoans.purpose")}</TableHead>
                <TableHead>{t("sharedLoans.total")}</TableHead>
                <TableHead>{t("sharedLoans.remaining")}</TableHead>
                <TableHead>{t("sharedLoans.monthly")}</TableHead>
                <TableHead>{t("sharedLoans.rate")}</TableHead>
                <TableHead>{t("sharedLoans.dueDate")}</TableHead>
                <TableHead>{t("sharedLoans.notes")}</TableHead>
                <TableHead>{t("sharedLoans.status")}</TableHead>
                {isAdmin && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.lender}</TableCell>
                  <TableCell>{l.purpose}</TableCell>
                  <TableCell>{l.totalAmount}</TableCell>
                  <TableCell>{l.remaining}</TableCell>
                  <TableCell>{l.monthlyPayment}</TableCell>
                  <TableCell>{l.rate}</TableCell>
                  <TableCell>{l.dueDate}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">{l.notes}</TableCell>
                  <TableCell><Badge variant={statusVariant(l.status)}>{l.status}</Badge></TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(l)} aria-label="Edit">
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(l)} aria-label="Delete">
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!loading && loans.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">{t("sharedLoans.noResults")}</p>
        )}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLoan ? t("sharedLoans.editLoan") : t("sharedLoans.addLoan")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("sharedLoans.lender")}</Label>
                <Input value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} placeholder="e.g. Fonacot" />
              </div>
              <div className="grid gap-2">
                <Label>{t("sharedLoans.purpose")}</Label>
                <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="e.g. Employee credit" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("sharedLoans.total")}</Label>
                <CurrencyInput value={form.totalAmount} onChange={(v) => setForm({ ...form, totalAmount: v })} placeholder="50000" />
              </div>
              <div className="grid gap-2">
                <Label>{t("sharedLoans.remaining")}</Label>
                <CurrencyInput value={form.remaining} onChange={(v) => setForm({ ...form, remaining: v })} placeholder="35000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("sharedLoans.monthly")}</Label>
                <CurrencyInput value={form.monthlyPayment} onChange={(v) => setForm({ ...form, monthlyPayment: v })} placeholder="2500" />
              </div>
              <div className="grid gap-2">
                <Label>{t("sharedLoans.rate")}</Label>
                <PercentInput value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} placeholder="12" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("sharedLoans.dueDate")}</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>{t("sharedLoans.status")}</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="Active">Active</option>
                  <option value="Paid Off">Paid Off</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("sharedLoans.notes")}</Label>
              <textarea
                className="w-full min-h-[80px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t("sharedLoans.notesPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t("sharedLoans.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (editingLoan ? t("sharedLoans.saving") : t("sharedLoans.creating")) : t("sharedLoans.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
