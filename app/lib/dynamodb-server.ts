import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Order, OrderStatus } from "./dynamodb";
import { TABLES } from "./tables";

/**
 * Server-side DynamoDB access for the Stripe webhook.
 *
 * The browser-side helpers in dynamodb.ts authenticate with the signed-in
 * user's Cognito credentials via `fetchAuthSession()`, which is not available
 * on the server. The webhook has no user session, so it uses the default AWS
 * credential chain instead (environment variables or ~/.aws for the local
 * proof-of-concept; an IAM role in production).
 */
const REGION = "us-east-1";
const ORDERS_TABLE = TABLES.orders;
const FEEDBACK_TABLE = TABLES.feedback;

let docClient: DynamoDBDocumentClient | null = null;

function getServerClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const client = new DynamoDBClient({ region: REGION });
    docClient = DynamoDBDocumentClient.from(client);
  }
  return docClient;
}

/** Read a single order by id (used to guard against processing unknown ids). */
export async function getOrder(id: string): Promise<Order | null> {
  const client = getServerClient();
  const result = await client.send(
    new GetCommand({ TableName: ORDERS_TABLE, Key: { id } })
  );
  return (result.Item as Order | undefined) ?? null;
}

/**
 * Mark an order cancelled. Used when the cashier cancels a card payment before
 * the customer pays — the Stripe session is expired and the order closed out.
 * Guarded so it only cancels an order that is still `open` (never overwrites a
 * payment that already succeeded via a racing webhook).
 */
export async function markOrderCancelled(id: string): Promise<void> {
  const client = getServerClient();
  await client.send(
    new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { id },
      ConditionExpression: "attribute_exists(id) AND #s = :open",
      UpdateExpression: "SET #s = :cancelled",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":cancelled": "cancelled" as OrderStatus,
        ":open": "open" as OrderStatus,
      },
    })
  );
}

type MarkOrderPaidInput = {
  id: string;
  status: OrderStatus;
  processingFee: number;
  netAmount: number;
  stripeSessionId: string;
  stripePaymentIntentId?: string;
};

/**
 * Mark an order paid (or cancelled) and persist the real Stripe fee/net,
 * replacing the client-side estimate. Also records the Stripe identifiers for
 * traceability. Idempotent by nature: Stripe may deliver a webhook more than
 * once, and writing the same values again is harmless.
 */
export async function markOrderPaid(input: MarkOrderPaidInput): Promise<void> {
  const client = getServerClient();
  await client.send(
    new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { id: input.id },
      // Only update an order that actually exists.
      ConditionExpression: "attribute_exists(id)",
      UpdateExpression:
        "SET #s = :status, processingFee = :fee, netAmount = :net, " +
        "stripeSessionId = :sid, stripePaymentIntentId = :pid, paidAt = :paidAt",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": input.status,
        ":fee": input.processingFee,
        ":net": input.netAmount,
        ":sid": input.stripeSessionId,
        ":pid": input.stripePaymentIntentId ?? null,
        ":paidAt": new Date().toISOString(),
      },
    })
  );
}

type SaveFeedbackInput = {
  rating: number; // 1..5
  comment?: string;
  sessionId?: string;
};

/**
 * Persist a post-payment order rating to the coral-feedback table. Keyed by a
 * generated id; stores the Stripe session id (when present) so a rating can be
 * tied back to its order. Written server-side (no user session) with the
 * default AWS credential chain, like the webhook.
 */
export async function saveFeedback(input: SaveFeedbackInput): Promise<string> {
  const client = getServerClient();
  const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Build the item without undefined keys (the document client rejects them).
  const item: Record<string, unknown> = {
    id,
    rating: input.rating,
    createdAt: new Date().toISOString(),
  };
  const comment = (input.comment ?? "").trim();
  if (comment) item.comment = comment.slice(0, 1000);
  if (input.sessionId) item.stripeSessionId = input.sessionId;

  await client.send(
    new PutCommand({ TableName: FEEDBACK_TABLE, Item: item })
  );
  return id;
}
