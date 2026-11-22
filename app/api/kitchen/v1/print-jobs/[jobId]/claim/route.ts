import { NextRequest, NextResponse } from "next/server";
import { isKitchenPrinterRequest, locationOf } from "@/app/lib/adminAuth";
import { claimKitchenPrintJob } from "@/app/lib/kitchenPrintJobs";
import { getOrder } from "@/app/lib/dynamodb-server";
type Context = { params: Promise<{ jobId: string }> };
function device(request: NextRequest) { try { const p = JSON.parse(Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /i, "").split(".")[1] ?? "", "base64url").toString("utf8")); return typeof p.sub === "string" ? p.sub : "KitchenPrinter"; } catch { return "KitchenPrinter"; } }
export async function POST(request: NextRequest, { params }: Context) {
  if (!isKitchenPrinterRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = (await params).jobId;
  const result = await claimKitchenPrintJob({ id, locationId: locationOf(request), claimedBy: device(request) });
  if (result.kind === "not-found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.kind === "claimed") {
    const order = await getOrder(result.job.orderId);
    if (!order) return NextResponse.json({ error: "Canonical order not found" }, { status: 409 });
    console.info("[kitchen-print] claim", { jobId: id, orderId: order.id });
    return NextResponse.json({ job: result.job, order });
  }
  return NextResponse.json(result, { status: 409 });
}
