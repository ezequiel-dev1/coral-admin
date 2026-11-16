"use client";
import { useEffect, useState } from "react";
import { saveOrder } from "./lib/orders";
import { isOffline, pendingOrderCount, syncOfflineOrders } from "./lib/offlineOrders";
export function OfflineSupport() {
  const [offline, setOffline] = useState(false); const [pending, setPending] = useState(0);
  useEffect(() => {
    const refresh = () => { setOffline(isOffline()); setPending(pendingOrderCount()); };
    const sync = async () => { await syncOfflineOrders(saveOrder); refresh(); };
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    refresh(); window.addEventListener("online", sync); window.addEventListener("offline", refresh); window.addEventListener("coral:outbox", refresh);
    const timer = window.setInterval(sync, 30_000);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", refresh); window.removeEventListener("coral:outbox", refresh); window.clearInterval(timer); };
  }, []);
  if (!offline && pending === 0) return null;
  return <div role="status" className="offline-status">{offline || pending ? `Offline — ${pending} order${pending === 1 ? "" : "s"} waiting to sync` : "Syncing orders"}</div>;
}
