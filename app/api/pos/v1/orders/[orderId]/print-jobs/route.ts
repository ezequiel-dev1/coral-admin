import { NextRequest, NextResponse } from "next/server";
import { isPosRequest, locationOf } from "@/app/lib/adminAuth";
import { createKitchenPrintJob } from "@/app/lib/kitchenPrintJobs";
import { getOrder } from "@/app/lib/dynamodb-server";

type Context = { params: Promise<{ orderId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function actor(request: NextRequest) {
  try { const p = JSON.parse(Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /i, "").split(".")[1] ?? "", "base64url").toString("utf8")); return typeof p.sub === "string" ? p.sub : "POS"; } catch { return "POS"; }
}

export async function POST(request: NextRequest, { params }: Context) {
  if (!isPosRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { clientRequestId?: unknown; destination?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!UUID.test(String(body.clientRequestId ?? "")) || body.destination !== "kitchen") return NextResponse.json({ error: "clientRequestId must be a UUID and destination must be kitchen" }, { status: 400 });
  const orderId = (await params).orderId;
  if (!(await getOrder(orderId))) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const { job, created } = await createKitchenPrintJob({ orderId, locationId: locationOf(request), clientRequestId: body.clientRequestId as string, requestedBy: actor(request) });
  console.info("[kitchen-print] create", { jobId: job.id, orderId, requestId: job.clientRequestId, created });
  // The durable job is authoritative. Publishing is intentionally best-effort;
  // native polling covers an unavailable event endpoint.
  if (created) {
    try { const { publishKitchenPrintRequested } = await import("@/app/lib/kitchenPrintEvents"); await publishKitchenPrintRequested(job); }
    catch (err) { console.error("[kitchen-print] publish failed", { jobId: job.id, orderId, requestId: job.clientRequestId, error: err instanceof Error ? err.message : "unknown" }); }
  }
  return NextResponse.json({ job, created }, { status: created ? 201 : 200 });
}
