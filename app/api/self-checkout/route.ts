import { NextRequest, NextResponse } from "next/server";
import { stripe, toMinorUnits } from "@/app/lib/stripe";
import { getOrder, setSelfCheckoutTip } from "@/app/lib/dynamodb-server";

export const dynamic = "force-dynamic";
const CURRENCY = "mxn";

function access(orderId: string | null, token: string | null) {
  return Boolean(orderId && token && token.length >= 20);
}

async function authorisedOrder(orderId: string | null, token: string | null) {
  if (!access(orderId, token)) return null;
  const order = await getOrder(orderId!);
  return order?.selfCheckoutToken === token ? order : null;
}

/** Public, capability-protected order summary for the QR payment page. */
export async function GET(req: NextRequest) {
  const order = await authorisedOrder(req.nextUrl.searchParams.get("order"), req.nextUrl.searchParams.get("token"));
  if (!order) return NextResponse.json({ error: "Check not found" }, { status: 404 });
  return NextResponse.json({
    id: order.id, saleCode: order.saleCode, tableLabel: order.tableLabel,
    status: order.status, subtotal: order.subtotal, tax: order.tax, tip: order.tip,
    total: order.total, items: order.items.map(({ name, unitPrice, quantity }) => ({ name, unitPrice, quantity })),
  });
}

/** Creates an Embedded Checkout Session from server-side order amounts only. */
export async function POST(req: NextRequest) {
  let body: { orderId?: string; token?: string; tip?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const order = await authorisedOrder(body.orderId ?? null, body.token ?? null);
  if (!order) return NextResponse.json({ error: "Check not found" }, { status: 404 });
  if (order.status !== "open") return NextResponse.json({ error: "This check has already been paid" }, { status: 409 });
  const tip = typeof body.tip === "number" && Number.isFinite(body.tip) ? Math.max(0, Math.round(body.tip * 100) / 100) : 0;
  if (tip > 10_000) return NextResponse.json({ error: "Invalid tip" }, { status: 400 });
  const total = Math.round((order.subtotal + order.tax + tip) * 100) / 100;
  await setSelfCheckoutTip(order.id, tip, total);
  const origin = process.env.SITE_URL ?? req.headers.get("origin") ?? req.nextUrl.origin;
  const line_items = order.items.map((item) => ({
    price_data: { currency: CURRENCY, product_data: { name: item.name }, unit_amount: toMinorUnits(item.unitPrice) },
    quantity: item.quantity,
  }));
  if (order.tax > 0) line_items.push({ price_data: { currency: CURRENCY, product_data: { name: "IVA" }, unit_amount: toMinorUnits(order.tax) }, quantity: 1 });
  if (tip > 0) line_items.push({ price_data: { currency: CURRENCY, product_data: { name: "Propina / Tip" }, unit_amount: toMinorUnits(tip) }, quantity: 1 });
  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page", mode: "payment", line_items,
      return_url: `${origin}/self-checkout?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(body.token!)}&session_id={CHECKOUT_SESSION_ID}`,
      client_reference_id: order.id,
      metadata: { orderId: order.id, source: "coral-self-checkout" },
      payment_intent_data: { metadata: { orderId: order.id } },
    });
    if (!session.client_secret) throw new Error("Stripe did not return a client secret");
    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (error) {
    console.error("[self-checkout] session creation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not start payment" }, { status: 502 });
  }
}
