"use client";

import { useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { Button } from "@/components/ui/button";
import { printAgent, AgentResult, PrinterName } from "../lib/printAgent";
import { Plug, Printer, Vault } from "lucide-react";

type Action = "status" | "kitchen" | "register" | "both" | "drawer";
type FeedbackLine = { ok: boolean; text: string };

export function PrinterTestPage() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<FeedbackLine[]>([]);

  function describe(r: AgentResult, successText: string): string {
    if (r.ok) return successText;
    switch (r.error) {
      case "network":
        return t("printer.errNetwork");
      case "timeout":
        return t("printer.errTimeout");
      case "unsupported":
        return t("printer.errUnsupported");
      default:
        return r.message || t("printer.errNetwork");
    }
  }

  const printerLabel = (p: PrinterName) => (p === "kitchen" ? t("printer.kitchenLabel") : t("printer.registerLabel"));

  async function run(action: Action) {
    if (busy) return;
    setBusy(action);
    setFeedback([]);
    if (action === "status" || action === "drawer") {
      const result = await (action === "status" ? printAgent.status() : printAgent.openDrawer());
      const okText = action === "status" ? t("printer.connectionOk") : t("printer.commandSent");
      setFeedback([{ ok: result.ok, text: describe(result, okText) }]);
    } else {
      // Each printer is its own request; one failing must not block the other.
      const targets: PrinterName[] = action === "both" ? ["kitchen", "register"] : [action];
      const results = await Promise.all(targets.map((p) => printAgent.testPrint(p)));
      setFeedback(
        results.map((r, i) => ({
          ok: r.ok,
          text: `${printerLabel(targets[i])}: ${describe(r, t("printer.commandSent"))}`,
        })),
      );
    }
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
          <Button onClick={() => run("kitchen")} disabled={busy !== null}>
            <Printer size={16} /> {label("kitchen", t("printer.testKitchen"))}
          </Button>
          <Button onClick={() => run("register")} disabled={busy !== null}>
            <Printer size={16} /> {label("register", t("printer.testRegister"))}
          </Button>
          <Button variant="outline" onClick={() => run("both")} disabled={busy !== null}>
            <Printer size={16} /> {label("both", t("printer.testBoth"))}
          </Button>
          <Button onClick={() => run("drawer")} disabled={busy !== null}>
            <Vault size={16} /> {label("drawer", t("printer.openDrawer"))}
          </Button>
        </div>

        {feedback.length > 0 && (
          <div role="status" style={{ display: "grid", gap: 4 }}>
            {feedback.map((f, i) => (
              <p key={i} style={{ margin: 0, color: f.ok ? "#2e7d5b" : "#c0392b", fontWeight: 500 }}>
                {f.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
