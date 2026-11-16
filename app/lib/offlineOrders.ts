import type { Order } from "./dynamodb";

const ORDER_CACHE_KEY = "coral:orders:v1";
const OUTBOX_KEY = "coral:order-outbox:v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
}
function write(key: string, value: unknown) {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event("coral:outbox"));
  }
}
export function cacheOrders(orders: Order[]) { write(ORDER_CACHE_KEY, orders); }
export function cachedOrders(): Order[] { return read<Order[]>(ORDER_CACHE_KEY, []); }
export function cacheOrder(order: Order) {
  cacheOrders([order, ...cachedOrders().filter((item) => item.id !== order.id)].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")));
}
/** Editing the same check replaces its pending version, preserving ordering. */
export function queueOrder(order: Order) { write(OUTBOX_KEY, [...read<Order[]>(OUTBOX_KEY, []).filter((item) => item.id !== order.id), order]); cacheOrder(order); }
export function pendingOrderCount(): number { return read<Order[]>(OUTBOX_KEY, []).length; }
export function isOffline(): boolean { return typeof navigator !== "undefined" && !navigator.onLine; }
export function isNetworkFailure(error: unknown): boolean {
  const value = error as { name?: string; message?: string };
  return value?.name === "TypeError" || value?.name === "TimeoutError" || /network|fetch|offline|timeout/i.test(value?.message ?? "");
}

let syncing: Promise<number> | null = null;
export function syncOfflineOrders(save: (order: Order) => Promise<Order>): Promise<number> {
  if (syncing) return syncing;
  syncing = (async () => {
    if (isOffline()) return 0;
    let sent = 0;
    for (const order of read<Order[]>(OUTBOX_KEY, [])) {
      try {
        const stored = await save(order);
        write(OUTBOX_KEY, read<Order[]>(OUTBOX_KEY, []).filter((item) => item.id !== order.id));
        cacheOrder(stored); sent += 1;
      } catch { break; }
    }
    return sent;
  })().finally(() => { syncing = null; });
  return syncing;
}
