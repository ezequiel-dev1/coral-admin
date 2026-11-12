import { PRINT_COLUMNS, toPrinterText, type PrintJob, type PrintLine } from "./printAgent";
import type { Order, OrderLineItem } from "./dynamodb";

type T = (key: string, vars?: Record<string, string>) => string;

const STARS = "*".repeat(PRINT_COLUMNS);
const DOTS = ".".repeat(PRINT_COLUMNS);
const QTY_WIDTH = 5; // " 2x  " before the item name
const INDENT = " ".repeat(QTY_WIDTH);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Word-wrap `text` to `width` columns. Words longer than the width are hard-split. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let current = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (current) {
        out.push(current);
        current = "";
      }
      out.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  return out;
}

/** "Label:  value" row with the label padded so values line up. */
function field(label: string, value: string, bold = false): PrintLine {
  return { text: toPrinterText(`${`${label}:`.padEnd(10)}${value}`), bold };
}

/** ".. CATEGORY .." heading with the dots pushed to both edges, like the paper example. */
function sectionHeading(title: string): PrintLine {
  const name = toPrinterText(title.toUpperCase()).slice(0, PRINT_COLUMNS - 8);
  const inner = ` ${name} `;
  const side = Math.floor((PRINT_COLUMNS - 4 - inner.length) / 2);
  const text = `..${" ".repeat(Math.max(side, 1))}${inner}${" ".repeat(Math.max(PRINT_COLUMNS - 4 - side - inner.length, 1))}..`;
  return { text, bold: true };
}

/**
 * Builds the kitchen order ticket (what the cooks prepare), grouped by menu
 * category the way a paper comanda is grouped by course. Pure: no I/O.
 *
 * @param categoryOf resolves a menu item id to its category (unknown -> "")
 */
export function buildKitchenTicket(
  order: Order,
  categoryOf: (menuItemId: string) => string,
  t: T,
  tableText: string,
  now: Date = new Date(),
): PrintJob {
  const takeout = order.serviceType === "takeout";
  const lines: (string | PrintLine)[] = [];

  // ---- header -------------------------------------------------------------
  lines.push(STARS);
  lines.push({ text: toPrinterText(t("kitchenTicket.title").toUpperCase()), align: "center", bold: true, size: 2 });
  lines.push(DOTS);
  if (takeout) {
    lines.push({ text: toPrinterText(t("kitchenTicket.takeout").toUpperCase()), bold: true, size: 2 });
    if (order.source === "uber-eats") lines.push({ text: "*** UBER EATS ***", align: "center", bold: true });
    if (order.customerName) lines.push(field(t("kitchenTicket.customer").toUpperCase(), order.customerName, true));
  } else {
    lines.push(field(t("kitchenTicket.table").toUpperCase(), tableText, true));
  }
  lines.push(field(t("kitchenTicket.server").toUpperCase(), order.server || "-"));
  lines.push(field(t("kitchenTicket.date").toUpperCase(), formatDate(now)));
  lines.push(STARS);

  // ---- items grouped by category (order of first appearance) ----------------
  const groups = new Map<string, OrderLineItem[]>();
  for (const line of order.items) {
    const category = categoryOf(line.menuItemId) || t("kitchenTicket.otherCategory");
    const list = groups.get(category) ?? [];
    list.push(line);
    groups.set(category, list);
  }

  const textWidth = PRINT_COLUMNS - QTY_WIDTH;
  for (const [category, items] of groups) {
    lines.push("");
    lines.push(sectionHeading(category));
    lines.push("");
    for (const item of items) {
      const [first, ...rest] = wrap(toPrinterText(item.name), textWidth);
      lines.push({ text: `${`${item.quantity}x`.padStart(3)}  ${first ?? ""}`, bold: true });
      for (const r of rest) lines.push({ text: INDENT + r, bold: true });

      // Chosen options: "* Medium rare"
      for (const m of item.modifiers ?? []) {
        for (const [i, part] of wrap(toPrinterText(m.name), textWidth - 2).entries()) {
          lines.push(`${INDENT}${i === 0 ? "* " : "  "}${part}`);
        }
      }
      // Free-text instructions stand out: "!! no onions"
      if (item.instructions?.trim()) {
        for (const [i, part] of wrap(toPrinterText(item.instructions.trim()), textWidth - 3).entries()) {
          lines.push({ text: `${INDENT}${i === 0 ? "!! " : "   "}${part}`, bold: true });
        }
      }
      // Seat, so runners know where each plate goes.
      if (!takeout && item.seat) {
        lines.push(`${INDENT}(${toPrinterText(t("orders.seat"))} ${item.seat})`);
      }
    }
  }

  // ---- order-level notes + footer ---------------------------------------------
  if (order.notes?.trim()) {
    lines.push("");
    lines.push(DOTS);
    lines.push({ text: toPrinterText(t("kitchenTicket.notes").toUpperCase()), bold: true });
    for (const part of wrap(toPrinterText(order.notes.trim()), PRINT_COLUMNS)) lines.push(part);
  }
  lines.push("");
  lines.push(STARS);

  // No logo: the print agent only prints it on the register printer.
  return { printer: "kitchen", lines, feed: 4, cut: true };
}
