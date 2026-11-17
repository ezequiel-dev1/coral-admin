import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, isOverlordRequest } from "@/app/lib/adminAuth";
import { createTabletOrder, markOrderCancelled, recordTabletPayment } from "@/app/lib/dynamodb-server";
import type { Order, OrderLineItem } from "@/app/lib/dynamodb";

type TabletLine = {
  id: string;
  menuItemID: string;
  name: string;
  unitPrice: number;
  quantity: number;
  note?: string | null;
};

type TabletOrder = {
  id: string;
  createdAt: string;
  tableName: string;
  notes: string;
  subtotal: number;
  lines: TabletLine[];
  customerName?: string | null;
};

type TabletPayment = { orderID: string; tip: number; paymentMethod: string; paidAt: string; amountTendered?: number | null; changeDue?: number | null };
type SyncOperation = { id: string; type: "upsertOrder"; order: TabletOrder } | { id: string; type: "recordPayment"; payment: TabletPayment } | { id: string; type: "cancelOrder"; cancellation: { orderID: string } };

const MAX_OPERATIONS = 25;
const MAX_LINES = 100;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? value : null;
}

function toOrder(value: unknown): Order | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = text(source.id, 36);
  const createdAt = text(source.createdAt, 40);
  const tableLabel = text(source.tableName, 80);
  const notes = text(source.notes, 2_000);
  const customerName = source.customerName === undefined || source.customerName === null ? undefined : text(source.customerName, 160);
  const subtotal = amount(source.subtotal);
  if (!id || !uuid.test(id) || !createdAt || Number.isNaN(Date.parse(createdAt)) || !tableLabel || notes === null || subtotal === null || (source.customerName !== undefined && source.customerName !== null && customerName === null) || !Array.isArray(source.lines) || source.lines.length === 0 || source.lines.length > MAX_LINES) return null;

  const items: OrderLineItem[] = [];
  let computedSubtotal = 0;
  for (const raw of source.lines) {
    if (!raw || typeof raw !== "object") return null;
    const line = raw as Record<string, unknown>;
    const menuItemId = text(line.menuItemID, 160);
    const name = text(line.name, 200);
    const unitPrice = amount(line.unitPrice);
    const quantity = line.quantity;
    const lineId = text(line.id, 60);
    const instructions = line.note === undefined || line.note === null ? undefined : text(line.note, 1_000);
    if (!menuItemId || !name || unitPrice === null || !lineId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 || (line.note !== undefined && line.note !== null && instructions === null)) return null;
    items.push({ menuItemId, name, unitPrice, quantity, lineId, basePrice: unitPrice, ...(instructions ? { instructions } : {}) });
    computedSubtotal += unitPrice * quantity;
  }
  // Prices are sent in minor business units, but floating point arithmetic
  // needs a tiny tolerance when checking a valid local Decimal snapshot.
  if (Math.abs(computedSubtotal - subtotal) > 0.01) return null;

  return {
    id, createdAt, tableLabel, server: "iPad", items, subtotal,
    tax: 0, tip: 0, total: subtotal, processingFee: 0, netAmount: 0,
    status: "open", paymentMethod: "cash", notes,
    serviceType: tableLabel === "Takeout" || tableLabel === "Para llevar" ? "takeout" : "dine-in",
    source: "pos",
    ...(customerName ? { customerName } : {}),
  };
}

function toPayment(value: unknown): { id: string; tip: number; paymentMethod: "cash" | "other"; paidAt: string; amountTendered?: number; changeDue?: number } | null {
  if (!value || typeof value !== "object") return null;
  const payment = value as Record<string, unknown>;
  const id = text(payment.orderID, 36);
  const tip = amount(payment.tip);
  const paidAt = text(payment.paidAt, 40);
  const method = payment.paymentMethod;
  const tendered = payment.amountTendered === undefined || payment.amountTendered === null ? undefined : amount(payment.amountTendered);
  const change = payment.changeDue === undefined || payment.changeDue === null ? undefined : amount(payment.changeDue);
  if (!id || !paidAt || Number.isNaN(Date.parse(paidAt)) || (method !== "cash" && method !== "other") || (payment.amountTendered !== undefined && payment.amountTendered !== null && tendered === null) || (payment.changeDue !== undefined && payment.changeDue !== null && change === null)) return null;
  return { id, tip, paymentMethod: method, paidAt, ...(tendered === undefined ? {} : { amountTendered: tendered }), ...(change === undefined ? {} : { changeDue: change }) };
}

/** UAT-only offline-order synchronization endpoint for native tablet clients. */
export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_ENV !== "uat") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { operations?: unknown };
  try { body = await request.json() as { operations?: unknown }; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(body.operations) || body.operations.length === 0 || body.operations.length > MAX_OPERATIONS) return NextResponse.json({ error: "Invalid operations" }, { status: 400 });

  const accepted: string[] = [];
  for (const raw of body.operations) {
    if (!raw || typeof raw !== "object") return NextResponse.json({ error: "Invalid operation" }, { status: 400 });
    const operation = raw as { id?: unknown; type?: unknown; order?: unknown; payment?: unknown; cancellation?: unknown };
    if (typeof operation.id !== "string" || !uuid.test(operation.id)) return NextResponse.json({ error: "Unsupported operation" }, { status: 400 });
    if (operation.type === "upsertOrder") {
      const order = toOrder(operation.order);
      if (!order) return NextResponse.json({ error: "Invalid order" }, { status: 400 });
      await createTabletOrder(order);
    } else if (operation.type === "recordPayment") {
      const payment = toPayment(operation.payment);
      if (!payment) return NextResponse.json({ error: "Invalid payment" }, { status: 400 });
      await recordTabletPayment(payment);
    } else if (operation.type === "cancelOrder") {
      if (!isOverlordRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const cancellation = operation.cancellation as { orderID?: unknown } | undefined;
      if (!cancellation || typeof cancellation.orderID !== "string" || cancellation.orderID.length > 160) return NextResponse.json({ error: "Invalid cancellation" }, { status: 400 });
      await markOrderCancelled(cancellation.orderID);
    } else return NextResponse.json({ error: "Unsupported operation" }, { status: 400 });
    accepted.push(operation.id);
  }
  return NextResponse.json({ accepted });
}
