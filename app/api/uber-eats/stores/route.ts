import { NextRequest, NextResponse } from "next/server";
import { APP_ENV } from "@/app/lib/tables";
import { isAdminRequest } from "@/app/lib/adminAuth";
import { listUberStores } from "@/app/lib/uber-eats";

export const dynamic = "force-dynamic";

/** Uber stores this app can publish menus to (sandbox only for now), for the store picker. */
export async function GET(req: NextRequest) {
  if (APP_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, stores: await listUberStores("sandbox") });
  } catch (err) {
    console.error("[uber-eats-stores] failed:", err);
    return NextResponse.json({ error: "Could not load Uber stores" }, { status: 502 });
  }
}
