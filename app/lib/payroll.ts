/** Helpers for weekly payroll: Saturday week-ends and amounts in Spanish words. */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse YYYY-MM-DD as a local date (avoids the UTC shift of `new Date(str)`). */
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** The Saturday on or after the given date (the pay-week end). */
export function saturdayOnOrAfter(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return toDateStr(d);
}

/** The Sunday that starts the week ending on `weekEnd` (a Saturday). */
export function weekStartOf(weekEnd: string): string {
  const d = parseDateStr(weekEnd);
  d.setDate(d.getDate() - 6);
  return toDateStr(d);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function isSaturday(date: Date = new Date()): boolean {
  return date.getDay() === 6;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMXN(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
}

export function formatLongDate(dateStr: string): string {
  return parseDateStr(dateStr).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const UNITS = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
  "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés",
  "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const TENS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos",
];

function below1000(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (rest) {
    if (rest < 30) parts.push(UNITS[rest]);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u ? `${TENS[t]} y ${UNITS[u]}` : TENS[t]);
    }
  }
  return parts.join(" ");
}

function integerToWords(n: number): string {
  if (n === 0) return "cero";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "un millón" : `${integerToWords(millions)} millones`);
  if (thousands) parts.push(thousands === 1 ? "mil" : `${below1000(thousands).replace(/uno$/, "un")} mil`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** e.g. 1250.5 -> "MIL DOSCIENTOS CINCUENTA PESOS 50/100 M.N." */
export function amountInWords(amount: number): string {
  const value = Math.max(0, round2(amount));
  const pesos = Math.floor(value);
  const cents = Math.round((value - pesos) * 100);
  let words = integerToWords(pesos);
  // "un millón de pesos", "dos millones de pesos"
  const connector = pesos >= 1_000_000 && pesos % 1_000_000 === 0 ? " de" : "";
  // Before "pesos", a trailing "uno" becomes "un" (treinta y un pesos).
  words = words.replace(/uno$/, "un");
  return `${words}${connector} ${pesos === 1 ? "peso" : "pesos"} ${pad(cents)}/100 M.N.`.toUpperCase();
}
