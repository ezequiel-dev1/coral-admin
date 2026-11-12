import { createHmac, timingSafeEqual } from "node:crypto";
import type { Order, OrderLineItem, OrderModifier } from "./dynamodb";

const TOKEN_URL = "https://auth.uber.com/oauth/v2/token";
const SANDBOX_TOKEN_URL = "https://sandbox-login.uber.com/oauth/v2/token";
const PRODUCTION_API = "https://api.uber.com";
const SANDBOX_API = "https://test-api.uber.com";

type UberMoney = { amount?: number; currency_code?: string };
type UberCartItem = {
  id?: string;
  instance_id?: string;
  title?: string;
  quantity?: number;
  special_instructions?: string;
  price?: { unit_price?: UberMoney; base_unit_price?: UberMoney };
  selected_modifier_groups?: Array<{
    title?: string;
    selected_items?: Array<{ id?: string; title?: string; price?: UberMoney }>;
  }>;
};
export type UberOrder = {
  id: string;
  display_id?: string;
  current_state?: string;
  type?: string;
  store?: { id?: string };
  eater?: { first_name?: string; last_name?: string };
  placed_at?: string;
  estimated_ready_for_pickup_at?: string;
  cart?: {
    special_instructions?: string;
    items?: UberCartItem[];
  };
  payment?: { charges?: { total?: UberMoney; sub_total?: UberMoney; tax?: UberMoney; total_fee?: UberMoney } };
};

const tokens: Record<string, { value: string; expiresAt: number } | undefined> = {};

function money(value?: UberMoney): number {
  // Coral currently operates in MXN, whose smallest unit is centavos.
  return typeof value?.amount === "number" ? value.amount / 100 : 0;
}

export function verifyUberSignature(rawBody: string, signature: string | null, clientSecret: string): boolean {
  if (!signature || !clientSecret) return false;
  const expected = createHmac("sha256", clientSecret).update(rawBody).digest("hex");
  const supplied = Buffer.from(signature.toLowerCase(), "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return supplied.length === expectedBytes.length && timingSafeEqual(supplied, expectedBytes);
}

const ORDER_SCOPE = "eats.order eats.store.orders.read";
/** Scope required by the Upload Menu API. Requested separately so order handling never depends on it. */
export const MENU_SCOPE = "eats.store";

async function accessToken(
  clientId: string,
  clientSecret: string,
  environment?: string | null,
  scope: string = ORDER_SCOPE
): Promise<string> {
  // Sandbox apps must authenticate on sandbox-login.uber.com; mixing domains fails auth.
  const sandbox = environment === "sandbox";
  const cacheKey = `${sandbox ? "sandbox" : "production"}:${scope}`;
  const cached = tokens[cacheKey];
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope,
  });
  const response = await fetch(sandbox ? SANDBOX_TOKEN_URL : TOKEN_URL, { method: "POST", body });
  if (!response.ok) throw new Error(`Uber OAuth failed (${response.status})`);
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Uber OAuth response has no access token");
  const fresh = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  tokens[cacheKey] = fresh;
  return fresh.value;
}

function apiBase(environment?: string | null): string {
  if (process.env.UBER_EATS_API_BASE_URL) return process.env.UBER_EATS_API_BASE_URL.replace(/\/$/, "");
  return environment === "sandbox" ? SANDBOX_API : PRODUCTION_API;
}

export async function getUberOrder(orderId: string, environment: string | null): Promise<UberOrder> {
  const clientId = process.env.UBER_EATS_CLIENT_ID;
  const clientSecret = process.env.UBER_EATS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Uber Eats credentials are not configured");
  const response = await fetch(`${apiBase(environment)}/v2/eats/order/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${await accessToken(clientId, clientSecret, environment)}`, "Accept-Encoding": "gzip" },
  });
  if (!response.ok) throw new Error(`Uber Get Order failed (${response.status})`);
  return (await response.json()) as UberOrder;
}

export async function acceptUberOrder(orderId: string, externalReferenceId: string, environment: string | null): Promise<void> {
  const clientId = process.env.UBER_EATS_CLIENT_ID;
  const clientSecret = process.env.UBER_EATS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Uber Eats credentials are not configured");
  const response = await fetch(`${apiBase(environment)}/v1/eats/orders/${encodeURIComponent(orderId)}/accept_pos_order`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(clientId, clientSecret, environment)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      reason: "Accepted by Coral POS",
      external_reference_id: externalReferenceId,
      fields_relayed: { order_special_instructions: true, item_special_instructions: true },
    }),
  });
  if (!response.ok && response.status !== 409) throw new Error(`Uber accept order failed (${response.status})`);
}

export type UberStore = { id: string; name: string; address: string; status: string };

