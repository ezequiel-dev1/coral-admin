import { NextResponse } from "next/server";
import { stripe, fromMinorUnits } from "@/app/lib/stripe";
import type { CardPresentPayment } from "@/app/lib/cardPresent";

export const dynamic = "force-dynamic";

/** How far back to look for in-person payments. */
const WINDOW_MINUTES = 30;

/**
 * Recent successful in-person card payments (Tap to Pay in the Stripe
 * Dashboard app, or a Terminal reader), newest first. The checkout screen polls
 * this and matches a payment to the open check by amount. Staff-only: in
 * production API Gateway requires a Cognito JWT for this route.
 */
export async function GET() {
  try {
    const gte = Math.floor(Date.now() / 1000) - WINDOW_MINUTES * 60;
    const list = await stripe.paymentIntents.list({
      created: { gte },
      limit: 50,
      expand: ["data.latest_charge.balance_transaction"],
    });

    const payments: CardPresentPayment[] = [];
    for (const pi of list.data) {
      if (pi.status !== "succeeded" || pi.currency !== "mxn") continue;
      const charge = pi.latest_charge;
      if (!charge || typeof charge === "string") continue;
      const type = charge.payment_method_details?.type;
      if (type !== "card_present" && type !== "interac_present") continue;

      const card = charge.payment_method_details?.card_present;
      const bt = charge.balance_transaction;
      const hasBt = bt && typeof bt !== "string";
      payments.push({
        id: pi.id,
        amount: fromMinorUnits(pi.amount_received || pi.amount),
        createdAt: new Date(pi.created * 1000).toISOString(),
        brand: card?.brand ?? null,
        last4: card?.last4 ?? null,
        fee: hasBt ? fromMinorUnits(bt.fee) : 0,
        net: hasBt ? fromMinorUnits(bt.net) : null,
      });
    }

    return NextResponse.json({ payments });
  } catch (err) {
    console.error("[card-present] failed to list payments:", err);
    return NextResponse.json(
      { error: "Could not load card payments" },
      { status: 502 }
    );
  }
}
