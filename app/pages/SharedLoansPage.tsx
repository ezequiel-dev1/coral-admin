"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { useIsAdmin } from "../hooks/useIsAdmin";
import {
  fetchSharedLoans,
  createSharedLoan,
  updateSharedLoan,
  deleteSharedLoan,
  fetchLoanCharges,
  createLoanCharge,
  deleteLoanCharge,
  SharedLoan,
  SharedLoanInput,
  LoanCharge,
  LoanChargeInput,
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
import { Plus, Pencil, Trash2, History, Paperclip, Maximize2 } from "lucide-react";
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

  // Charge history state
  const [showCharges, setShowCharges] = useState(false);
  const [chargesLoan, setChargesLoan] = useState<SharedLoan | null>(null);
  const [charges, setCharges] = useState<LoanCharge[]>([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [chargeForm, setChargeForm] = useState<LoanChargeInput>({ date: "", amount: "", description: "", type: "payment" });
  const [addingCharge, setAddingCharge] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

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

  async function openEdit(loan: SharedLoan) {
    setEditingLoan(loan);
    // Calculate remaining from charges
    let remaining = loan.remaining;
    try {
      const chargeData = await fetchLoanCharges(loan.id);
      const totalNum = parseFloat(loan.totalAmount.replace(/[^0-9.]/g, "") || "0");
      const paidSum = chargeData.reduce((acc, c) => acc + parseFloat(c.amount.replace(/[^0-9.]/g, "") || "0"), 0);
      const rem = totalNum - paidSum;
      remaining = rem.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: rem % 1 === 0 ? 0 : 2 });
    } catch { /* fallback to stored value */ }
    setForm({
      lender: loan.lender,
      purpose: loan.purpose,
      totalAmount: loan.totalAmount,
      remaining,
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

  async function openCharges(loan: SharedLoan) {
    setChargesLoan(loan);
    setShowCharges(true);
    setChargesLoading(true);
    setChargeForm({ date: "", amount: "", description: "", type: "payment" });
    setPreviewImage(null);
    try {
      const data = await fetchLoanCharges(loan.id);
      setCharges(data);
    } catch (err) {
      console.error("Failed to fetch charges:", err);
    } finally {
      setChargesLoading(false);
    }
  }

  async function handleAddCharge() {
    if (!chargesLoan) return;
    setAddingCharge(true);
    try {
      await createLoanCharge(chargesLoan.id, chargeForm);
      const data = await fetchLoanCharges(chargesLoan.id);
      setCharges(data);
      setChargeForm({ date: "", amount: "", description: "", type: "payment" });
      // Recalculate remaining
      await recalculateRemaining(chargesLoan, data);
    } catch (err) {
      console.error("Failed to add charge:", err);
    } finally {
      setAddingCharge(false);
    }
  }

  async function handleDeleteCharge(charge: LoanCharge) {
    if (!chargesLoan) return;
    try {
      await deleteLoanCharge(charge.loanId, charge.chargeId);
      const data = await fetchLoanCharges(chargesLoan.id);
      setCharges(data);
      // Recalculate remaining
      await recalculateRemaining(chargesLoan, data);
    } catch (err) {
      console.error("Failed to delete charge:", err);
    }
  }

  async function recalculateRemaining(loan: SharedLoan, chargeData: LoanCharge[]) {
    const totalNum = parseFloat(loan.totalAmount.replace(/[^0-9.]/g, "") || "0");
    const paidSum = chargeData.reduce((acc, c) => acc + parseFloat(c.amount.replace(/[^0-9.]/g, "") || "0"), 0);
    const rem = totalNum - paidSum;
    const remaining = rem.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: rem % 1 === 0 ? 0 : 2 });
    await updateSharedLoan(loan.id, { ...loan, remaining });
    await loadLoans();
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
                {isAdmin && <TableHead className="w-28" />}
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
                        <Button variant="ghost" size="icon-sm" onClick={() => openCharges(l)} aria-label="History">
                          <History />
                        </Button>
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
                <Input value={form.remaining} disabled className="bg-[#f5f3f1] opacity-70" />
                <span className="text-xs text-[var(--text-muted)]">Auto-calculated from charges</span>
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

      <Dialog open={showCharges} onOpenChange={(open) => { setShowCharges(open); if (!open) setPreviewImage(null); }}>
        <DialogContent className="sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>{t("sharedLoans.chargeHistory")} — {chargesLoan?.lender}</DialogTitle>
          </DialogHeader>

          {isAdmin && (
            <div className="grid grid-cols-[1fr_1fr_2fr_1fr_auto] gap-2 items-end border-b pb-4">
              <div className="grid gap-1">
                <Label className="text-xs">{t("sharedLoans.chargeDate")}</Label>
                <Input type="date" value={chargeForm.date} onChange={(e) => setChargeForm({ ...chargeForm, date: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">{t("sharedLoans.chargeAmount")}</Label>
                <CurrencyInput value={chargeForm.amount} onChange={(v) => setChargeForm({ ...chargeForm, amount: v })} placeholder="1000" />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">{t("sharedLoans.chargeDescription")}</Label>
                <Input value={chargeForm.description} onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })} placeholder="Monthly payment" />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">{t("sharedLoans.chargeType")}</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                  value={chargeForm.type}
                  onChange={(e) => setChargeForm({ ...chargeForm, type: e.target.value as LoanChargeInput["type"] })}
                >
                  <option value="payment">{t("sharedLoans.chargePayment")}</option>
                  <option value="interest">{t("sharedLoans.chargeInterest")}</option>
                  <option value="fee">{t("sharedLoans.chargeFee")}</option>
                  <option value="adjustment">{t("sharedLoans.chargeAdjustment")}</option>
                </select>
              </div>
              <Button size="sm" onClick={handleAddCharge} disabled={addingCharge || !chargeForm.date || !chargeForm.amount}>
                <Plus size={14} />
              </Button>
            </div>
          )}

          {!chargesLoading && charges.length > 0 && (
            <div className="flex gap-6 py-3 px-1 border-b text-sm">
              <div><span className="text-[var(--text-muted)]">Total paid:</span> <strong>{(() => { const sum = charges.reduce((acc, c) => acc + parseFloat(c.amount.replace(/[^0-9.]/g, "") || "0"), 0); return sum.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: sum % 1 === 0 ? 0 : 2 }); })()}</strong></div>
              <div><span className="text-[var(--text-muted)]">Payments:</span> <strong>{charges.length}</strong></div>
              <div><span className="text-[var(--text-muted)]">Avg:</span> <strong>{(() => { const sum = charges.reduce((acc, c) => acc + parseFloat(c.amount.replace(/[^0-9.]/g, "") || "0"), 0); const avg = sum / charges.length; return avg.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: avg % 1 === 0 ? 0 : 2 }); })()}</strong></div>
            </div>
          )}

          <div className={`grid gap-4 ${previewImage ? "grid-cols-[1fr_300px]" : "grid-cols-1"}`}>
            <div className="max-h-[560px] overflow-y-auto">
              {chargesLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
              ) : charges.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("sharedLoans.noCharges")}</p>
              ) : (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">{t("sharedLoans.chargeDate")}</TableHead>
                      <TableHead className="w-24">{t("sharedLoans.chargeType")}</TableHead>
                      <TableHead>{t("sharedLoans.chargeDescription")}</TableHead>
                      <TableHead className="w-24 text-right">{t("sharedLoans.chargeAmount")}</TableHead>
                      <TableHead className="w-24"></TableHead>
                      {isAdmin && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {charges.map((c) => (
                      <TableRow key={c.chargeId} className={previewImage === c.receipt ? "bg-muted/50" : ""}>
                        <TableCell className="whitespace-nowrap">{c.date}</TableCell>
                        <TableCell><Badge variant="outline">{c.type}</Badge></TableCell>
                        <TableCell className="whitespace-normal text-sm leading-snug">
                          {c.description}
                        </TableCell>
                        <TableCell className="font-medium text-right whitespace-nowrap">{c.amount}</TableCell>
                        <TableCell>
                          {c.receipt && (
                            <button
                              onClick={() => setPreviewImage(previewImage === c.receipt ? null : c.receipt!)}
                              className="inline-flex items-center gap-1 text-xs text-[#3D4F9B] hover:underline cursor-pointer bg-transparent border-none"
                            >
                              <Paperclip size={12} /> Attachment
                            </button>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteCharge(c)} aria-label="Delete">
                              <Trash2 size={12} />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {previewImage && (
              <div className="border rounded-lg p-3 bg-[#f9f8f7] flex flex-col items-center justify-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
                <img src={previewImage} alt="Attachment" className="max-w-full max-h-[480px] rounded-md object-contain shadow-sm" />
                <div className="flex gap-3 mt-1">
                  <button onClick={() => setFullscreen(true)} className="inline-flex items-center gap-1 text-xs text-[#3D4F9B] hover:underline cursor-pointer bg-transparent border-none">
                    <Maximize2 size={12} /> Full screen
                  </button>
                  <button onClick={() => setPreviewImage(null)} className="text-xs text-[var(--text-muted)] hover:underline cursor-pointer bg-transparent border-none">
                    Close preview
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {fullscreen && previewImage && (
        <div className="image-preview-backdrop" onClick={() => setFullscreen(false)}>
          <div className="image-preview-container" onClick={(e) => e.stopPropagation()}>
            <button className="image-preview-close" onClick={() => setFullscreen(false)}>&times;</button>
            <img src={previewImage} alt="Attachment" className="image-preview-img" />
          </div>
        </div>
      )}
    </div>
  );
}
