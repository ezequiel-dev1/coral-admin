"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
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
import { Plus, Pencil, Trash2, Paperclip, Banknote, Eye, ExternalLink, X } from "lucide-react";
import {
  fetchEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  Employee,
  EmployeeInput,
  EmployeeDocument,
  EmployeeDocumentType,
  EmergencyContact,
} from "../lib/dynamodb";
import { uploadEmployeeDocument, getObjectUrl } from "../lib/receipts";
import { formatMXN, toDateStr } from "../lib/payroll";
import { EmployeeDocumentsViewer } from "./EmployeeDocumentsViewer";
import { EmployeePayrollDialog } from "./EmployeePayrollDialog";

const DOC_TYPES: EmployeeDocumentType[] = [
  "actaNacimiento",
  "cedulaProfesional",
  "certificadoEstudios",
  "comprobanteDomicilio",
  "constanciaRegistroPoblacion",
  "constanciaSituacionFiscal",
  "contactosEmergencia",
  "cuentaBanco",
  "ine",
  "manifestacionActividadAdicional",
  "numeroSeguroSocial",
  "solicitudEmpleo",
];

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function emptyForm(): EmployeeInput {
  return {
    fullName: "",
    position: "",
    phone: "",
    address: "",
    emergencyContacts: [],
    curp: "",
    rfc: "",
    nss: "",
    hireDate: toDateStr(new Date()),
    weeklySalary: 0,
    paymentMethod: "cash",
    clabe: "",
    active: true,
    notes: "",
    documents: [],
  };
}

