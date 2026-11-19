import { NextRequest, NextResponse } from "next/server";
import { isPosRequest } from "@/app/lib/adminAuth";
import { fetchMenuForSync, getOrder, replaceOpenPosOrder } from "@/app/lib/dynamodb-server";
import { isMenuItemAvailable } from "@/app/lib/dynamodb";
import { buildPosOrder, type PosOrderInput } from "@/app/lib/pos";

type Context = { params: Promise<{ orderId: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  if (!isPosRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const order = await getOrder((await params).orderId);
  return order ? NextResponse.json({ order }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  if (!isPosRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await getOrder((await params).orderId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "open" || existing.source !== "pos") return NextResponse.json({ error: "Only open POS orders can be changed" }, { status: 409 });
  let input: Omit<PosOrderInput, "clientRequestId">;
  try { input = await request.json() as Omit<PosOrderInput, "clientRequestId">; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!input || !Array.isArray(input.items)) return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  const { items, ingredients } = await fetchMenuForSync();
  const replacement = buildPosOrder({ ...input, clientRequestId: existing.id }, items.filter((item) => isMenuItemAvailable(item, ingredients)), existing.server);
  if (!replacement) return NextResponse.json({ error: "Invalid order or unavailable menu selection" }, { status: 400 });
  const order = { ...replacement, createdAt: existing.createdAt, statusHistory: existing.statusHistory };
  try { await replaceOpenPosOrder(order); } catch { return NextResponse.json({ error: "Order can no longer be changed" }, { status: 409 }); }
  return NextResponse.json({ order });
}
