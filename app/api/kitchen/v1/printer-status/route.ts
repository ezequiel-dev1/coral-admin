import { NextRequest, NextResponse } from "next/server";
import { isKitchenPrinterRequest, locationOf } from "@/app/lib/adminAuth";
import { recordPrinterHeartbeat, type ReportedPrinterState } from "@/app/lib/kitchenPrinterStatus";

const state = (value: unknown): value is ReportedPrinterState => value === "ready" || value === "reconnecting" || value === "error" || value === "paused";
const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max ? value.trim() || undefined : undefined;
function device(request: NextRequest) { try { const p = JSON.parse(Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /i, "").split(".")[1] ?? "", "base64url").toString("utf8")); return typeof p.sub === "string" ? p.sub : "KitchenPrinter"; } catch { return "KitchenPrinter"; } }

/** Native bridge heartbeat. Server time is authoritative for offline detection. */
export async function POST(request: NextRequest) {
  if (!isKitchenPrinterRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { bridgeState?: unknown; printerState?: unknown; printerName?: unknown; errorCode?: unknown; lastSuccessfulPrintAt?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if ((body.bridgeState !== "active" && body.bridgeState !== "paused") || !state(body.printerState)) return NextResponse.json({ error: "Invalid printer status" }, { status: 400 });
  const lastSuccessfulPrintAt = typeof body.lastSuccessfulPrintAt === "string" && !Number.isNaN(Date.parse(body.lastSuccessfulPrintAt)) ? body.lastSuccessfulPrintAt : undefined;
  const status = await recordPrinterHeartbeat({ locationId: locationOf(request), deviceId: device(request), bridgeState: body.bridgeState, printerState: body.printerState, printerName: text(body.printerName, 80), errorCode: text(body.errorCode, 80), lastSuccessfulPrintAt });
  return NextResponse.json({ status });
}
