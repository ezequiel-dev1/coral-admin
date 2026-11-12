import { NextRequest, NextResponse } from "next/server";
import { APP_ENV } from "@/app/lib/tables";
import { isAdminRequest } from "@/app/lib/adminAuth";
import { clearMenuItemsUberSynced, fetchMenuForSync, markMenuItemsUberSynced } from "@/app/lib/dynamodb-server";
import { getUberMenuItems, putUberMenu } from "@/app/lib/uber-eats";
import { menuImageUrls } from "@/app/lib/uber-eats-images";
import { buildUberMenu, uberFingerprint } from "@/app/lib/uber-eats-menu";

export const dynamic = "force-dynamic";

const STORE_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Publish menu items to an Uber Eats store.
 *   { storeId?, itemIds?: string[], removeIds?: string[], dryRun? }
 * Uber's upload replaces the whole store menu, so the payload is every item
 * already published (uberSyncedAt) plus itemIds, minus removeIds. dryRun builds
 * and returns the payload without calling Uber or recording anything. The
 * store id falls back to UBER_EATS_STORE_ID. Sandbox only for now.
 */
export async function POST(req: NextRequest) {
  if (APP_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { storeId?: string; itemIds?: unknown; removeIds?: unknown; dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const storeId = (body.storeId ?? process.env.UBER_EATS_STORE_ID ?? "").trim();
  if (!body.dryRun && !STORE_ID.test(storeId)) {
    return NextResponse.json({ error: "A valid Uber store id is required" }, { status: 400 });
  }
  const idList = (value: unknown) =>
    new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  const selected = idList(body.itemIds);
  const removed = idList(body.removeIds);
  if ([...selected].some((id) => removed.has(id))) {
    return NextResponse.json({ error: "An item cannot be added and removed in one request" }, { status: 400 });
  }

  try {
    const { items, ingredients } = await fetchMenuForSync();
    const unknown = [...selected, ...removed].filter((id) => !items.some((item) => item.id === id));
    if (unknown.length) return NextResponse.json({ error: "Unknown menu item ids", unknown }, { status: 400 });

    const toPublish = items.filter((item) => !removed.has(item.id) && (selected.has(item.id) || item.uberSyncedAt));
    const imageUrls = await menuImageUrls(toPublish);
    // What is already on the Uber store, so same-named dishes update in place instead of duplicating.
    const existing = storeId ? await getUberMenuItems(storeId, "sandbox") : [];
    const { payload, includedIds, summary, skipped } = buildUberMenu(toPublish, ingredients, imageUrls, existing);
    // An empty upload clears the Uber menu: fine when the caller is removing items, a mistake otherwise.
    if (summary.items === 0 && removed.size === 0) {
      // Uploading would wipe the Uber menu; refuse rather than publish an empty one.
      return NextResponse.json({ error: "No syncable menu items", skipped }, { status: 422 });
    }
    const withImages = includedIds.filter((id) => imageUrls.has(id)).length;
    const result = { summary: { ...summary, withImages }, skipped };
    if (body.dryRun) return NextResponse.json({ ok: true, dryRun: true, ...result, payload });

    await putUberMenu(storeId, payload, "sandbox");
    // Every item in the payload went out with its current data (previously published ones
    // are re-sent too), so record each one as published as of this snapshot.
    const byId = new Map(items.map((item) => [item.id, item]));
    await markMenuItemsUberSynced(
      includedIds.map((id) => ({ id, hash: uberFingerprint(byId.get(id)!, ingredients) }))
    );
    await clearMenuItemsUberSynced([...removed]);
    return NextResponse.json({ ok: true, removed: removed.size, ...result });
  } catch (err) {
    console.error("[uber-eats-menu] sync failed:", err);
    return NextResponse.json({ error: "Menu sync failed" }, { status: 500 });
  }
}
