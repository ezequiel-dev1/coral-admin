import { NextRequest, NextResponse } from "next/server";
import { isPosRequest } from "@/app/lib/adminAuth";
import { createTabletOrder, fetchMenuForSync, fetchOrdersForTablet, getOrder } from "@/app/lib/dynamodb-server";
import { isMenuItemAvailable } from "@/app/lib/dynamodb";
import { buildPosOrder, type PosOrderInput } from "@/app/lib/pos";

function actor(request: NextRequest): string {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer /i, "").split(".")[1];
    const claims = token ? JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as Record<string, unknown> : {};
    return typeof claims.name === "string" ? claims.name : typeof claims.email === "string" ? claims.email : "POS";
  } catch { return "POS"; }
}

/** Returns the canonical active/recent orders. Payments stay web-only. */
export async function GET(request: NextRequest) {
  if (!isPosRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = request.nextUrl.searchParams.get("status");
  const updatedSince = request.nextUrl.searchParams.get("updatedSince");
  if (status && !["open", "held", "paid", "cancelled"].includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  if (updatedSince && Number.isNaN(Date.parse(updatedSince))) return NextResponse.json({ error: "Invalid updatedSince" }, { status: 400 });
  const orders = (await fetchOrdersForTablet()).filter((order) => (!status || order.status === status) && (!updatedSince || order.createdAt >= updatedSince));
  return NextResponse.json({ generatedAt: new Date().toISOString(), orders });
}

export async function POST(request: NextRequest) {
  if (!isPosRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let input: PosOrderInput;
  try { input = await request.json() as PosOrderInput; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!input || typeof input !== "object" || !Array.isArray(input.items)) return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  const { items, ingredients } = await fetchMenuForSync();
  const order = buildPosOrder(input, items.filter((item) => isMenuItemAvailable(item, ingredients)), actor(request));
  if (!order) return NextResponse.json({ error: "Invalid order or unavailable menu selection" }, { status: 400 });
  const created = await createTabletOrder(order);
  const canonical = created ? order : await getOrder(order.id);
  if (!canonical) return NextResponse.json({ error: "Order could not be created" }, { status: 409 });
  return NextResponse.json({ order: canonical, created }, { status: created ? 201 : 200 });
}
