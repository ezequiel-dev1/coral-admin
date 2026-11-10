"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Printer, Save, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Employee,
  PayrollReceipt,
  PayrollReceiptInput,
  ReceiptPayMethod,
  getPayrollReceipt,
  savePayrollReceipt,
  markPayrollReceiptsPrinted,
  payrollReceiptId,
} from "../lib/dynamodb";
import {
  addDays,
  formatLongDate,
  formatMXN,
  isSaturday,
  parseDateStr,
  round2,
  saturdayOnOrAfter,
  toDateStr,
  weekStartOf,
} from "../lib/payroll";
import { PayrollReceiptsPrint } from "./PayrollReceiptsPrint";

const DEFAULT_DAYS = 6;

type Values = {
  daysWorked: string;
  restDaysPaid: string;
  paymentMethod: ReceiptPayMethod;
  paymentMethodOther: string;
  otherPay: string;
  otherPayNote: string;
  deductions: string;
  deductionsNote: string;
};

const EMPTY: Values = { daysWorked: String(DEFAULT_DAYS), restDaysPaid: "0", paymentMethod: "cash", paymentMethodOther: "", otherPay: "", otherPayNote: "", deductions: "", deductionsNote: "" };

function amount(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
}

/** Weekly pay receipt for one employee: Otros Pagos and Descuentos, each with a required description. */
export function EmployeePayrollDialog({
  employee,
  onClose,
}: {
  employee: Employee | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [weekEnd, setWeekEnd] = useState(() => saturdayOnOrAfter());
  const [values, setValues] = useState<Values>(EMPTY);
  const [salary, setSalary] = useState(0);
  const [loadedFor, setLoadedFor] = useState("");
  const [existing, setExisting] = useState<PayrollReceipt | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [printList, setPrintList] = useState<PayrollReceipt[] | null>(null);

  const weekStart = weekStartOf(weekEnd);
  const employeeId = employee?.id;
  const employeeSalary = employee?.weeklySalary ?? 0;
  const employeeMethod: ReceiptPayMethod = employee?.paymentMethod ?? "cash";
  const loadKey = employeeId ? `${employeeId}|${weekEnd}` : "";

  // Load the saved receipt for this employee + week, or start from defaults.
  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    getPayrollReceipt(employeeId, weekEnd)
      .catch((err) => {
        console.error("Failed to load payroll receipt:", err);
        return null;
      })
      .then((r) => {
        if (cancelled) return;
        setExisting(r);
        setSalary(r ? r.weeklySalary : employeeSalary);
        setValues(
          r
            ? {
                daysWorked: String(r.daysWorked),
                restDaysPaid: String(r.restDaysPaid ?? 0),
                paymentMethod: r.paymentMethod,
                paymentMethodOther: r.paymentMethodOther ?? "",
                otherPay: r.otherPay ? String(r.otherPay) : "",
                otherPayNote: r.otherPayNote ?? "",
                deductions: r.deductions ? String(r.deductions) : "",
                deductionsNote: r.deductionsNote ?? "",
              }
            : { ...EMPTY, paymentMethod: employeeMethod }
        );
        setTouched(false);
        setMessage("");
        setLoadedFor(`${employeeId}|${weekEnd}`);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, weekEnd, employeeSalary, employeeMethod]);

  const otherPay = amount(values.otherPay);
  const deductions = amount(values.deductions);
  const net = Math.max(0, round2(salary + otherPay - deductions));
  const otherPayMissing = otherPay > 0 && values.otherPayNote.trim() === "";
  const deductionsMissing = deductions > 0 && values.deductionsNote.trim() === "";
  const ready = loadedFor === loadKey && !!employee;
  const methodMissing = values.paymentMethod === "other" && values.paymentMethodOther.trim() === "";
  const invalid = otherPayMissing || deductionsMissing || methodMissing;

  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  function buildInput(emp: Employee): PayrollReceiptInput {
    return {
      employeeId: emp.id,
      weekEnd,
      weekStart,
      folio: `RP-${weekEnd.replace(/-/g, "")}-${emp.id.slice(-4)}`,
      employeeName: emp.fullName,
      position: emp.position,
      curp: emp.curp,
      rfc: emp.rfc,
      nss: emp.nss,
      paymentMethod: values.paymentMethod,
      paymentMethodOther: values.paymentMethod === "other" ? values.paymentMethodOther.trim() : "",
      weeklySalary: salary,
      daysWorked: Math.min(7, amount(values.daysWorked)),
      restDaysPaid: Math.min(7, amount(values.restDaysPaid)),
      otherPay,
      otherPayNote: otherPay > 0 ? values.otherPayNote.trim() : "",
      deductions,
      deductionsNote: deductions > 0 ? values.deductionsNote.trim() : "",
      net,
    };
  }

  async function save(): Promise<PayrollReceipt | null> {
    setTouched(true);
    if (!employee || invalid) return null;
    setBusy(true);
    setMessage("");
    try {
      const saved = await savePayrollReceipt(buildInput(employee), existing?.printedAt);
      setExisting(saved);
      return saved;
    } catch (err) {
      console.error("Failed to save payroll receipt:", err);
      setMessage(t("employees.saveError"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (await save()) setMessage(t("employees.payrollSaved"));
  }

  /** Step 1: show the filled-in receipt without saving anything. */
  function handlePreview() {
    setTouched(true);
    if (!employee || invalid) return;
    setPrintList([
      {
        ...buildInput(employee),
        id: payrollReceiptId(employee.id, weekEnd),
        updatedAt: new Date().toISOString(),
      },
    ]);
  }

  /** Step 2 (from the preview): save, then let the preview open the print dialog. */
  async function confirmFromPreview(): Promise<boolean> {
    const saved = await save();
    if (!saved) return false;
    setPrintList([saved]);
    return true;
  }

  function handleOpenChange(open: boolean) {
    if (open) return;
    setLoadedFor("");
    setExisting(null);
    setMessage("");
    onClose();
  }

  const numClass = "text-right";

  return (
    <>
      <Dialog open={!!employee && !printList} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-xl grid-cols-[minmax(0,1fr)] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{t("employees.payrollOf", { name: employee?.fullName ?? "" })}</DialogTitle>
          </DialogHeader>

          <div className="grid min-w-0 gap-4 py-2 [&_.grid>*]:min-w-0">
            {isSaturday() && weekEnd === toDateStr(new Date()) && (
              <div className="rounded-lg border border-[#E48664] bg-[#E48664]/10 px-3 py-2 text-sm">
                <strong>{t("employees.paydayTitle")}</strong>
              </div>
            )}

            <div className="flex items-end gap-2" style={{ flexDirection: "row" }}>
              <Button variant="outline" size="icon" onClick={() => setWeekEnd(addDays(weekEnd, -7))} aria-label={t("employees.prevWeek")}>
                <ChevronLeft />
              </Button>
              <div className="grid flex-1 gap-1">
                <Label>{t("employees.weekEnding")}</Label>
                <Input
                  type="date"
                  value={weekEnd}
                  onChange={(e) => e.target.value && setWeekEnd(saturdayOnOrAfter(parseDateStr(e.target.value)))}
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => setWeekEnd(addDays(weekEnd, 7))} aria-label={t("employees.nextWeek")}>
                <ChevronRight />
              </Button>
            </div>
            <p className="-mt-2 text-xs text-[var(--text-muted)]">
              {formatLongDate(weekStart)} – {formatLongDate(weekEnd)}
              {existing?.printedAt && <> · {t("employees.printed")}</>}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("employees.weeklySalary")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className={numClass}
                  value={salary}
                  onChange={(e) => setSalary(amount(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("employees.daysWorked")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={7}
                  step="0.5"
                  className={numClass}
                  value={values.daysWorked}
                  onChange={(e) => set({ daysWorked: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("employees.restDaysPaid")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={7}
                  step="0.5"
                  className={numClass}
                  value={values.restDaysPaid}
                  onChange={(e) => set({ restDaysPaid: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("employees.paymentMethod")}</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={values.paymentMethod}
                  onChange={(e) => set({ paymentMethod: e.target.value as ReceiptPayMethod })}
                >
                  <option value="cash">{t("employees.pay_cash")}</option>
                  <option value="transfer">{t("employees.pay_transfer")}</option>
                  <option value="other">{t("employees.pay_other")}</option>
                </select>
              </div>
            </div>
            {values.paymentMethod === "other" && (
              <div className="grid gap-2">
                <Input
                  placeholder={t("employees.descriptionRequired")}
                  aria-label={t("employees.pay_other")}
                  aria-invalid={touched && methodMissing}
                  value={values.paymentMethodOther}
                  onChange={(e) => set({ paymentMethodOther: e.target.value })}
                />
                {touched && methodMissing && <p className="text-xs text-[#E48664]">{t("employees.descriptionNeeded")}</p>}
              </div>
            )}

            <fieldset className="grid gap-2 rounded-lg border border-[var(--line)] p-3">
              <legend className="px-1 text-sm font-medium">{t("employees.otherPay")}</legend>
              <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className={numClass}
                  placeholder="0.00"
                  aria-label={t("employees.otherPay")}
                  value={values.otherPay}
                  onChange={(e) => set({ otherPay: e.target.value })}
                />
                <Input
                  placeholder={t("employees.descriptionRequired")}
                  aria-label={t("employees.description")}
                  aria-invalid={touched && otherPayMissing}
                  value={values.otherPayNote}
                  onChange={(e) => set({ otherPayNote: e.target.value })}
                />
              </div>
              {touched && otherPayMissing && <p className="text-xs text-[#E48664]">{t("employees.descriptionNeeded")}</p>}
            </fieldset>

            <fieldset className="grid gap-2 rounded-lg border border-[var(--line)] p-3">
              <legend className="px-1 text-sm font-medium">{t("employees.deductionsLabel")}</legend>
              <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className={numClass}
                  placeholder="0.00"
                  aria-label={t("employees.deductionsLabel")}
                  value={values.deductions}
                  onChange={(e) => set({ deductions: e.target.value })}
                />
                <Input
                  placeholder={t("employees.descriptionRequired")}
                  aria-label={t("employees.description")}
                  aria-invalid={touched && deductionsMissing}
                  value={values.deductionsNote}
                  onChange={(e) => set({ deductionsNote: e.target.value })}
                />
              </div>
              {touched && deductionsMissing && <p className="text-xs text-[#E48664]">{t("employees.descriptionNeeded")}</p>}
            </fieldset>

            <div className="flex items-center justify-between rounded-lg bg-[var(--table-head)] px-3 py-2">
              <span className="font-semibold">{t("employees.net")}</span>
              <span className="text-lg font-semibold">{formatMXN(net)}</span>
            </div>
            {message && <p className="text-sm">{message}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>{t("employees.cancel")}</Button>
            <Button variant="outline" onClick={handleSave} disabled={busy || !ready}>
              <Save data-icon="inline-start" />
              {t("employees.save")}
            </Button>
            <Button onClick={handlePreview} disabled={busy || !ready}>
              <Printer data-icon="inline-start" />
              {t("employees.saveAndPrint")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printList && (
        <PayrollReceiptsPrint
          receipts={printList}
          onClose={() => setPrintList(null)}
          onConfirm={confirmFromPreview}
          onPrinted={async () => {
            try {
              await markPayrollReceiptsPrinted(printList.map((r) => payrollReceiptId(r.employeeId, r.weekEnd)));
              setExisting((e) => (e ? { ...e, printedAt: new Date().toISOString() } : e));
            } catch (err) {
              console.error("Failed to mark receipt printed:", err);
            }
          }}
        />
      )}
    </>
  );
}
