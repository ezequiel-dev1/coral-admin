import type { MenuIngredient, MenuItem } from "./dynamodb";
import { platformCentavos, toCentavos } from "./pricing";

/**
 * Builds the payload for Uber's Upload Menu API (PUT /v2/eats/stores/{id}/menus)
 * from Coral's menu items. Pure and dependency-free so it runs in the Lambda.
 *
 * Mapping:
 *   MenuItem.category      -> Uber category (items grouped, ordered by item.order)
 *   MenuItem               -> Uber item (price in centavos, IVA already included)
 *   MenuItem.modifierGroups-> Uber modifier group; each option becomes a child item
 *   unavailable item       -> kept in the menu but suspended (shows as sold out)
 *   item without a price   -> skipped (Uber rejects the whole menu otherwise)
 *
 * Ids are derived from Coral ids, so repeated syncs update entities in place.
 * Option ids are scoped by item and group because Coral option ids are only
 * unique within their group while Uber item ids are global.
 */

// Menu prices already include IVA (see CheckoutPage TAX_RATE = 0), so use the
// tax-inclusive field; tax_rate would add tax on top of the listed price.
const VAT_INCLUDED_PERCENT = 16;
// Uber suspensions need an end time; a far-future date keeps the item sold out until the next sync.
const SUSPEND_SECONDS = 365 * 24 * 60 * 60;
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

type Text = { translations: { en_us: string } };

export type UberMenuPayload = {
  menus: unknown[];
  categories: unknown[];
  items: unknown[];
  modifier_groups: unknown[];
  display_options: Record<string, never>;
};

export type UberMenuBuild = {
  payload: UberMenuPayload;
  /** Coral ids of the items that made it into the payload. */
  includedIds: string[];
  summary: {
    categories: number;
    items: number;
    modifierGroups: number;
    suspended: number;
    /** Items that took over the id of a same-named item already on Uber. */
    matchedExisting: number;
  };
  /** Items left out of the sync, with the reason. */
  skipped: { id: string; name: string; reason: string }[];
};

const text = (value: string): Text => ({ translations: { en_us: value } });

