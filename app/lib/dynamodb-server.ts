import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { MenuIngredient, MenuItem, Order, OrderStatus } from "./dynamodb";
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
// Uber testing is isolated from the production Stripe/POS table.
const UBER_ORDERS_TABLE = "coral-orders";
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
 * Store a marketplace order exactly once. Uber retries webhooks, so the Uber
 * order UUID is also the deterministic POS key. A conditional write makes
 * replay safe without trusting a client-side deduplication cache.
 */
export async function createUberOrder(order: Order): Promise<boolean> {
  const client = getServerClient();
  try {
    await client.send(
      new PutCommand({
        TableName: UBER_ORDERS_TABLE,
        Item: JSON.parse(JSON.stringify(order)),
        ConditionExpression: "attribute_not_exists(id)",
      })
    );
    return true;
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name?: string }).name === "ConditionalCheckFailedException"
    ) {
      return false;
    }
    throw err;
  }
}

export async function setUberWorkflowStatus(id: string, workflow: "preparing" | "ready" | "completed"): Promise<void> {
  const client = getServerClient();
  const ready = workflow === "ready" ? new Date().toISOString() : undefined;
  await client.send(new UpdateCommand({
    TableName: UBER_ORDERS_TABLE,
    Key: { id },
    ConditionExpression: "attribute_exists(id) AND #source = :source",
    ExpressionAttributeNames: { "#source": "source" },
    UpdateExpression: ready ? "SET uberWorkflowStatus = :workflow, uberOrderState = :state, readyAt = :readyAt, statusHistory = list_append(if_not_exists(statusHistory, :empty), :event)" : workflow === "completed" ? "SET uberWorkflowStatus = :workflow, uberOrderState = :state, completedAt = :completedAt, statusHistory = list_append(if_not_exists(statusHistory, :empty), :event)" : "SET uberWorkflowStatus = :workflow, uberOrderState = :state, statusHistory = list_append(if_not_exists(statusHistory, :empty), :event)",
    ExpressionAttributeValues: { ":source": "uber-eats", ":workflow": workflow, ":state": workflow === "preparing" ? "ACCEPTED" : workflow === "completed" ? "FINISHED" : "ACCEPTED", ":empty": [], ":event": [{ status: workflow, at: new Date().toISOString() }], ...(ready ? { ":readyAt": ready } : workflow === "completed" ? { ":completedAt": new Date().toISOString() } : {}) },
  }));
}

/** Mirror an Uber cancellation while never changing an unrelated POS order. */
export async function markUberOrderCancelled(
  uberOrderId: string,
  reason = "Cancelled in Uber Eats"
): Promise<void> {
  const client = getServerClient();
  try {
    await client.send(
      new UpdateCommand({
        TableName: UBER_ORDERS_TABLE,
        Key: { id: `uber-${uberOrderId}` },
        ConditionExpression: "attribute_exists(id) AND source = :source",
        UpdateExpression: "SET #s = :cancelled, cancelReason = :reason, uberOrderState = :state",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":source": "uber-eats",
          ":cancelled": "cancelled" as OrderStatus,
          ":reason": reason,
          ":state": "CANCELED",
        },
      })
    );
  } catch (err) {
    // Uber may deliver cancellation before a retried new-order webhook. There
    // is nothing to update yet, and retrying this event cannot improve it.
    if (
      typeof err === "object" && err !== null && "name" in err &&
      (err as { name?: string }).name === "ConditionalCheckFailedException"
    ) return;
    throw err;
  }
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

async function scanAll<T>(tableName: string): Promise<T[]> {
  const client = getServerClient();
  const out: T[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await client.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey: startKey }));
    out.push(...((res.Items ?? []) as T[]));
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return out;
}

/** Menu items and ingredients, for publishing the menu to Uber Eats. */
export async function fetchMenuForSync(): Promise<{ items: MenuItem[]; ingredients: MenuIngredient[] }> {
  const [items, ingredients] = await Promise.all([
    scanAll<MenuItem>(TABLES.menuItems),
    scanAll<MenuIngredient>(TABLES.menuIngredients),
  ]);
  return { items, ingredients };
}

/** Remember which menu items are on Uber, and what was sent, so later syncs keep republishing them. */
export async function markMenuItemsUberSynced(
  synced: { id: string; hash: string }[],
  at = new Date().toISOString()
): Promise<void> {
  const client = getServerClient();
  for (const { id, hash } of synced) {
    await client.send(
      new UpdateCommand({
        TableName: TABLES.menuItems,
        Key: { id },
        // Never create a stray record for an item deleted mid-sync.
        ConditionExpression: "attribute_exists(id)",
        UpdateExpression: "SET uberSyncedAt = :at, uberSyncHash = :hash",
        ExpressionAttributeValues: { ":at": at, ":hash": hash },
      })
    ).catch((err) => {
      if ((err as { name?: string })?.name !== "ConditionalCheckFailedException") throw err;
    });
  }
}

/** Forget that items are on Uber, so later syncs stop republishing them. */
export async function clearMenuItemsUberSynced(ids: string[]): Promise<void> {
  const client = getServerClient();
  for (const id of ids) {
    await client.send(
      new UpdateCommand({
        TableName: TABLES.menuItems,
        Key: { id },
        ConditionExpression: "attribute_exists(id)",
        UpdateExpression: "REMOVE uberSyncedAt, uberSyncHash",
      })
    ).catch((err) => {
      if ((err as { name?: string })?.name !== "ConditionalCheckFailedException") throw err;
    });
  }
}

/** All feedback ratings (rating + timestamp only; comments stay private). */
export async function fetchFeedbackRatings(): Promise<
  { rating: number; createdAt: string }[]
> {
  const client = getServerClient();
  const out: { rating: number; createdAt: string }[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await client.send(
      new ScanCommand({
        TableName: FEEDBACK_TABLE,
        ProjectionExpression: "rating, createdAt",
        ExclusiveStartKey: startKey,
      })
    );
    for (const it of res.Items ?? []) {
      if (typeof it.rating === "number" && typeof it.createdAt === "string") {
        out.push({ rating: it.rating, createdAt: it.createdAt });
      }
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return out;
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
