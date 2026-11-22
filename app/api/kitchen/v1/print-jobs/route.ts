import { NextRequest, NextResponse } from "next/server";
import { isKitchenPrinterRequest, locationOf } from "@/app/lib/adminAuth";
import { listClaimableKitchenJobs } from "@/app/lib/kitchenPrintJobs";

export async function GET(request: NextRequest) {
  if (!isKitchenPrinterRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = request.nextUrl.searchParams.get("status");
  if (status && status !== "pending") return NextResponse.json({ error: "Only status=pending is supported" }, { status: 400 });
  const jobs = await listClaimableKitchenJobs(locationOf(request));
  return NextResponse.json({ jobs });
}
