import { NextRequest, NextResponse } from "next/server";
import { saveFeedback, fetchFeedbackRatings } from "@/app/lib/dynamodb-server";

export const dynamic = "force-dynamic";

type FeedbackBody = {
  sessionId?: string;
  rating: number; // 1..5
  comment?: string;
};

function isValid(b: unknown): b is FeedbackBody {
  if (!b || typeof b !== "object") return false;
  const body = b as Record<string, unknown>;
  if (
    typeof body.rating !== "number" ||
    !Number.isInteger(body.rating) ||
    body.rating < 1 ||
    body.rating > 5
  ) {
    return false;
  }
  if (body.sessionId != null && typeof body.sessionId !== "string") return false;
  if (body.comment != null && typeof body.comment !== "string") return false;
  return true;
}

/** Ratings (rating + createdAt only) for the Overview sentiment widget. */
export async function GET() {
  try {
    const ratings = await fetchFeedbackRatings();
    return NextResponse.json({ ratings });
  } catch (err) {
    console.error("[feedback] failed to load:", err);
    return NextResponse.json({ error: "Could not load feedback" }, { status: 502 });
  }
}

/**
 * Collect a post-payment order rating (local proof-of-concept).
 *
 * For now this logs the rating tied to the Stripe session id. A later
 * enhancement would persist it (e.g. a DynamoDB `coral-feedback` table) and
 * surface it in the admin UI.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValid(body)) {
    return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
  }

  const { sessionId, rating, comment } = body;

  try {
    const id = await saveFeedback({ rating, comment, sessionId });
    return NextResponse.json({ received: true, id });
  } catch (err) {
    console.error("[feedback] failed to save:", err);
    return NextResponse.json(
      { error: "Could not save feedback" },
      { status: 502 }
    );
  }
}
