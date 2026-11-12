import { PutCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { TABLES } from "./tables";
import {
  getClient,
  getOrder,
  nextSaleCode,
  type MenuItem,
  type ModifierGroup,
  type Order,
  type OrderLineItem,
  type OrderModifier,
  type OrderStatus,
  type ServiceType,
  type VoidedLine,
} from "./dynamodb";

// Menu prices already include IVA, so no tax is added on top (same as Checkout).
export const TAX_RATE = 0;

export const TAKEOUT_LABEL = "Takeout";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Parse a menu price string like "$12.00" or "12" into a number. */
export function parsePrice(price: string): number {
  const num = parseFloat((price || "").replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
}

export function newLineId(): string {
  return `ln-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Variants / modifiers
// ---------------------------------------------------------------------------

/**
 * Option groups offered for a menu item. They are configured per item on the
 * Menu Items page; an item with none simply has no options.
 */
export function getModifierGroups(item: MenuItem): ModifierGroup[] {
  return item.modifierGroups ?? [];
}

/** Stable key so identical lines (same item + options + notes + seat) can merge. */
export function lineSignature(l: OrderLineItem): string {
  const mods = (l.modifiers ?? []).map((m) => `${m.groupId}:${m.id}`).sort().join(",");
  return [l.menuItemId, mods, (l.instructions ?? "").trim(), l.seat ?? ""].join("|");
}

export function modifiersTotal(mods: OrderModifier[]): number {
  return round2(mods.reduce((s, m) => s + m.price, 0));
}

/** Give legacy lines (created by Checkout) a stable lineId. */
export function normalizeLines(items: OrderLineItem[]): OrderLineItem[] {
  return items.map((l, i) => (l.lineId ? l : { ...l, lineId: `legacy-${i}-${l.menuItemId}` }));
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export type Adjustments = {
  discountType: "percent" | "amount";
  discountValue: number;
  fee: number;
};

export type Totals = {
  subtotal: number;
  discount: number;
  fee: number;
  tax: number;
  total: number;
};

/**
 * subtotal  = sum of line prices (modifiers included)
 * discount  = percent of subtotal or a fixed amount, capped at the subtotal
 * tax       = TAX_RATE on (subtotal - discount + fee)
 * total     = subtotal - discount + fee + tax
 */
export function computeTotals(items: OrderLineItem[], adj: Adjustments): Totals {
  const subtotal = round2(items.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const rawDiscount =
    adj.discountType === "percent"
      ? subtotal * (Math.min(Math.max(adj.discountValue, 0), 100) / 100)
      : Math.max(adj.discountValue, 0);
  const discount = round2(Math.min(rawDiscount, subtotal));
  const fee = round2(Math.max(adj.fee, 0));
  const taxable = subtotal - discount + fee;
  const tax = round2(taxable * TAX_RATE);
  const total = round2(taxable + tax);
  return { subtotal, discount, fee, tax, total };
}

export function adjustmentsOf(order: Order): Adjustments {
  return {
    discountType: order.discountType ?? "amount",
    discountValue: order.discountValue ?? 0,
    fee: order.fee ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Strip undefined values (the document client rejects them). */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Create or fully replace an order that is still open/held (or new). */
export async function saveOrder(input: Order): Promise<Order> {
  // First save of an order assigns its sale code; later saves keep it.
  const order = input.saleCode ? input : { ...input, saleCode: await nextSaleCode() };
  const docClient = await getClient();
  await docClient.send(
    new PutCommand({
      TableName: TABLES.orders,
      Item: clean(order),
      ConditionExpression: "attribute_not_exists(id) OR #s = :open OR #s = :held",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":open": "open" as OrderStatus,
        ":held": "held" as OrderStatus,
      },
    })
  );
  return order;
}

export function blankOrder(
  serviceType: ServiceType,
  tableLabel: string,
  server: string
): Order {
  const now = Date.now();
  return {
    id: `ord-${now}`,
    createdAt: new Date(now).toISOString(),
    tableLabel,
    server,
    items: [],
    subtotal: 0,
    tax: 0,
    tip: 0,
    total: 0,
    processingFee: 0,
    netAmount: 0,
    status: "open",
    paymentMethod: "cash",
    notes: "",
    serviceType,
  };
}

/** Rebuild an order's money fields from its lines + adjustments. */
export function withTotals(order: Order): Order {
  const t = computeTotals(order.items, adjustmentsOf(order));
  return { ...order, subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total, fee: t.fee };
}

export async function setHeld(id: string, held: boolean): Promise<void> {
  const docClient = await getClient();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.orders,
      Key: { id },
      ConditionExpression: held ? "#s = :open" : "#s = :held",
      UpdateExpression: held ? "SET #s = :held, heldAt = :now" : "SET #s = :open REMOVE heldAt",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: held
        ? { ":open": "open", ":held": "held", ":now": new Date().toISOString() }
        : { ":open": "open", ":held": "held" },
    })
  );
}

/** Mark open orders as ready (finished cooking). Orders that are no longer open are skipped. */
export async function markOrdersReady(ids: string[]): Promise<void> {
  const docClient = await getClient();
  const now = new Date().toISOString();
  await Promise.all(
    ids.map((id) =>
      docClient.send(
        new UpdateCommand({
          TableName: TABLES.orders,
          Key: { id },
          ConditionExpression: "#s = :open",
          UpdateExpression: "SET readyAt = :now, statusHistory = list_append(if_not_exists(statusHistory, :empty), :event)",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":open": "open", ":now": now, ":empty": [], ":event": [{ status: "ready", at: now }] },
        })
      )
    )
  );
}

export async function cancelOrder(id: string, reason: string): Promise<void> {
  const docClient = await getClient();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.orders,
      Key: { id },
      ConditionExpression: "#s = :open OR #s = :held",
      UpdateExpression: "SET #s = :cancelled, cancelReason = :reason REMOVE heldAt",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":open": "open",
        ":held": "held",
        ":cancelled": "cancelled",
        ":reason": reason,
      },
    })
  );
}

/**
 * Reopen a cancelled order, or a paid order that was not paid by card (card
 * payments are settled in Stripe and must be refunded there instead).
 */
export async function reopenOrder(order: Order): Promise<void> {
  if (order.status === "paid" && order.paymentMethod === "card") {
    throw new Error("Card payments cannot be reopened. Refund them in Stripe.");
  }
  if (order.status !== "paid" && order.status !== "cancelled") {
    throw new Error("Only paid or cancelled orders can be reopened.");
  }
  const docClient = await getClient();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.orders,
      Key: { id: order.id },
      ConditionExpression: "#s = :current",
      UpdateExpression:
        "SET #s = :open, tip = :zero, netAmount = :zero REMOVE paidAt, cancelReason",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":current": order.status, ":open": "open", ":zero": 0 },
    })
  );
}

/** Move a line to the order's voided list (kept for audit, never charged). */
export function voidLine(order: Order, lineId: string, reason: string): Order {
  const line = order.items.find((l) => l.lineId === lineId);
  if (!line) return order;
  const voided: VoidedLine = { ...line, voidReason: reason, voidedAt: new Date().toISOString() };
  return withTotals({
    ...order,
    items: order.items.filter((l) => l.lineId !== lineId),
    voidedItems: [...(order.voidedItems ?? []), voided],
  });
}

/**
 * Split an order into sub-orders. `groups` holds the lines for each sub-order.
 * Percent discounts carry over; fixed discounts are prorated by subtotal; the
 * fee lands on the first sub-order. The original is replaced.
 */
export async function splitOrder(order: Order, groups: OrderLineItem[][]): Promise<Order[]> {
  const live = await getOrder(order.id);
  if (!live || (live.status !== "open" && live.status !== "held")) {
    throw new Error("Order is no longer open; cannot split.");
  }
  const nonEmpty = groups.filter((g) => g.length > 0);
  if (nonEmpty.length < 2) throw new Error("A split needs at least two non-empty sub-orders.");

  const grossTotal = nonEmpty.reduce(
    (s, g) => s + g.reduce((a, l) => a + l.unitPrice * l.quantity, 0),
    0
  );
  const now = Date.now();
  const subs: Order[] = nonEmpty.map((items, i) => {
    const gross = items.reduce((a, l) => a + l.unitPrice * l.quantity, 0);
    const discountValue =
      order.discountType === "percent"
        ? order.discountValue ?? 0
        : round2(((order.discountValue ?? 0) * gross) / (grossTotal || 1));
    return withTotals({
      ...order,
      id: `${order.id}-s${i + 1}-${now}`,
      createdAt: new Date(now + i).toISOString(),
      items,
      splitLabel: `Guest ${i + 1}`,
      splitFrom: order.id,
      discountValue,
      fee: i === 0 ? order.fee ?? 0 : 0,
      voidedItems: i === 0 ? order.voidedItems : undefined,
      notes: order.notes,
    });
  });

  const docClient = await getClient();
  for (const sub of subs) {
    await docClient.send(new PutCommand({ TableName: TABLES.orders, Item: clean(sub) }));
  }
  await docClient.send(new DeleteCommand({ TableName: TABLES.orders, Key: { id: order.id } }));
  return subs;
}

/**
 * Merge several open/held orders into the first one. Lines with the same item,
 * options, instructions and seat are combined. Source orders are kept as
 * cancelled records pointing at the target (`mergedInto`).
 */
export async function mergeOrders(target: Order, sources: Order[]): Promise<Order> {
  const all = [target, ...sources];
  const fresh = await Promise.all(all.map((o) => getOrder(o.id)));
  if (fresh.some((o) => !o || (o.status !== "open" && o.status !== "held"))) {
    throw new Error("Every order being merged must still be open or held.");
  }

  const bySig = new Map<string, OrderLineItem>();
  for (const o of fresh as Order[]) {
    for (const line of normalizeLines(o.items)) {
      const sig = lineSignature(line);
      const existing = bySig.get(sig);
      if (existing) existing.quantity += line.quantity;
      else bySig.set(sig, { ...line, lineId: newLineId() });
    }
  }
  const notes = (fresh as Order[]).map((o) => o.notes).filter(Boolean).join(" | ");
  const merged = withTotals({
    ...(fresh[0] as Order),
    items: Array.from(bySig.values()),
    notes,
    voidedItems: (fresh as Order[]).flatMap((o) => o.voidedItems ?? []),
    mergedFrom: sources.map((s) => s.id),
  });

  const docClient = await getClient();
  await docClient.send(new PutCommand({ TableName: TABLES.orders, Item: clean(merged) }));
  for (const src of sources) {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.orders,
        Key: { id: src.id },
        UpdateExpression: "SET #s = :cancelled, mergedInto = :t, cancelReason = :r REMOVE heldAt",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":cancelled": "cancelled",
          ":t": target.id,
          ":r": `Merged into ${target.id}`,
        },
      })
    );
  }
  return merged;
}