/** Stores this app is authorized for (Uber's Get Stores API, all pages). */
export async function listUberStores(environment: string | null): Promise<UberStore[]> {
  const clientId = process.env.UBER_EATS_CLIENT_ID;
  const clientSecret = process.env.UBER_EATS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Uber Eats credentials are not configured");
  const token = await accessToken(clientId, clientSecret, environment, MENU_SCOPE);
  const stores: UberStore[] = [];
  let startKey = "";
  // Hard page cap so a misbehaving cursor can never loop forever.
  for (let page = 0; page < 20; page++) {
    const url = `${apiBase(environment)}/v1/eats/stores?limit=50${startKey ? `&start_key=${encodeURIComponent(startKey)}` : ""}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Accept-Encoding": "gzip" } });
    if (!response.ok) throw new Error(`Uber Get Stores failed (${response.status})`);
    const data = (await response.json()) as {
      next_key?: string | null;
      stores?: Array<{ store_id?: string; name?: string; status?: string; location?: { address?: string; city?: string } }>;
    };
    for (const s of data.stores ?? []) {
      if (!s.store_id) continue;
      stores.push({
        id: s.store_id,
        name: s.name ?? s.store_id,
        address: [s.location?.address, s.location?.city].filter(Boolean).join(", "),
        status: s.status ?? "",
      });
    }
    if (!data.next_key) break;
    startKey = data.next_key;
  }
  return stores;
}

/**
 * Top-level items currently on a store's menu (Uber's Get Menu API), used to match
 * Coral items by name. Modifier options are excluded: they are also "items" in
 * Uber's model but must never be matched to a dish. A store with no menu yet is
 * an empty list; any other failure throws, so a sync never proceeds blind and
 * creates duplicates.
 */
export async function getUberMenuItems(storeId: string, environment: string | null): Promise<{ id: string; title: string }[]> {
  const clientId = process.env.UBER_EATS_CLIENT_ID;
  const clientSecret = process.env.UBER_EATS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Uber Eats credentials are not configured");
  const response = await fetch(`${apiBase(environment)}/v2/eats/stores/${encodeURIComponent(storeId)}/menus`, {
    headers: {
      Authorization: `Bearer ${await accessToken(clientId, clientSecret, environment, MENU_SCOPE)}`,
      "Accept-Encoding": "gzip",
    },
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Uber Get Menu failed (${response.status})`);
  const menu = (await response.json()) as {
    items?: Array<{ id?: string; title?: { translations?: Record<string, string> } }>;
    modifier_groups?: Array<{ modifier_options?: Array<{ id?: string }> }>;
  };
  const optionIds = new Set((menu.modifier_groups ?? []).flatMap((g) => (g.modifier_options ?? []).map((o) => o.id)));
  return (menu.items ?? []).flatMap((item) => {
    const translations = item.title?.translations ?? {};
    const title = translations.en_us ?? Object.values(translations)[0];
    return item.id && title && !optionIds.has(item.id) ? [{ id: item.id, title }] : [];
  });
}

/** Replace the whole menu of a store (Uber's Upload Menu API). Items missing from the payload are removed. */
export async function putUberMenu(storeId: string, menu: unknown, environment: string | null): Promise<void> {
  const clientId = process.env.UBER_EATS_CLIENT_ID;
  const clientSecret = process.env.UBER_EATS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Uber Eats credentials are not configured");
  const response = await fetch(`${apiBase(environment)}/v2/eats/stores/${encodeURIComponent(storeId)}/menus`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${await accessToken(clientId, clientSecret, environment, MENU_SCOPE)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(menu),
  });
  if (!response.ok) {
    // Uber's error body names the offending entity; log it, but keep it out of the caller's response.
    console.error("[uber-eats] upload menu rejected:", response.status, (await response.text()).slice(0, 2000));
    throw new Error(`Uber upload menu failed (${response.status})`);
  }
}

function modifiers(item: UberCartItem): OrderModifier[] {
  return (item.selected_modifier_groups ?? []).flatMap((group) =>
    (group.selected_items ?? []).map((option) => ({
      groupId: group.title ?? "uber-options",
      group: group.title ?? "Options",
      id: option.id ?? option.title ?? "option",
      name: option.title ?? "Option",
      price: money(option.price),
    }))
  );
}

/** Convert Uber's authoritative order pricing into a Coral order. */
export function toCoralUberOrder(uber: UberOrder): Order {
  const items: OrderLineItem[] = (uber.cart?.items ?? []).map((item, index) => {
    const selected = modifiers(item);
    return {
      lineId: `uber-${item.instance_id ?? index}`,
      menuItemId: item.id ?? `uber-item-${index}`,
      name: item.title ?? "Uber Eats item",
      quantity: item.quantity ?? 1,
      unitPrice: money(item.price?.unit_price),
      basePrice: money(item.price?.base_unit_price),
      modifiers: selected,
      instructions: item.special_instructions,
    };
  });
  const charges = uber.payment?.charges;
  const customer = [uber.eater?.first_name, uber.eater?.last_name].filter(Boolean).join(" ");
  return {
    id: `uber-${uber.id}`,
    createdAt: uber.placed_at ?? new Date().toISOString(),
    tableLabel: "Uber Eats",
    server: "Uber Eats",
    customerName: customer || undefined,
    serviceType: "takeout",
    source: "uber-eats",
    uberOrderId: uber.id,
    uberDisplayId: uber.display_id,
    uberStoreId: uber.store?.id,
    uberOrderState: uber.current_state,
    uberReadyForPickupAt: uber.estimated_ready_for_pickup_at,
    uberWorkflowStatus: "new",
    items,
    subtotal: money(charges?.sub_total),
    tax: money(charges?.tax),
    fee: money(charges?.total_fee),
    tip: 0,
    total: money(charges?.total),
    processingFee: 0,
    netAmount: money(charges?.total),
    // Uber has already collected the payment, but this is still a live kitchen
    // order. Keep it open until it has progressed through the dispatch board.
    status: "open",
    paymentMethod: "other",
    notes: uber.cart?.special_instructions ?? "",
    currency: "MXN",
  };
}
