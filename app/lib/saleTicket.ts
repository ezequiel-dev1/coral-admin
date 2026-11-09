import { PRINT_COLUMNS, toPrinterText, type PrintJob, type PrintLine } from "./printAgent";
import { wrap } from "./kitchenTicket";
import { tableName } from "./tableName";
import type { Order } from "./dynamodb";

type T = (key: string, vars?: Record<string, string>) => string;

export const RESTAURANT = {
  name: "REEF & BEEF",
  addressLines: ["Gobernador Ibarra 9806,", "America, 22044 Tijuana, B.C."],
  phone: "664 800 7789",
  email: "coralreefandbeef@gmail.com",
};

/**
 * Print the Coral logo (bundled in the print agent) at the top of sale receipts.
 * Set to false to turn it off; the text name is printed instead.
 */
export const SALE_TICKET_LOGO = true;

const DASHES = "-".repeat(PRINT_COLUMNS);
const EQUALS = "=".repeat(PRINT_COLUMNS);

// Item table: product | qty | unit price | total (adds up to PRINT_COLUMNS with 3 gaps).
const W_QTY = 4;
const W_PRICE = 10;
const W_TOTAL = 10;
const W_PRODUCT = PRINT_COLUMNS - W_QTY - W_PRICE - W_TOTAL - 3;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Label ........ value" on one line. */
function row(label: string, value: string, bold = false, width = PRINT_COLUMNS): PrintLine {
  const left = toPrinterText(label);
  const right = toPrinterText(value);
  const gap = Math.max(width - left.length - right.length, 1);
  return { text: `${left}${" ".repeat(gap)}${right}`, bold };
}

/** "Label:  value" with the label padded so values line up. */
function field(label: string, value: string, bold = false): PrintLine {
  return { text: toPrinterText(`${`${label}:`.padEnd(10)}${value}`), bold };
}

export type SaleTicketOptions = {
  /** Signed-in user, used when the order has no stored cashier (e.g. card payments). */
  cashier: string;
  /** Current MXN-per-USD rate, used when the order has no stored rate. */
  exchangeRate?: number;
  now?: Date;
};

/**
 * One printed sale ticket. `copy` adds a banner so the restaurant's record
 * copy can't be mistaken for the customer's. Pure: no I/O.
 */
