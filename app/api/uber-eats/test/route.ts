import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { APP_ENV } from "@/app/lib/tables";
import { createUberOrder, getOrder, markUberOrderCancelled, setUberWorkflowStatus } from "@/app/lib/dynamodb-server";
import { acceptUberOrder, toCoralUberOrder } from "@/app/lib/uber-eats";
import { buildTestUberOrder, buildTestUberOrderFromMenu, type TestMenuItem, type TestScenario } from "@/app/lib/uber-eats-test";

export const dynamic = "force-dynamic";

const SCENARIOS: TestScenario[] = ["simple", "modifiers", "large"];
const ORDER_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Cognito groups from the ID token. API Gateway already verified the signature. */
function groupsOf(req: NextRequest): string[] | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  try {
    const payload = JSON.parse(Buffer.from(header.replace(/^Bearer /i, "").split(".")[1], "base64url").toString("utf8"));
    const groups = payload["cognito:groups"];
    return Array.isArray(groups) ? groups.map(String) : [];
  } catch {
    return [];
  }
}

function authorized(req: NextRequest): boolean {
  const groups = groupsOf(req);
  // No token: only acceptable in local dev. In Lambda the gateway always supplies one.
  if (groups === null) return !process.env.AWS_LAMBDA_FUNCTION_NAME;
  return groups.some((g) => g === "Administrator" || g === "Overlord");
}

/**
 * UAT-only helpers for testing the Uber Eats integration.
 *   simulate_order  build a fake Uber order and save it through the real mapper
 *   simulate_cancel mark a previously saved Uber order cancelled
 *   replay_webhook  send a correctly signed webhook for a REAL sandbox order id,
 *                   exercising signature check, OAuth, Get Order, save and accept
 */
export async function POST(req: NextRequest) {
  // Never available in production, regardless of caller.
  if (APP_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { action?: string; scenario?: string; orderId?: string; items?: TestMenuItem[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  try {
    if (body.action === "simulate_order") {
      const scenario = (SCENARIOS as string[]).includes(body.scenario ?? "") ? (body.scenario as TestScenario) : "simple";
      const uber = buildTestUberOrder(scenario);
      const order = toCoralUberOrder(uber);
      const created = await createUberOrder(order);
      return NextResponse.json({ ok: true, created, orderId: uber.id, posOrderId: order.id, total: order.total });
    }

    if (body.action === "simulate_menu_order") {
      const items = body.items;
      if (!Array.isArray(items) || items.length === 0 || items.length > 30 || items.some((item) =>
        !item || typeof item.id !== "string" || item.id.length > 160 || typeof item.title !== "string" || item.title.length > 160 ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || !Number.isInteger(item.unitPrice) || item.unitPrice < 1 || item.unitPrice > 10_000_000
      )) return NextResponse.json({ error: "Invalid menu items" }, { status: 400 });
      const uber = buildTestUberOrderFromMenu(items);
      const order = toCoralUberOrder(uber);
      const created = await createUberOrder(order);
      return NextResponse.json({ ok: true, created, orderId: uber.id, posOrderId: order.id, total: order.total });
    }

    if (body.action === "transition_order") {
      if (!body.orderId || !ORDER_ID.test(body.orderId)) return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });
      const order = await getOrder(`uber-${body.orderId}`);
      if (!order || order.source !== "uber-eats") return NextResponse.json({ error: "Uber order not found" }, { status: 404 });
      const workflow = body.scenario;
      if (workflow !== "preparing" && workflow !== "ready" && workflow !== "completed") return NextResponse.json({ error: "Invalid workflow state" }, { status: 400 });
      if (workflow === "preparing" && order.uberStoreId !== "uat-test-store") await acceptUberOrder(body.orderId, order.id, "sandbox");
      await setUberWorkflowStatus(order.id, workflow);
      return NextResponse.json({ ok: true, orderId: body.orderId, workflow });
    }

    if (body.action === "simulate_cancel") {
      if (!body.orderId || !ORDER_ID.test(body.orderId)) return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });
      await markUberOrderCancelled(body.orderId, "Cancelled by UAT test");
      return NextResponse.json({ ok: true, orderId: body.orderId });
    }

    if (body.action === "replay_webhook") {
      if (!body.orderId || !ORDER_ID.test(body.orderId)) return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });
      const secret = process.env.UBER_EATS_CLIENT_SECRET;
      if (!secret) return NextResponse.json({ error: "Uber credentials are not configured" }, { status: 500 });
      const payload = JSON.stringify({ event_type: "orders.notification", meta: { resource_id: body.orderId }, resource_id: body.orderId });
      const signature = createHmac("sha256", secret).update(payload).digest("hex");
      const base = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
      const res = await fetch(`${base}/api/uber-eats/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Uber-Signature": signature, "X-Environment": "sandbox" },
        body: payload,
      });
      return NextResponse.json({ ok: res.ok, webhookStatus: res.status, orderId: body.orderId });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[uber-eats-test] failed:", err);
    return NextResponse.json({ error: "Test action failed" }, { status: 500 });
  }
}
