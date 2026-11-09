"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, UserPlus, Trash2 } from "lucide-react";
import type { OrderLineItem } from "../lib/dynamodb";

export type SplitBucketResult = {
  label: string;
  items: OrderLineItem[];
  subtotal: number;
};

type SplitCheckDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableLabel: string;
  items: OrderLineItem[];
  formatMoney: (n: number) => string;
  onConfirm: (buckets: SplitBucketResult[]) => void;
  t: (key: string, vars?: Record<string, string>) => string;
};

// Expand line items into individual assignable units.
type Unit = {
  uid: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function SplitCheckDialog({
  open,
  onOpenChange,
  tableLabel,
  items,
  formatMoney,
  onConfirm,
  t,
}: SplitCheckDialogProps) {
  // Expand each line's quantity into separate units.
  const units = useMemo<Unit[]>(() => {
    const out: Unit[] = [];
    items.forEach((line) => {
      for (let i = 0; i < line.quantity; i++) {
        out.push({
          uid: `${line.menuItemId}-${i}`,
          menuItemId: line.menuItemId,
          name: line.name,
          unitPrice: line.unitPrice,
        });
      }
    });
    return out;
  }, [items]);

  // Number of guest buckets (default 2).
  const [guestCount, setGuestCount] = useState(2);
  // unit.uid -> guest index (0-based), or -1 for unassigned.
  const [assignment, setAssignment] = useState<Record<string, number>>({});

  const guests = Array.from({ length: guestCount }, (_, i) => i);

  function assign(uid: string, guest: number) {
    setAssignment((prev) => ({ ...prev, [uid]: guest }));
  }

  function addGuest() {
    setGuestCount((n) => Math.min(n + 1, units.length || 2));
  }

  function removeGuest(guest: number) {
    if (guestCount <= 2) return;
    // Unassign units that were on the removed guest, and shift higher guests down.
    setAssignment((prev) => {
      const next: Record<string, number> = {};
      for (const [uid, g] of Object.entries(prev)) {
        if (g === guest) continue; // becomes unassigned
        next[uid] = g > guest ? g - 1 : g;
      }
      return next;
    });
    setGuestCount((n) => n - 1);
  }

  // Build per-guest buckets from the assignment, re-collapsing units into lines.
  const buckets = useMemo(() => {
    return guests.map((g) => {
      const guestUnits = units.filter((u) => assignment[u.uid] === g);
      const byItem = new Map<string, OrderLineItem>();
      for (const u of guestUnits) {
        const existing = byItem.get(u.menuItemId);
        if (existing) existing.quantity += 1;
        else
          byItem.set(u.menuItemId, {
            menuItemId: u.menuItemId,
            name: u.name,
            unitPrice: u.unitPrice,
            quantity: 1,
          });
      }
      const lineItems = Array.from(byItem.values());
      const subtotal = round2(
        lineItems.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
      );
      return {
        label: t("checkout.guestN", { n: String(g + 1) }),
        items: lineItems,
        subtotal,
      };
    });
  }, [guests, units, assignment, t]);

  const assignedCount = units.filter((u) => assignment[u.uid] != null && assignment[u.uid] >= 0).length;
  const allAssigned = assignedCount === units.length && units.length > 0;
  const nonEmptyBuckets = buckets.filter((b) => b.items.length > 0).length;
  const canConfirm = allAssigned && nonEmptyBuckets >= 2;

  function handleConfirm() {
    onConfirm(
      buckets
        .filter((b) => b.items.length > 0)
        .map((b) => ({ label: b.label, items: b.items, subtotal: b.subtotal }))
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("checkout.splitCheck")} — {t("checkout.table")} {tableLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <p className="text-sm text-[var(--text-muted)]">
            {t("checkout.splitInstructions")}
          </p>

          {/* Guest buckets header with counts */}
          <div className="flex flex-wrap items-center gap-2">
            {guests.map((g) => {
              const b = buckets[g];
              return (
                <span
                  key={g}
                  className="inline-flex items-center gap-1 rounded-full border border-input bg-[var(--surface-muted)] px-2.5 py-1 text-xs"
                >
                  {t("checkout.guestN", { n: String(g + 1) })}:{" "}
                  {formatMoney(b.subtotal)}
                  {guestCount > 2 && (
                    <button
                      type="button"
                      onClick={() => removeGuest(g)}
                      className="ml-1 text-[var(--text-muted)] hover:text-destructive"
                      aria-label={t("checkout.removeGuest")}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addGuest}
              disabled={guestCount >= units.length}
            >
              <UserPlus data-icon="inline-start" />
              {t("checkout.addGuest")}
            </Button>
          </div>

          {/* Units to assign */}
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-input divide-y divide-[var(--border)]">
            {units.map((u) => (
              <div
                key={u.uid}
                className="flex items-center justify-between gap-2 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatMoney(u.unitPrice)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {guests.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => assign(u.uid, g)}
                      className={
                        "h-7 min-w-7 rounded-md border px-2 text-xs transition-colors " +
                        (assignment[u.uid] === g
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-input hover:bg-[var(--surface-muted)]")
                      }
                      aria-label={t("checkout.assignToGuest", {
                        n: String(g + 1),
                      })}
                    >
                      {g + 1}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            {t("checkout.splitAssignedCount", {
              assigned: String(assignedCount),
              total: String(units.length),
            })}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("checkout.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            <Plus data-icon="inline-start" />
            {t("checkout.createSplits")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
