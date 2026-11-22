import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLES } from "./tables";

export type KitchenPrintJobStatus = "pending" | "claimed" | "printed" | "failed";
export type KitchenPrintJob = {
  id: string; idempotencyKey: string; clientRequestId: string; orderId: string;
  locationId: string; destination: "kitchen"; status: KitchenPrintJobStatus;
  createdAt: string; updatedAt: string; requestedBy: string; claimedBy?: string;
  claimExpiresAt?: string; failureReason?: string; attemptCount: number;
};

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
const table = TABLES.kitchenPrintJobs;
const LEASE_MS = 90_000;

function dedupeKey(locationId: string, destination: string, requestId: string) {
  return `${locationId}#${destination}#${requestId}`;
}
function conditional(err: unknown) { return (err as { name?: string })?.name === "ConditionalCheckFailedException"; }

export async function createKitchenPrintJob(input: { orderId: string; locationId: string; clientRequestId: string; requestedBy: string }) {
  const now = new Date().toISOString();
  const idempotencyKey = dedupeKey(input.locationId, "kitchen", input.clientRequestId);
  const job: KitchenPrintJob = { id: randomUUID(), idempotencyKey, clientRequestId: input.clientRequestId, orderId: input.orderId, locationId: input.locationId, destination: "kitchen", status: "pending", createdAt: now, updatedAt: now, requestedBy: input.requestedBy, attemptCount: 0 };
  try {
    await client.send(new PutCommand({ TableName: table, Item: job, ConditionExpression: "attribute_not_exists(idempotencyKey)" }));
    return { job, created: true };
  } catch (err) {
    if (!conditional(err)) throw err;
    const existing = await client.send(new GetCommand({ TableName: table, Key: { idempotencyKey } }));
    if (!existing.Item) throw err;
    return { job: existing.Item as KitchenPrintJob, created: false };
  }
}

async function findJob(id: string): Promise<KitchenPrintJob | null> {
  let start: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new ScanCommand({ TableName: table, FilterExpression: "id = :id", ExpressionAttributeValues: { ":id": id }, ExclusiveStartKey: start }));
    if (result.Items?.[0]) return result.Items[0] as KitchenPrintJob;
    start = result.LastEvaluatedKey;
  } while (start);
  return null;
}

export async function listClaimableKitchenJobs(locationId: string): Promise<KitchenPrintJob[]> {
  const now = new Date().toISOString(); let start: Record<string, unknown> | undefined; const jobs: KitchenPrintJob[] = [];
  do {
    const result = await client.send(new ScanCommand({ TableName: table, FilterExpression: "locationId = :location AND destination = :destination AND (#status = :pending OR (#status = :claimed AND claimExpiresAt <= :now))", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":location": locationId, ":destination": "kitchen", ":pending": "pending", ":claimed": "claimed", ":now": now }, ExclusiveStartKey: start }));
    jobs.push(...(result.Items ?? []) as KitchenPrintJob[]); start = result.LastEvaluatedKey;
  } while (start);
  return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function claimKitchenPrintJob(input: { id: string; locationId: string; claimedBy: string }) {
  const job = await findJob(input.id);
  if (!job || job.locationId !== input.locationId || job.destination !== "kitchen") return { kind: "not-found" as const };
  const now = new Date().toISOString(); const expires = new Date(Date.now() + LEASE_MS).toISOString();
  try {
    await client.send(new UpdateCommand({ TableName: table, Key: { idempotencyKey: job.idempotencyKey }, ConditionExpression: "#status = :pending OR (#status = :claimed AND claimExpiresAt <= :now)", UpdateExpression: "SET #status = :claimed, claimedBy = :by, claimExpiresAt = :expires, updatedAt = :now ADD attemptCount :one", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":pending": "pending", ":claimed": "claimed", ":now": now, ":by": input.claimedBy, ":expires": expires, ":one": 1 } }));
    return { kind: "claimed" as const, job: { ...job, status: "claimed" as const, claimedBy: input.claimedBy, claimExpiresAt: expires, attemptCount: job.attemptCount + 1 } };
  } catch (err) { if (conditional(err)) return { kind: "unavailable" as const }; throw err; }
}

export async function finishKitchenPrintJob(input: { id: string; locationId: string; claimedBy: string; printed: boolean; failureReason?: string }) {
  const job = await findJob(input.id);
  if (!job || job.locationId !== input.locationId) return "not-found" as const;
  const now = new Date().toISOString();
  try {
    await client.send(new UpdateCommand({ TableName: table, Key: { idempotencyKey: job.idempotencyKey }, ConditionExpression: "#status = :claimed AND claimedBy = :by AND claimExpiresAt > :now", UpdateExpression: input.printed ? "SET #status = :printed, updatedAt = :now REMOVE claimExpiresAt" : "SET #status = :pending, updatedAt = :now, failureReason = :reason REMOVE claimedBy, claimExpiresAt", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":claimed": "claimed", ":by": input.claimedBy, ":now": now, ":printed": "printed", ":pending": "pending", ":reason": input.failureReason ?? "printer-error" } }));
    return "updated" as const;
  } catch (err) { if (conditional(err)) return "not-owned" as const; throw err; }
}
