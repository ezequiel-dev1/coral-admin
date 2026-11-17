import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/adminAuth";
import { fetchOrdersForTablet } from "@/app/lib/dynamodb-server";

/** UAT order feed used to reconcile web and native tablet POS clients. */
export async function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_ENV !== "uat") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const orders = await fetchOrdersForTablet();
  return NextResponse.json({ generatedAt: new Date().toISOString(), orders }, { headers: { "Cache-Control": "private, max-age=15" } });
}
