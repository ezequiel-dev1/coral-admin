import { NextRequest, NextResponse } from "next/server";
import { isKitchenPrinterRequest, locationOf } from "@/app/lib/adminAuth";
import { finishKitchenPrintJob } from "@/app/lib/kitchenPrintJobs";
type Context = { params: Promise<{ jobId: string }> };
const reason = (value: unknown) => typeof value === "string" && /^[a-z0-9-]{1,80}$/i.test(value) ? value : null;
function device(request: NextRequest) { try { const p = JSON.parse(Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /i, "").split(".")[1] ?? "", "base64url").toString("utf8")); return typeof p.sub === "string" ? p.sub : "KitchenPrinter"; } catch { return "KitchenPrinter"; } }
export async function POST(request: NextRequest, { params }: Context) {
  if (!isKitchenPrinterRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { reason?: unknown }; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const failureReason = reason(body.reason); if (!failureReason) return NextResponse.json({ error: "Invalid failure reason" }, { status: 400 });
  const id = (await params).jobId; const outcome = await finishKitchenPrintJob({ id, locationId: locationOf(request), claimedBy: device(request), printed: false, failureReason });
  if (outcome === "not-found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (outcome === "not-owned") return NextResponse.json({ error: "Claim expired or belongs to another device" }, { status: 409 });
  console.warn("[kitchen-print] failure", { jobId: id, failureReason }); return NextResponse.json({ released: true });
}