type PendingDoc = { file: File; type: EmployeeDocumentType };

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function EmployeesPage() {
  const { t } = useTranslation();
  const [payrollFor, setPayrollFor] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeInput>(emptyForm());
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [newDocType, setNewDocType] = useState<EmployeeDocumentType>("ine");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<Employee | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setEmployees(await fetchEmployees());
    } catch (err) {
      console.error("Failed to fetch employees:", err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setPending([]);
    setError("");
    setShowModal(true);
  }

  function openEdit(e: Employee) {
    setEditing(e);
    const { id: _id, createdAt: _createdAt, ...rest } = e;
    void _id;
    void _createdAt;
    setForm({ ...rest, documents: [...(e.documents ?? [])] });
    setPending([]);
    setError("");
    setShowModal(true);
  }

  const canSave = form.fullName.trim() !== "" && form.weeklySalary >= 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const payload: EmployeeInput = {
        ...form,
        fullName: form.fullName.trim(),
        position: form.position.trim(),
        curp: form.curp.trim().toUpperCase(),
        rfc: form.rfc.trim().toUpperCase(),
        // Drop blank rows left behind by "Add contact".
        emergencyContacts: form.emergencyContacts
          .map((c) => ({ name: c.name.trim(), relationship: c.relationship.trim(), phone: c.phone.trim() }))
          .filter((c) => c.name || c.phone),
      };
      // Save first (to get an id), then upload the staged documents.
      let saved: Employee;
      if (editing) {
        saved = { ...editing, ...payload };
        await updateEmployee(saved);
      } else {
        saved = await createEmployee(payload);
      }
      if (pending.length > 0) {
        const uploaded: EmployeeDocument[] = [];
        for (const p of pending) {
          const key = await uploadEmployeeDocument(saved.id, p.file);
          uploaded.push({
            key,
            name: p.file.name,
            contentType: p.file.type || "application/octet-stream",
            type: p.type,
            uploadedAt: new Date().toISOString(),
          });
        }
        await updateEmployee({ ...saved, documents: [...saved.documents, ...uploaded] });
      }
      setShowModal(false);
      await load();
    } catch (err) {
      console.error("Failed to save employee:", err);
      setError(t("employees.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(e: Employee) {
    if (!confirm(t("employees.confirmDelete", { name: e.fullName }))) return;
    try {
      await deleteEmployee(e.id);
      await load();
    } catch (err) {
      console.error("Failed to delete employee:", err);
    }
  }

  async function openDocument(doc: EmployeeDocument) {
    try {
      window.open(await getObjectUrl(doc.key), "_blank", "noopener");
    } catch (err) {
      console.error("Failed to open document:", err);
    }
  }

  const columns: ColumnDef<Employee, unknown>[] = useMemo(
    () => [
      { accessorKey: "fullName", header: t("employees.fullName"), size: 220 },
      { accessorKey: "position", header: t("employees.position"), size: 160 },
      {
        accessorKey: "weeklySalary",
        header: t("employees.weeklySalary"),
        size: 140,
        cell: ({ getValue }) => formatMXN(Number(getValue()) || 0),
      },
      {
        accessorKey: "paymentMethod",
        header: t("employees.paymentMethod"),
        size: 130,
        cell: ({ getValue }) => t(`employees.pay_${getValue() as string}`),
      },
      { accessorKey: "phone", header: t("employees.phone"), size: 140 },
      {
        id: "documents",
        header: t("employees.documents"),
        size: 110,
        cell: ({ row }) => {
          const count = row.original.documents?.length ?? 0;
          return (
            <span className="inline-flex items-center gap-1">
              <Paperclip size={14} />
              {count}
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={count === 0}
                onClick={() => setViewing(row.original)}
                aria-label={t("employees.viewDocuments")}
                title={t("employees.viewDocuments")}
              >
                <Eye />
              </Button>
            </span>
          );
        },
      },
      {
        accessorKey: "active",
        header: t("employees.status"),
        size: 110,
        cell: ({ getValue }) => (
          <Badge variant={getValue() ? "secondary" : "outline"}>
            {getValue() ? t("employees.active") : t("employees.inactive")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        size: 120,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!row.original.active}
              onClick={() => setPayrollFor(row.original)}
              aria-label={t("employees.payroll")}
              title={t("employees.payroll")}
            >
              <Banknote />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(row.original)} aria-label="Edit">
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(row.original)} aria-label="Delete">
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const set = <K extends keyof EmployeeInput>(k: K, v: EmployeeInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>{t("employees.title")}</h1>
          <p className="page-subtitle">{t("employees.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2" style={{ flexDirection: "row" }}>
          <Button onClick={openCreate}>
            <Plus data-icon="inline-start" />
            {t("employees.addItem")}
          </Button>
        </div>
      </div>

      <CoralDataGrid
        data={employees}
        columns={columns}
        loading={loading}
        height={650}
        defaultPageSize={100}
        defaultSorting={[{ id: "fullName", desc: false }]}
      />

      <EmployeePayrollDialog employee={payrollFor} onClose={() => setPayrollFor(null)} />

      <EmployeeDocumentsViewer employee={viewing} onClose={() => setViewing(null)} />

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden grid-cols-[minmax(0,1fr)]">
          <DialogHeader>
            <DialogTitle>{editing ? t("employees.editItem") : t("employees.addItem")}</DialogTitle>
          </DialogHeader>
          <div className="grid min-w-0 gap-4 py-2 [&_.grid>*]:min-w-0">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("employees.fullName")}</Label>
                <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>{t("employees.position")}</Label>
                <Input value={form.position} onChange={(e) => set("position", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>{t("employees.weeklySalary")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.weeklySalary}
                  onChange={(e) => set("weeklySalary", num(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("employees.paymentMethod")}</Label>
                <select
                  className={selectClass}
                  value={form.paymentMethod}
                  onChange={(e) => set("paymentMethod", e.target.value as Employee["paymentMethod"])}
                >
                  <option value="cash">{t("employees.pay_cash")}</option>
                  <option value="transfer">{t("employees.pay_transfer")}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{t("employees.hireDate")}</Label>
                <Input type="date" value={form.hireDate} onChange={(e) => set("hireDate", e.target.value)} />
              </div>
            </div>
            {form.paymentMethod === "transfer" && (
              <div className="grid gap-2">
                <Label>{t("employees.clabe")}</Label>
                <Input inputMode="numeric" maxLength={18} value={form.clabe} onChange={(e) => set("clabe", e.target.value)} />
              </div>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>CURP</Label>
                <Input maxLength={18} value={form.curp} onChange={(e) => set("curp", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>RFC</Label>
                <Input maxLength={13} value={form.rfc} onChange={(e) => set("rfc", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>NSS</Label>
                <Input maxLength={11} value={form.nss} onChange={(e) => set("nss", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>{t("employees.phone")}</Label>
                <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div className="col-span-2 grid gap-2">
                <Label>{t("employees.address")}</Label>
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="mb-0">{t("employees.emergencyContacts")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => set("emergencyContacts", [...form.emergencyContacts, { name: "", relationship: "", phone: "" }])}
                >
                  <Plus data-icon="inline-start" />
                  {t("employees.addContact")}
                </Button>
              </div>
              {form.emergencyContacts.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">{t("employees.noContacts")}</p>
              )}
              {form.emergencyContacts.map((c, i) => {
                const update = (patch: Partial<EmergencyContact>) =>
                  set("emergencyContacts", form.emergencyContacts.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <Input
                      placeholder={t("employees.contactName")}
                      aria-label={t("employees.contactName")}
                      value={c.name}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                    <Input
                      placeholder={t("employees.relationship")}
                      aria-label={t("employees.relationship")}
                      value={c.relationship}
                      onChange={(e) => update({ relationship: e.target.value })}
                    />
                    <Input
                      type="tel"
                      placeholder={t("employees.phone")}
                      aria-label={t("employees.phone")}
                      value={c.phone}
                      onChange={(e) => update({ phone: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => set("emergencyContacts", form.emergencyContacts.filter((_, j) => j !== i))}
                      aria-label={t("employees.remove")}
                    >
                      <X />
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="grid gap-2">
              <Label>{t("employees.documents")}</Label>
              <ul className="grid gap-1 text-sm">
                {form.documents.map((d) => (
                  <li key={d.key} className="flex items-center gap-2">
                    <Badge variant="secondary" className="shrink-0">{t(`employees.doc_${d.type}`)}</Badge>
                    <span className="min-w-0 flex-1 truncate" title={d.name}>{d.name}</span>
                    <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => openDocument(d)} aria-label={t("employees.open")}>
                      <ExternalLink />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() => set("documents", form.documents.filter((x) => x.key !== d.key))}
                      aria-label={t("employees.remove")}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
                {pending.map((p, i) => (
                  <li key={`${p.file.name}-${i}`} className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0">{t(`employees.doc_${p.type}`)}</Badge>
                    <span className="min-w-0 flex-1 truncate" title={p.file.name}>{p.file.name}</span>
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">{t("employees.pendingUpload")}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() => setPending(pending.filter((_, j) => j !== i))}
                      aria-label={t("employees.remove")}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2" style={{ flexDirection: "row" }}>
                <select
                  className={selectClass}
                  style={{ width: "auto" }}
                  value={newDocType}
                  onChange={(e) => setNewDocType(e.target.value as EmployeeDocumentType)}
                  aria-label={t("employees.docType")}
                >
                  {DOC_TYPES.map((d) => (
                    <option key={d} value={d}>{t(`employees.doc_${d}`)}</option>
                  ))}
                </select>
                <Input
                  className="min-w-0 flex-1"
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    setPending((p) => [...p, ...files.map((file) => ({ file, type: newDocType }))]);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
              {t("employees.active")}
            </label>
            <div className="grid gap-2">
              <Label>{t("employees.notes")}</Label>
              <textarea
                className="w-full min-h-[70px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-[#E48664]">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t("employees.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !canSave}>
              {saving ? t("employees.saving") : t("employees.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
