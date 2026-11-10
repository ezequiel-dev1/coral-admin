"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import { PayrollReceipt } from "../lib/dynamodb";
import { amountInWords, formatMXN, parseDateStr, round2 } from "../lib/payroll";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** "__ / __ / ____" with the date parts written on the blanks. */
function DateBlanks({ dateStr }: { dateStr: string }) {
  const d = parseDateStr(dateStr);
  return (
    <>
      <span className="pr-u">{two(d.getDate())}</span>
      <span className="pr-sep">/</span>
      <span className="pr-u">{two(d.getMonth() + 1)}</span>
      <span className="pr-sep">/</span>
      <span className="pr-u" style={{ minWidth: 76 }}>{d.getFullYear()}</span>
    </>
  );
}

/** One "Recibo de pago de salarios" page, laid out like the Coral template. */
function ReceiptView({ r }: { r: PayrollReceipt }) {
  const gross = round2(r.weeklySalary + r.otherPay);
  const method = r.paymentMethod;
  const amount = (n: number) => (
    <>
      $ <span className="pr-u">{formatMXN(n).replace("$", "")}</span>
    </>
  );

  return (
    <section className="pr-sheet">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/coral-logo-horizontal.png" alt="Coral Reef & Beef" className="pr-logo" />
      <h2 className="pr-title">RECIBO DE PAGO DE SALARIOS</h2>

      <div className="pr-top">
        <div>Folio: <span className="pr-u lg">{r.folio}</span></div>
        <div>Fecha de pago: <DateBlanks dateStr={r.weekEnd} /></div>
      </div>

      <div className="pr-sec">DATOS DEL TRABAJADOR</div>
      <div className="pr-line w82">Nombre completo: <span className="pr-uf">{r.employeeName}</span></div>
      <div className="pr-line w82">Puesto: <span className="pr-uf">{r.position}</span></div>
      <div className="pr-row">
        <div>
          Periodo de pago: del <DateBlanks dateStr={r.weekStart} /> &nbsp;al <DateBlanks dateStr={r.weekEnd} />
        </div>
      </div>
      <div className="pr-row">
        <div>Días efectivamente trabajados: <span className="pr-u">{r.daysWorked}</span></div>
        <div>Días de descanso pagados: <span className="pr-u">{r.restDaysPaid ?? 0}</span></div>
      </div>

      <div className="pr-sec">DESGLOSE DEL PAGO</div>
      <table className="pr-table">
        <thead>
          <tr><th>Concepto</th><th>Importe (MXN)</th></tr>
        </thead>
        <tbody>
          <tr><td>Sueldo ordinario correspondiente al periodo</td><td>{amount(r.weeklySalary)}</td></tr>
          <tr>
            <td>Otros pagos (especificar): <span className="pr-u desc">{r.otherPay > 0 ? r.otherPayNote : "\u00A0"}</span></td>
            <td>{amount(r.otherPay)}</td>
          </tr>
          <tr><td>Total de percepciones (bruto)</td><td>{amount(gross)}</td></tr>
          <tr>
            <td>Descuentos (especificar): <span className="pr-u desc">{r.deductions > 0 ? r.deductionsNote : "\u00A0"}</span></td>
            <td>{amount(r.deductions)}</td>
          </tr>
          <tr className="pr-total"><td>TOTAL EFECTIVAMENTE RECIBIDO (NETO)</td><td>{amount(r.net)}</td></tr>
        </tbody>
      </table>

      <div className="pr-pay">
        <span>Forma de pago:</span>
        <span><span className="pr-box">{method === "cash" ? "✕" : ""}</span>Efectivo</span>
        <span><span className="pr-box">{method === "transfer" ? "✕" : ""}</span>Transferencia bancaria</span>
        <span>
          <span className="pr-box">{method === "other" ? "✕" : ""}</span>Otra:{" "}
          <span className="pr-u md">{method === "other" ? r.paymentMethodOther : "\u00A0"}</span>
        </span>
      </div>
      <div className="pr-line w76" style={{ marginBottom: 24 }}>
        Cantidad recibida con letra: <span className="pr-uf">{amountInWords(r.net)}</span>
      </div>

      <p className="pr-statement">
        Yo, <span className="pr-uf">{r.employeeName}</span>, hago constar que recibí la cantidad indicada como
        “TOTAL EFECTIVAMENTE RECIBIDO (NETO)” por concepto de pago de salarios y demás conceptos expresamente
        desglosados, correspondientes al periodo señalado.
      </p>
      <p className="pr-statement">
        Esta constancia acredita únicamente el pago aquí descrito y no implica renuncia a derechos laborales,
        prestaciones o seguridad social, ni conformidad con conceptos no señalados.
      </p>

      <div className="pr-sign">
        <div><span />Firma de quien recibe (trabajador/a)</div>
        <div><span />Nombre y firma de quien entrega</div>
      </div>
    </section>
  );
}

/**
 * Full-screen receipt preview, one Letter page per receipt. The primary button
 * runs `onConfirm` (e.g. save the data) and, if it returns true, opens the
 * browser print dialog.
 */
export function PayrollReceiptsPrint({
  receipts,
  onClose,
  onConfirm,
  onPrinted,
  confirmLabel = "Guardar e imprimir",
}: {
  receipts: PayrollReceipt[];
  onClose: () => void;
  /** Return true to continue to the print dialog. */
  onConfirm: () => Promise<boolean>;
  onPrinted?: () => void;
  confirmLabel?: string;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleConfirm() {
    setBusy(true);
    try {
      if (!(await onConfirm())) return;
      // Let React flush any receipt update from the save before printing.
      await new Promise((resolve) => setTimeout(resolve, 50));
      window.print();
      onPrinted?.();
    } finally {
      setBusy(false);
    }
  }

  const overlay = (
    <div className="pm-overlay pr-overlay" role="dialog" aria-modal="true" aria-label="Vista previa del recibo">
      <div className="pm-toolbar">
        <button type="button" className="pm-btn pm-btn-primary" onClick={handleConfirm} disabled={busy}>
          <Printer size={16} />
          {busy ? "Guardando..." : confirmLabel}
        </button>
        <button type="button" className="pm-btn" onClick={onClose} aria-label="Cerrar">
          <X size={16} />
          Cerrar
        </button>
      </div>
      <div className="pm-scroll">
        {receipts.map((r) => (
          <ReceiptView key={r.id} r={r} />
        ))}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
