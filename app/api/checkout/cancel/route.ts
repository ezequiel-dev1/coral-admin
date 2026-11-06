import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/app/lib/stripe";
import { markOrderCancelled } from "@/app/lib/dynamodb-server";

export const dynamic = "force-dynamic";

type CancelBody = {
  sessionId: string;
  orderId: string;
};

function isValidBody(b: unknown): b is CancelBody {
  if (!b || typeof b !== "object") return false;
  const body = b as Record<string, unknown>;
  return (
    typeof body.sessionId === "string" &&
    body.sessionId.length > 0 &&
    typeof body.orderId === "string" &&
    body.orderId.length > 0
  );
}

/**
 * Cancel an in-progress card payment: expire the Stripe Checkout Session so the
 * QR can no longer be paid, then mark the order `cancelled`.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      { error: "Invalid cancel payload" },
      { status: 400 }
    );
  }

  const { sessionId, orderId } = body;

  // Expire the session. If it's already paid/expired, Stripe returns an error;
  // treat that as "nothing to cancel" and continue to the order update.
  try {
    await stripe.checkout.sessions.expire(sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "stripe error";
    console.warn(`[cancel] could not expire session ${sessionId}: ${message}`);
  }

  // Mark the order cancelled (only if still open). A racing webhook that
  // already marked it paid fails the conditional write — that's fine, the
  // payment stands.
  try {
    await markOrderCancelled(orderId);
  } catch (err) {
    console.warn(
      `[cancel] order ${orderId} not updated (likely already paid/closed):`,
      err instanceof Error ? err.message : err
    );
  }

  return NextResponse.json({ cancelled: true });
}
