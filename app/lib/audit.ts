"use client";

import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { fetchAuthSession } from "aws-amplify/auth";
import { getClient } from "./dynamodb";
import { TABLES } from "./tables";

export type AuditEvent = {
  entityId: string;
  eventId: string;
  occurredAt: string;
  eventType: string;
  summary: string;
  actor: { id: string; name: string; email: string; roles: string[]; source: "web" | "system" };
  details?: Record<string, unknown>;
};

async function loggedInActor(): Promise<AuditEvent["actor"]> {
  const session = await fetchAuthSession();
  const claims = session.tokens?.idToken?.payload;
  const email = typeof claims?.email === "string" ? claims.email : "";
  const name = typeof claims?.name === "string" ? claims.name : email || "Unknown user";
  const id = typeof claims?.sub === "string" ? claims.sub : "unknown";
  const roles = Array.isArray(claims?.["cognito:groups"]) ? claims!["cognito:groups"].map(String) : [];
  return { id, name, email, roles, source: "web" };
}

export async function recordOrderAudit(
  orderId: string,
  eventType: string,
  summary: string,
  details?: Record<string, unknown>,
): Promise<void> {
  const occurredAt = new Date().toISOString();
  const event: AuditEvent = {
    entityId: `order#${orderId}`,
    eventId: `${occurredAt}#${crypto.randomUUID()}`,
    occurredAt,
    eventType,
    summary,
    actor: await loggedInActor(),
    details,
  };
  const client = await getClient();
  await client.send(new PutCommand({ TableName: TABLES.auditEvents, Item: event }));
}

export async function fetchOrderAudit(orderId: string): Promise<AuditEvent[]> {
  const client = await getClient();
  const result = await client.send(new QueryCommand({
    TableName: TABLES.auditEvents,
    KeyConditionExpression: "entityId = :entityId",
    ExpressionAttributeValues: { ":entityId": `order#${orderId}` },
    ScanIndexForward: false,
  }));
  return (result.Items ?? []) as AuditEvent[];
}
