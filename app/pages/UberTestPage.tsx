"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, Send, ShoppingBag, Trash2 } from "lucide-react";
import { authedFetch } from "../lib/apiFetch";
import { fetchMenuItems, type MenuItem } from "../lib/dynamodb";
import { platformCentavos, toCentavos } from "../lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Entry = { at: string; text: string; ok: boolean };
type CartLine = { item: MenuItem; quantity: number; unitPrice: number };
const money = (centavos: number) => (centavos / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const deliveryPrice = (item: MenuItem) => item.platformPrice ? toCentavos(item.platformPrice) : platformCentavos(item.price);

/** UAT-only menu-driven simulator. It writes through the same Uber order mapper as a webhook. */
export function UberTestPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Entry[]>([]);
  const [lastOrderId, setLastOrderId] = useState("");
  const [sandboxOrderId, setSandboxOrderId] = useState("");

  useEffect(() => {
    fetchMenuItems().then(setItems).catch(() => setLog([{ at: new Date().toLocaleTimeString(), ok: false, text: "Could not load menu items." }])).finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => ["all", ...Array.from(new Set(items.map((item) => item.category).filter(Boolean)))], [items]);
  const visibleItems = useMemo(() => items.filter((item) => item.available && !!item.uberSyncedAt && deliveryPrice(item) !== null && (category === "all" || item.category === category) && item.name.toLowerCase().includes(search.toLowerCase())), [items, category, search]);
  const cartTotal = cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  function changeQuantity(item: MenuItem, delta: number) {
    const unitPrice = deliveryPrice(item);
    if (unitPrice === null) return;
    setCart((previous) => {
      const existing = previous.find((line) => line.item.id === item.id);
      if (!existing && delta < 1) return previous;
      if (!existing) return [...previous, { item, quantity: 1, unitPrice }];
      const quantity = existing.quantity + delta;
      return quantity < 1 ? previous.filter((line) => line.item.id !== item.id) : previous.map((line) => line.item.id === item.id ? { ...line, quantity } : line);
    });
  }

  async function run(body: Record<string, unknown>, describe: (data: Record<string, unknown>) => string) {
    setBusy(true);
    let entry: Entry;
    try {
      const res = await authedFetch("/api/uber-eats/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const ok = res.ok && data.ok !== false;
      const errorDetail = String(data.error ?? data.message ?? JSON.stringify(data));
      entry = { at: new Date().toLocaleTimeString(), ok, text: ok ? describe(data) : `Failed (${res.status}): ${errorDetail}` };
      if (!ok) toast.error("Uber test request failed", { description: `HTTP ${res.status}: ${errorDetail}`, duration: 10_000 });
      if (ok && typeof data.orderId === "string" && String(body.action).startsWith("simulate_")) setLastOrderId(data.orderId);
    } catch (err) {
      const errorDetail = err instanceof Error ? err.message : "Request failed";
      entry = { at: new Date().toLocaleTimeString(), ok: false, text: errorDetail };
      toast.error("Uber test request failed", { description: errorDetail, duration: 10_000 });
    }
    setLog((previous) => [entry, ...previous].slice(0, 12));
    setBusy(false);
  }

  async function simulateCart() {
    await run({ action: "simulate_menu_order", items: cart.map((line) => ({ id: line.item.id, title: line.item.name, quantity: line.quantity, unitPrice: line.unitPrice })) }, (data) => `Order created: Uber ${String(data.orderId)} (POS ${String(data.posOrderId)}), total ${money(Math.round(Number(data.total) * 100))}`);
    setCart([]);
  }

  return <div className="page uber-test-page">
    <div className="page-header"><div><p className="eyebrow">UAT only</p><h1>Uber Eats Test</h1><p className="page-subtitle">Build an order from your delivery menu, then send it to the UAT Orders board.</p></div></div>
    <div className="uber-test-builder">
      <section className="uber-menu-picker">
        <div className="uber-test-section-head"><div><h2>Build a test order</h2><p>Prices match the delivery-platform menu price.</p></div><span>{visibleItems.length} items</span></div>
        <div className="uber-menu-controls"><div className="uber-search"><Search size={16} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search delivery menu" /></div><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Menu category">{categories.map((value) => <option key={value} value={value}>{value === "all" ? "All categories" : value}</option>)}</select></div>
        {loading ? <p className="uber-test-empty">Loading menu…</p> : visibleItems.length === 0 ? <p className="uber-test-empty">No available synced delivery items found.</p> : <div className="uber-menu-grid">{visibleItems.map((item) => { const price = deliveryPrice(item)!; const quantity = cart.find((line) => line.item.id === item.id)?.quantity ?? 0; return <article className="uber-menu-item" key={item.id}><div><strong>{item.name}</strong><p>{item.category || "Menu item"}</p><b>{money(price)}</b></div>{quantity ? <div className="uber-quantity"><button onClick={() => changeQuantity(item, -1)} aria-label={`Remove one ${item.name}`}><Minus size={14} /></button><span>{quantity}</span><button onClick={() => changeQuantity(item, 1)} aria-label={`Add one ${item.name}`}><Plus size={14} /></button></div> : <Button size="sm" variant="outline" onClick={() => changeQuantity(item, 1)}><Plus size={14} /> Add</Button>}</article>; })}</div>}
      </section>
      <aside className="uber-test-cart"><div className="uber-cart-head"><div><ShoppingBag size={18} /><h2>Your test order</h2></div>{cart.length > 0 && <button onClick={() => setCart([])}><Trash2 size={14} /> Clear</button>}</div>{cart.length === 0 ? <div className="uber-cart-empty"><ShoppingBag size={24} />Select menu items to build an order.</div> : <><div className="uber-cart-lines">{cart.map((line) => <div className="uber-cart-line" key={line.item.id}><div><strong>{line.item.name}</strong><small>{money(line.unitPrice)} each</small></div><div className="uber-quantity"><button onClick={() => changeQuantity(line.item, -1)} aria-label={`Remove one ${line.item.name}`}><Minus size={14} /></button><span>{line.quantity}</span><button onClick={() => changeQuantity(line.item, 1)} aria-label={`Add one ${line.item.name}`}><Plus size={14} /></button></div></div>)}</div><div className="uber-cart-total"><span>Total</span><strong>{money(cartTotal)}</strong></div><Button className="w-full" disabled={busy} onClick={simulateCart}><Send size={16} /> {busy ? "Sending test order…" : "Simulate Uber Eats order"}</Button></>}</aside>
    </div>
    <div className="uber-test-utilities"><section><h2>Cancel a simulated order</h2><div><Input value={lastOrderId} onChange={(event) => setLastOrderId(event.target.value.trim())} placeholder="Uber order ID" /><Button variant="outline" disabled={busy || !lastOrderId} onClick={() => run({ action: "simulate_cancel", orderId: lastOrderId }, () => `Cancelled ${lastOrderId}`)}>Cancel order</Button></div></section><section><h2>Replay a sandbox webhook</h2><p>Use a real Uber sandbox order ID to test the signed webhook, OAuth, and order acceptance flow.</p><div><Input value={sandboxOrderId} onChange={(event) => setSandboxOrderId(event.target.value.trim())} placeholder="Sandbox order ID" /><Button variant="outline" disabled={busy || !sandboxOrderId} onClick={() => run({ action: "replay_webhook", orderId: sandboxOrderId }, (data) => `Webhook answered ${String(data.webhookStatus)} for ${sandboxOrderId}`)}>Send webhook</Button></div></section></div>
    <section className="uber-test-results" aria-live="polite"><h2>Recent activity</h2>{log.length === 0 ? <p>No actions yet.</p> : <ul>{log.map((entry, index) => <li className={entry.ok ? "" : "error"} key={index}><time>{entry.at}</time>{entry.ok ? "Success" : "Error"}: {entry.text}</li>)}</ul>}</section>
  </div>;
}
