"use client";

import { useState } from "react";
import { authedFetch } from "../lib/apiFetch";
import { Button } from "@/components/ui/button";

/**
 * UAT-only tools for testing the Uber Eats integration. Not shown in production
 * (see Dashboard.tsx); the API route also refuses to run there. English only on
 * purpose: this is a developer tool, not a customer-facing page.
 */
const SCENARIOS = [
  { key: "simple", label: "Simple (1 item)" },
  { key: "modifiers", label: "With modifiers and notes" },
  { key: "large", label: "Large order (3 lines, 13 units)" },
] as const;

type Entry = { at: string; text: string; ok: boolean };

export function UberTestPage() {
  const [log, setLog] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastOrderId, setLastOrderId] = useState("");
  const [sandboxOrderId, setSandboxOrderId] = useState("");

  async function run(body: Record<string, string>, describe: (data: Record<string, unknown>) => string) {
    setBusy(true);
    let entry: Entry;
    try {
      const res = await authedFetch("/api/uber-eats/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const ok = res.ok && data.ok !== false;
      entry = { at: new Date().toLocaleTimeString(), ok, text: ok ? describe(data) : `Failed (${res.status}): ${String(data.error ?? JSON.stringify(data))}` };
      if (res.ok && typeof data.orderId === "string" && body.action === "simulate_order") setLastOrderId(data.orderId);
    } catch (err) {
      entry = { at: new Date().toLocaleTimeString(), ok: false, text: err instanceof Error ? err.message : "Request failed" };
    }
    setLog((prev) => [entry, ...prev].slice(0, 20));
    setBusy(false);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Uber Eats Test</h1>
          <p>UAT only. Orders created here go to the UAT orders table and appear on the Orders page.</p>
        </div>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h2>Simulate an incoming order</h2>
        <p>Builds a fake Uber order and saves it through the same mapping the real webhook uses. Does not call Uber.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {SCENARIOS.map((s) => (
            <Button
              key={s.key}
              disabled={busy}
              onClick={() =>
                run({ action: "simulate_order", scenario: s.key }, (d) => `Order created: Uber ${String(d.orderId)} (POS ${String(d.posOrderId)}), total $${String(d.total)}`)
              }
            >
              {s.label}
            </Button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Cancel a simulated order</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input
            aria-label="Uber order ID to cancel"
            value={lastOrderId}
            onChange={(e) => setLastOrderId(e.target.value.trim())}
            placeholder="Uber order ID"
            style={{ minWidth: 340 }}
          />
          <Button
            variant="outline"
            disabled={busy || !lastOrderId}
            onClick={() => run({ action: "simulate_cancel", orderId: lastOrderId }, () => `Cancelled ${lastOrderId}`)}
          >
            Cancel order
          </Button>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Replay a real sandbox order</h2>
        <p>Sends a correctly signed webhook for an existing sandbox order. Tests signature check, OAuth, Get Order, save and accept against Uber.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input
            aria-label="Sandbox Uber order ID"
            value={sandboxOrderId}
            onChange={(e) => setSandboxOrderId(e.target.value.trim())}
            placeholder="Sandbox order ID"
            style={{ minWidth: 340 }}
          />
          <Button
            variant="outline"
            disabled={busy || !sandboxOrderId}
            onClick={() =>
              run({ action: "replay_webhook", orderId: sandboxOrderId }, (d) => `Webhook answered ${String(d.webhookStatus)} for ${sandboxOrderId}`)
            }
          >
            Send webhook
          </Button>
        </div>
      </section>

      <section aria-live="polite">
        <h2>Results</h2>
        {log.length === 0 ? <p>No actions yet.</p> : (
          <ul>
            {log.map((e, i) => (
              <li key={i} style={{ color: e.ok ? undefined : "#c0392b" }}>
                {e.at} {e.ok ? "OK" : "Error"}: {e.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
