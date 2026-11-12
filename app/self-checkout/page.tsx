"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";

type Summary = { id: string; saleCode?: string; tableLabel: string; status: string; subtotal: number; tax: number; tip: number; total: number; items: Array<{ name: string; unitPrice: number; quantity: number }> };
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

function SelfCheckoutContent() {
  const params = useSearchParams();
  const orderId = params.get("order"); const token = params.get("token");
  const [order, setOrder] = useState<Summary | null>(null); const [tipPct, setTipPct] = useState(0);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const mount = useRef<HTMLDivElement>(null);
  const tip = order ? Math.round(order.subtotal * tipPct) / 100 : 0;
  useEffect(() => { if (!orderId || !token) { setError("Este enlace de pago no es válido."); setLoading(false); return; }
    fetch(`/api/self-checkout?order=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`).then(async r => { if (!r.ok) throw new Error("Esta cuenta ya no está disponible."); return r.json(); }).then(setOrder).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [orderId, token]);
  async function pay() {
    if (!orderId || !token || !mount.current) return; setLoading(true); setError("");
    try { const r = await fetch("/api/self-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, token, tip }) }); const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "No fue posible iniciar el pago."); const stripe = await stripePromise; if (!stripe) throw new Error("El pago no está disponible."); const checkout = await stripe.createEmbeddedCheckoutPage({ clientSecret: data.clientSecret }); mount.current.innerHTML = ""; checkout.mount(mount.current); }
    catch (e) { setError(e instanceof Error ? e.message : "No fue posible iniciar el pago."); } finally { setLoading(false); }
  }
  if (params.get("session_id")) return <main className="mx-auto max-w-lg p-6"><h1 className="text-3xl font-semibold">Pago enviado</h1><p className="mt-3 text-[var(--text-muted)]">Gracias. El restaurante confirmará tu pago en breve.</p></main>;
  return <main className="mx-auto min-h-screen max-w-lg bg-background p-5 text-foreground"><h1 className="text-3xl font-semibold">Paga tu cuenta</h1>{loading && !order ? <p className="mt-6">Cargando cuenta…</p> : error && !order ? <p className="mt-6 text-red-600">{error}</p> : order && <><p className="mt-1 text-sm text-[var(--text-muted)]">{order.tableLabel}{order.saleCode ? ` · ${order.saleCode}` : ""}</p><section className="mt-6 rounded-xl border border-border p-4">{order.items.map((i, index) => <div key={index} className="mb-3 flex justify-between gap-3"><span>{i.quantity} × {i.name}</span><span>{money(i.unitPrice * i.quantity)}</span></div>)}<div className="border-t pt-3"><div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>{order.tax > 0 && <div className="flex justify-between"><span>IVA</span><span>{money(order.tax)}</span></div>}</div></section><h2 className="mt-6 text-lg font-semibold">Agregar propina</h2><div className="mt-2 grid grid-cols-4 gap-2">{[0, 10, 15, 20].map(p => <button key={p} onClick={() => setTipPct(p)} className={`rounded-lg border p-3 ${tipPct === p ? "bg-primary text-primary-foreground" : "border-border"}`}>{p ? `${p}%` : "Sin propina"}</button>)}</div><div className="mt-5 flex justify-between border-t pt-4 text-lg font-semibold"><span>Total</span><span>{money(order.subtotal + order.tax + tip)}</span></div><button disabled={loading} onClick={pay} className="mt-5 w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">Continuar al pago seguro</button>{error && <p className="mt-3 text-sm text-red-600">{error}</p>}<div ref={mount} className="mt-6" /></>}</main>;
}

export default function SelfCheckoutPage() {
  return <Suspense fallback={<main className="p-6">Cargando cuenta…</main>}><SelfCheckoutContent /></Suspense>;
}
