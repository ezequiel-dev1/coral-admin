"use client";

import { useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { Button } from "@/components/ui/button";
import { printAgent, AgentResult } from "../lib/printAgent";
import { Plug, Printer, Vault } from "lucide-react";

type Action = "status" | "print" | "drawer";

export function PrinterTestPage() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function describe(r: AgentResult, successText: string): string {
    if (r.ok) return successText;
    switch (r.error) {
      case "network":
        return t("printer.errNetwork");
      case "timeout":
        return t("printer.errTimeout");
      default:
        return r.message || t("printer.errNetwork");
    }
  }

  async function run(action: Action) {
    if (busy) return;
    setBusy(action);
    setFeedback(null);
    const call =
      action === "status" ? printAgent.status : action === "print" ? printAgent.testPrint : printAgent.openDrawer;
    const result = await call();
    const okText = action === "status" ? t("printer.connectionOk") : t("printer.commandSent");
    setFeedback({ ok: result.ok, text: describe(result, okText) });
    setBusy(null);
  }

  const label = (action: Action, text: string) => (busy === action ? t("printer.working") : text);

  return (
    <>
      <section className="hero-row">
        <div>
          <p className="eyebrow">{t("nav.printerTest")}</p>
          <h1>{t("printer.title")}</h1>
          <p className="subhead">{t("printer.subtitle")}</p>
        </div>
      </section>

      <div className="card" style={{ maxWidth: 560, display: "grid", gap: 16, padding: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button variant="outline" onClick={() => run("status")} disabled={busy !== null}>
            <Plug size={16} /> {label("status", t("printer.testConnection"))}
          </Button>
          <Button onClick={() => run("print")} disabled={busy !== null}>
            <Printer size={16} /> {label("print", t("printer.printTest"))}
          </Button>
          <Button onClick={() => run("drawer")} disabled={busy !== null}>
            <Vault size={16} /> {label("drawer", t("printer.openDrawer"))}
          </Button>
        </div>

        {feedback && (
          <p role="status" style={{ margin: 0, color: feedback.ok ? "#2e7d5b" : "#c0392b", fontWeight: 500 }}>
            {feedback.text}
          </p>
        )}
      </div>
    </>
  );
}
