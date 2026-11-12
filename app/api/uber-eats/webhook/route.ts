import { NextRequest, NextResponse } from "next/server";
import { createUberOrder, markUberOrderCancelled } from "@/app/lib/dynamodb-server";
import { acceptUberOrder, getUberOrder, toCoralUberOrder, verifyUberSignature } from "@/app/lib/uber-eats";

export const dynamic = "force-dynamic";

type UberEvent = { event_type?: string; meta?: { resource_id?: string }; resource_id?: string };

export async function POST(req: NextRequest) {
  const secret = process.env.UBER_EATS_CLIENT_SECRET;
  if (!secret) return NextResponse.json({ error: "Uber Eats webhook is not configured" }, { status: 500 });
  const rawBody = await req.text();
  if (!verifyUberSignature(rawBody, req.headers.get("x-uber-signature"), secret)) {
    return NextResponse.json({ error: "Invalid Uber signature" }, { status: 401 });
  }

  let event: UberEvent;
  try { event = JSON.parse(rawBody) as UberEvent; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const orderId = event.meta?.resource_id ?? event.resource_id;
  if (!orderId) return NextResponse.json({ error: "Missing Uber order id" }, { status: 400 });
  const environment = req.headers.get("x-environment");
  if (environment !== "sandbox") {
    return NextResponse.json({ error: "This webhook accepts sandbox events only" }, { status: 400 });
  }

  try {
    if (event.event_type === "orders.cancel" || event.event_type === "orders.failure") {
      await markUberOrderCancelled(orderId);
      return new NextResponse(null, { status: 200 });
    }
    if (event.event_type !== "orders.notification" && event.event_type !== "orders.scheduled.notification") {
      return new NextResponse(null, { status: 200 });
    }
    const order = toCoralUberOrder(await getUberOrder(orderId, environment));
    await createUberOrder(order);
    // Accept after persistence: a successful accept always has a printable POS order.
    await acceptUberOrder(orderId, order.id, environment);
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("[uber-eats] webhook processing failed:", err);
    return NextResponse.json({ error: "Uber order processing failed" }, { status: 500 });
  }
}