export function buildSaleTicket(
  order: Order,
  t: T,
  opts: SaleTicketOptions,
  copy: "customer" | "restaurant",
): PrintJob {
  const now = opts.now ?? new Date();
  const currency = order.currency ?? "MXN";
  const rate = order.exchangeRate ?? opts.exchangeRate;
  // Order amounts are stored in MXN; USD tickets show them converted at the sale's rate.
  const convert = (mxn: number) => (currency === "USD" && rate ? round2(mxn / rate) : mxn);

  const lines: (string | PrintLine)[] = [];

  // ---- header -------------------------------------------------------------
  if (copy === "restaurant") {
    lines.push({ text: toPrinterText(t("saleTicket.restaurantCopy").toUpperCase()), align: "center", bold: true });
    lines.push(EQUALS);
  }
  // The logo already carries the name; print it as text only without the logo.
  if (!SALE_TICKET_LOGO) lines.push({ text: RESTAURANT.name, align: "center", bold: true, size: 2 });
  for (const a of RESTAURANT.addressLines) lines.push({ text: toPrinterText(a), align: "center" });
  lines.push("");
  lines.push(field(t("saleTicket.sale"), order.saleCode ?? order.id, true));
  lines.push(field(t("saleTicket.cashier"), order.cashier || opts.cashier || "-"));
  lines.push(field(t("saleTicket.server"), order.server || "-"));
  if (order.serviceType === "takeout") {
    lines.push(field(t("saleTicket.type"), t("saleTicket.takeout")));
  } else if (order.tableLabel) {
    lines.push(field(t("saleTicket.table"), tableName(t, order.tableLabel)));
  }
  lines.push(field(t("saleTicket.statusLabel"), t(`saleTicket.state.${order.status}`)));
  lines.push(field(t("saleTicket.date"), formatDate(order.paidAt ? new Date(order.paidAt) : now)));
  lines.push(
    row(
      `${`${t("saleTicket.currency")}:`.padEnd(10)}${currency}`,
      rate ? `${t("saleTicket.exchangeRate")} ${money(rate)}` : "",
    ),
  );
  lines.push(field(t("saleTicket.payment"), t(`saleTicket.pay.${order.paymentMethod}`).toUpperCase(), true));

  // ---- items --------------------------------------------------------------
  lines.push(DASHES);
  lines.push({
    text:
      toPrinterText(t("saleTicket.product")).padEnd(W_PRODUCT) +
      " " +
      toPrinterText(t("saleTicket.qty")).padStart(W_QTY) +
      " " +
      toPrinterText(t("saleTicket.unitPrice")).padStart(W_PRICE) +
      " " +
      toPrinterText(t("saleTicket.lineTotal")).padStart(W_TOTAL),
    bold: true,
  });
  lines.push(DASHES);
  for (const item of order.items) {
    const [first, ...rest] = wrap(toPrinterText(item.name), W_PRODUCT);
    lines.push(
      (first ?? "").padEnd(W_PRODUCT) +
        " " +
        String(item.quantity).padStart(W_QTY) +
        " " +
        money(convert(item.unitPrice)).padStart(W_PRICE) +
        " " +
        money(convert(round2(item.unitPrice * item.quantity))).padStart(W_TOTAL),
    );
    for (const r of rest) lines.push(r);
    for (const m of item.modifiers ?? []) {
      for (const part of wrap(toPrinterText(`+ ${m.name}`), W_PRODUCT - 1)) lines.push(` ${part}`);
    }
  }
  lines.push(DASHES);

  // ---- totals -------------------------------------------------------------
  lines.push(row(t("saleTicket.subtotal"), money(convert(order.subtotal))));
  if ((order.discount ?? 0) > 0) lines.push(row(t("saleTicket.discount"), `-${money(convert(order.discount ?? 0))}`));
  if ((order.fee ?? 0) > 0) lines.push(row(order.feeLabel || t("saleTicket.fee"), money(convert(order.fee ?? 0))));
  if (order.tip > 0) lines.push(row(t("saleTicket.tip"), money(convert(order.tip))));
  // Double size halves the columns, so build this row for 24.
  lines.push({
    ...row(`${t("saleTicket.total")} ${currency}`, money(convert(order.total)), true, PRINT_COLUMNS / 2),
    size: 2,
  });

  if (order.paymentMethod === "cash") {
    const total = convert(order.total);
    const paid = order.amountTendered ?? total;
    const change = order.change ?? round2(Math.max(paid - total, 0));
    lines.push("");
    lines.push(row(t("saleTicket.paid"), money(paid)));
    lines.push(row(t("saleTicket.change"), money(change), true));
  }

  // ---- footer ---------------------------------------------------------------
  lines.push("");
  lines.push(DASHES);
  lines.push({ text: toPrinterText(t("saleTicket.thanks")), align: "center", bold: true });
  lines.push({ text: toPrinterText(t("saleTicket.suggestions")), align: "center" });
  lines.push({ text: RESTAURANT.phone, align: "center" });
  lines.push({ text: RESTAURANT.email, align: "center" });
  lines.push("");
  lines.push({ text: toPrinterText(`${t("saleTicket.printed")}: ${formatDate(now)}`), align: "center" });

  // Copy note at the very bottom so the two tickets are easy to tell apart.
  lines.push("");
  lines.push(EQUALS);
  lines.push({
    text: toPrinterText(t(copy === "customer" ? "saleTicket.customerCopy" : "saleTicket.restaurantCopy").toUpperCase()),
    align: "center",
    bold: true,
    size: 2,
  });
  lines.push(EQUALS);

  // Extra blank lines so the last row clears the cutter before the paper is cut.
  // The logo is only valid on the register printer, so `printer` must stay "register".
  return { printer: "register", lines, feed: 4, cut: true, ...(SALE_TICKET_LOGO && { logo: true }) };
}

/**
 * Customer copy first, then the restaurant's record copy. With `openDrawer`
 * the cash drawer pulses on the first job only, so it opens once per sale.
 */
export function buildSaleTickets(
  order: Order,
  t: T,
  opts: SaleTicketOptions,
  openDrawer = false,
): PrintJob[] {
  const customer = buildSaleTicket(order, t, opts, "customer");
  return [
    openDrawer ? { ...customer, openDrawer: true } : customer,
    buildSaleTicket(order, t, opts, "restaurant"),
  ];
}
