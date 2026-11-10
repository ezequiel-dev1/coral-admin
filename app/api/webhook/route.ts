import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, fromMinorUnits } from "@/app/lib/stripe";
import { getOrder, markOrderPaid } from "@/app/lib/dynamodb-server";

export const dynamic = "force-dynamic";

/**
 * Fulfillment runs here, NOT on the success page (stripe-best-practices:
 * customers aren't guaranteed to land on the success page). We fulfill on
 * `checkout.session.completed` and `checkout.session.async_payment_succeeded`,
 * only when payment_status is not `unpaid`.
 *
 * Fulfillment flips the order to `paid` in DynamoDB and writes the real Stripe
 * fee/net (from the balance transaction), replacing the client-side estimate.
 */
async function fulfill(session: Stripe.Checkout.Session) {
  if (session.payment_status === "unpaid") {
    console.log(
      `[webhook] session ${session.id} still unpaid; skipping fulfillment`
    );
    return;
  }

  const orderId = session.client_reference_id ?? session.metadata?.orderId;
  if (!orderId) {
    // A session with no order id isn't one of ours (e.g. a generic
    // `stripe trigger` fixture). Nothing to reconcile.
    console.log(
      `[webhook] session ${session.id} has no orderId; skipping (not a POS order)`
    );
    return;
  }

  // Pull the real processing fee + net from the balance transaction.
  let feePesos = 0;
  let netPesos = 0;
  let paymentIntentId: string | undefined;
  try {
    paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;

    if (paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge.balance_transaction"],
      });
      const charge = pi.latest_charge;
      if (charge && typeof charge !== "string") {
        const bt = charge.balance_transaction;
        if (bt && typeof bt !== "string") {
          feePesos = fromMinorUnits(bt.fee);
          netPesos = fromMinorUnits(bt.net);
        }
      }
    }
  } catch (err) {
    console.error("[webhook] could not load balance transaction:", err);
  }

  // Persist to DynamoDB. If the order doesn't exist (unknown id), the
  // conditional write fails — log and move on rather than crashing the handler.
  try {
    const existing = await getOrder(orderId);
    if (!existing) {
      console.warn(`[webhook] order ${orderId} not found; skipping update`);
      return;
    }

    await markOrderPaid({
      id: orderId,
      status: "paid",
      processingFee: feePesos,
      netAmount: netPesos,
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
    });

    console.log(
      `[webhook] order ${orderId} marked paid (fee=${feePesos}, net=${netPesos})`
    );
  } catch (err) {
    console.error(`[webhook] failed to update order ${orderId}:`, err);
    // Re-throw so Stripe retries delivery; a transient DynamoDB error
    // shouldn't silently drop fulfillment.
    throw err;
  }
}

export async function POST(req: NextRequest) {
  // Read per request: in Lambda the secret can be added after cold start.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Signature verification requires the raw request body.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad signature";
    console.error("[webhook] signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await fulfill(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(
          `[webhook] async payment FAILED for order ${session.client_reference_id ?? session.metadata?.orderId}`
        );
        break;
      }
      default:
        // Other events are ignored for the PoC.
        break;
    }
  } catch (err) {
    // Fulfillment failed (e.g. a transient DynamoDB error). Return 500 so
    // Stripe retries delivery rather than considering the event handled.
    console.error("[webhook] handler error:", err);
    return NextResponse.json(
      { error: "Fulfillment failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
