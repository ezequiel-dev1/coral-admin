import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { TABLES } from "./tables";

export type ReportedPrinterState = "ready" | "reconnecting" | "error" | "paused";
export type PrinterHealthState = ReportedPrinterState | "offline";
export type KitchenPrinterStatus = {
  locationId: string;
  deviceId: string;
  bridgeState: "active" | "paused";
  printerState: ReportedPrinterState;
  printerName?: string;
  errorCode?: string;
  lastHeartbeatAt: string;
  lastPrinterCheckAt: string;
  lastSuccessfulPrintAt?: string;
};

const MAX_AGE_MS = 90_000;
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));

export async function recordPrinterHeartbeat(input: Omit<KitchenPrinterStatus, "lastHeartbeatAt" | "lastPrinterCheckAt">) {
  const now = new Date().toISOString();
  const status: KitchenPrinterStatus = { ...input, lastHeartbeatAt: now, lastPrinterCheckAt: now };
  await client.send(new PutCommand({ TableName: TABLES.kitchenPrinterStatus, Item: status }));
  return status;
}

export async function getPrinterHealth(locationId: string): Promise<(KitchenPrinterStatus & { health: PrinterHealthState; ageSeconds: number }) | null> {
  const result = await client.send(new GetCommand({ TableName: TABLES.kitchenPrinterStatus, Key: { locationId } }));
  if (!result.Item) return null;
  const status = result.Item as KitchenPrinterStatus;
  const ageSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(status.lastHeartbeatAt)) / 1000));
  const health: PrinterHealthState = ageSeconds > MAX_AGE_MS / 1000 ? "offline" : status.printerState;
  return { ...status, health, ageSeconds };
}