function slug(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Avoid characters Uber warns about in ids (e.g. "/" and ";").
const safeId = (value: string) => value.replace(/[^A-Za-z0-9_.:-]/g, "-");

/** Price Uber is charged for an item: the stored platform price, else computed from the store price. */
function uberPriceCentavos(item: Pick<MenuItem, "price" | "platformPrice">): number | null {
  return (item.platformPrice ? toCentavos(item.platformPrice) : null) ?? platformCentavos(item.price);
}

/**
 * Short fingerprint of everything about an item that is sent to Uber. It is saved when
 * an item is synced and recomputed later (also in the browser), so a different value
 * means Uber is out of date. Keep it in step with what buildUberMenu sends. Not a
 * security hash: it only detects change.
 */
export function uberFingerprint(item: MenuItem, ingredients: MenuIngredient[]): string {
  const canonical = JSON.stringify([
    item.name?.trim(),
    item.description?.trim() ?? "",
    item.category?.trim() ?? "",
    uberPriceCentavos(item),
    isAvailable(item, ingredients),
    item.imageKey ?? "",
    item.order ?? 0,
    (item.modifierGroups ?? []).map((g) => [
      g.id,
      g.name,
      g.type,
      !!g.required,
      (g.options ?? []).map((o) => [o.id, o.name, Number(o.price) || 0]),
    ]),
  ]);
  // FNV-1a, 32 bit: tiny, synchronous and identical in the browser and the Lambda.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function isAvailable(item: MenuItem, ingredients: MenuIngredient[]): boolean {
  if (!item.available) return false;
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  return !(item.ingredientIds ?? []).some((id) => {
    const ingredient = byId.get(id);
    return !ingredient || !ingredient.available;
  });
}

/** Name key for matching: ignores case, accents, punctuation and extra spaces. */
export function normalizeName(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** A top-level item already on the Uber store. */
export type ExistingUberItem = { id: string; title: string };

export function buildUberMenu(
  items: MenuItem[],
  ingredients: MenuIngredient[],
  /** Publicly fetchable image URL per Coral item id (Uber downloads images from these). */
  imageUrls: ReadonlyMap<string, string> = new Map(),
  /** Items already on the Uber store: a same-named Coral item reuses that id instead of creating a duplicate. */
  existing: ExistingUberItem[] = [],
  now = Date.now()
): UberMenuBuild {
  const includedIds: string[] = [];
  const existingByName = new Map<string, string>();
  for (const e of existing) {
    const key = normalizeName(e.title);
    if (key && !existingByName.has(key)) existingByName.set(key, e.id);
  }
  const usedItemIds = new Set<string>();
  const seenNames = new Set<string>();
  let matchedExisting = 0;
  const uberItems: unknown[] = [];
  const uberGroups: unknown[] = [];
  const skipped: UberMenuBuild["skipped"] = [];
  const categories = new Map<string, { title: string; order: number; ids: string[] }>();
  let suspended = 0;

  const tax = { vat_rate_percentage: VAT_INCLUDED_PERCENT };
  const sorted = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const item of sorted) {
    // Uber charges the platform price (store price + markup). Items saved before the field
    // existed have none, so fall back to computing it from the store price.
    const cents = uberPriceCentavos(item);
    if (cents === null) {
      skipped.push({ id: item.id, name: item.name, reason: "Missing or invalid price" });
      continue;
    }
    if (!item.name?.trim()) {
      skipped.push({ id: item.id, name: item.id, reason: "Missing name" });
      continue;
    }

    // Two Coral items with the same name would show up twice on Uber; keep the first.
    const nameKey = normalizeName(item.name);
    if (seenNames.has(nameKey)) {
      skipped.push({ id: item.id, name: item.name, reason: "Duplicate name" });
      continue;
    }
    seenNames.add(nameKey);

    // Reuse the id of a same-named item already on Uber so it is updated, not duplicated.
    const matched = existingByName.get(nameKey);
    const ownId = safeId(item.id);
    const itemId = matched && !usedItemIds.has(safeId(matched)) ? safeId(matched) : ownId;
    if (itemId !== ownId) matchedExisting += 1;
    usedItemIds.add(itemId);
    const groupIds: string[] = [];

    for (const group of item.modifierGroups ?? []) {
      const options = (group.options ?? []).filter((o) => o.name?.trim());
      if (options.length === 0) continue;
      const groupId = `${itemId}__${safeId(group.id)}`;
      const optionIds = options.map((o) => `${groupId}__${safeId(o.id)}`);
      options.forEach((option, i) => {
        uberItems.push({
          id: optionIds[i],
          title: text(option.name.trim()),
          // Modifier option prices are the surcharge, in centavos (0 is valid here).
          price_info: { price: Math.max(0, Math.round((Number(option.price) || 0) * 100)) },
          quantity_info: { quantity: { min_permitted: 0, max_permitted: 1 } },
          tax_info: tax,
        });
      });
      uberGroups.push({
        id: groupId,
        title: text(group.name?.trim() || "Options"),
        modifier_options: optionIds.map((id) => ({ id, type: "ITEM" })),
        quantity_info: {
          quantity: {
            min_permitted: group.required ? 1 : 0,
            max_permitted: group.type === "multi" ? options.length : 1,
          },
        },
      });
      groupIds.push(groupId);
    }

    const available = isAvailable(item, ingredients);
    if (!available) suspended += 1;

    uberItems.push({
      id: itemId,
      title: text(item.name.trim()),
      ...(item.description?.trim() ? { description: text(item.description.trim()) } : {}),
      ...(imageUrls.get(item.id) ? { image_url: imageUrls.get(item.id) } : {}),
      price_info: { price: cents },
      tax_info: tax,
      ...(groupIds.length ? { modifier_group_ids: { ids: groupIds } } : {}),
      ...(available
        ? {}
        : { suspension_info: { suspension: { suspend_until: Math.floor(now / 1000) + SUSPEND_SECONDS, reason: "Out of stock" } } }),
    });

    const categoryTitle = item.category?.trim() || "Menu";
    const key = slug(categoryTitle) || "menu";
    const category = categories.get(key) ?? { title: categoryTitle, order: item.order ?? 0, ids: [] };
    includedIds.push(item.id);
    category.ids.push(itemId);
    categories.set(key, category);
  }

  const uberCategories = [...categories.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, c]) => ({
      id: `category-${key}`,
      title: text(c.title),
      entities: c.ids.map((id) => ({ id, type: "ITEM" })),
    }));

  const payload: UberMenuPayload = {
    menus: [
      {
        id: "coral-menu",
        title: text("Coral"),
        service_availability: DAYS.map((day_of_week) => ({
          day_of_week,
          time_periods: [{ start_time: "00:00", end_time: "23:59" }],
        })),
        category_ids: uberCategories.map((c) => c.id),
      },
    ],
    categories: uberCategories,
    items: uberItems,
    modifier_groups: uberGroups,
    display_options: {},
  };

  return {
    payload,
    includedIds,
    summary: {
      categories: uberCategories.length,
      items: uberItems.length - uberGroups.reduce<number>((n, g) => n + (g as { modifier_options: unknown[] }).modifier_options.length, 0),
      modifierGroups: uberGroups.length,
      suspended,
      matchedExisting,
    },
    skipped,
  };
}
