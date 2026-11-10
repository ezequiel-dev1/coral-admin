import { NextRequest, NextResponse } from "next/server";
import { stripe, toMinorUnits } from "@/app/lib/stripe";

// Route handlers need a server runtime; force dynamic so this is never
// statically optimized.
export const dynamic = "force-dynamic";

const CURRENCY = "mxn";

/** 8 random lowercase letters, required suffix for integration_identifier. */
function randomSuffix(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += letters[Math.floor(Math.random() * letters.length)];
  }
  return out;
}

type CheckoutLine = {
  name: string;
  unitPrice: number; // pesos
  quantity: number;
};

type CheckoutBody = {
  orderId: string;
  lines: CheckoutLine[];
  tax: number; // pesos
  tip: number; // pesos
  tableLabel?: string;
};

function isValidBody(b: unknown): b is CheckoutBody {
  if (!b || typeof b !== "object") return false;
  const body = b as Record<string, unknown>;
  if (typeof body.orderId !== "string" || body.orderId.length === 0) return false;
  if (!Array.isArray(body.lines) || body.lines.length === 0) return false;
  for (const l of body.lines) {
    if (!l || typeof l !== "object") return false;
    const line = l as Record<string, unknown>;
    if (typeof line.name !== "string") return false;
    if (typeof line.unitPrice !== "number" || line.unitPrice < 0) return false;
    if (typeof line.quantity !== "number" || line.quantity <= 0) return false;
  }
  if (typeof body.tax !== "number" || body.tax < 0) return false;
  if (typeof body.tip !== "number" || body.tip < 0) return false;
  return true;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      { error: "Invalid checkout payload" },
      { status: 400 }
    );
  }

  const { orderId, lines, tax, tip, tableLabel } = body;

  // Build Stripe line items from the cart. Amounts are in MXN centavos.
  const lineItems: Array<{
    price_data: {
      currency: string;
      product_data: { name: string };
      unit_amount: number;
    };
    quantity: number;
  }> = lines.map((l) => ({
    price_data: {
      currency: CURRENCY,
      product_data: { name: l.name },
      unit_amount: toMinorUnits(l.unitPrice),
    },
    quantity: l.quantity,
  }));

  // Tax and tip are represented as their own single-unit line items so the
  // Stripe total matches the in-app total exactly. (Stripe Tax is a later
  // enhancement; this PoC mirrors the amounts the POS already computes.)
  if (tax > 0) {
    lineItems.push({
      price_data: {
        currency: CURRENCY,
        product_data: { name: "IVA" },
        unit_amount: toMinorUnits(tax),
      },
      quantity: 1,
    });
  }
  if (tip > 0) {
    lineItems.push({
      price_data: {
        currency: CURRENCY,
        product_data: { name: "Propina / Tip" },
        unit_amount: toMinorUnits(tip),
      },
      quantity: 1,
    });
  }

  // SITE_URL is set on the production Lambda so redirect URLs never depend on
  // request headers; locally it is unset and the request origin is used.
  const origin =
    process.env.SITE_URL ??
    req.headers.get("origin") ??
    req.nextUrl.origin ??
    "http://localhost:3000";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      // Dynamic payment methods: do NOT pass payment_method_types. Methods are
      // configured in the Stripe Dashboard.
      success_url: `${origin}/checkout/return?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/return?status=cancel&order_id=${encodeURIComponent(orderId)}`,
      client_reference_id: orderId,
      integration_identifier: `coral-pos-${randomSuffix()}`,
      // Collect what Stripe needs to reconcile this payment with our order.
      metadata: {
        orderId,
        tableLabel: tableLabel ?? "",
        source: "coral-admin-pos",
      },
      // Ask Stripe to expand the fee/net once available (used by the webhook).
      payment_intent_data: {
        metadata: { orderId },
      },
    });

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (err) {
    // Never leak the key or full error internals to the client.
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("[checkout] failed to create session:", message);
    return NextResponse.json(
      { error: "Could not create checkout session" },
      { status: 502 }
    );
  }
}
