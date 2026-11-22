import { NextRequest, NextResponse } from "next/server";
import { isPosRequest, locationOf } from "@/app/lib/adminAuth";
import { getPrinterHealth } from "@/app/lib/kitchenPrinterStatus";

/** iPad-facing operational status. It never exposes printer credentials or controls. */
export async function GET(request: NextRequest) {
  if (!isPosRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = await getPrinterHealth(locationOf(request));
  return NextResponse.json({ status: status ?? { health: "offline", reason: "no-heartbeat" } });
}
