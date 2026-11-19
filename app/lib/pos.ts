import type { MenuItem, Order, OrderLineItem, OrderModifier, ServiceType } from "./dynamodb";
import { randomUUID } from "node:crypto";

export type PosSelection = { groupId: string; optionId: string };
export type PosLineInput = { menuItemId: string; quantity: number; modifierSelections?: PosSelection[]; instructions?: string };
export type PosOrderInput = { clientRequestId: string; tableLabel: string; serviceType: ServiceType; notes?: string; customerName?: string; items: PosLineInput[] };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function money(value: string): number | null {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

/** Validates device selections against the menu and snapshots current prices. */
export function buildPosOrder(input: PosOrderInput, menu: MenuItem[], server = "POS"): Order | null {
  if (!uuid.test(input.clientRequestId) || !input.tableLabel.trim() || input.tableLabel.length > 80 || !["dine-in", "takeout"].includes(input.serviceType) || input.items.length === 0 || input.items.length > 100 || (input.notes?.length ?? 0) > 2000 || (input.customerName?.length ?? 0) > 160) return null;
  const byId = new Map(menu.filter((item) => item.available).map((item) => [item.id, item]));
  const items: OrderLineItem[] = [];

  for (const line of input.items) {
    const item = byId.get(line.menuItemId);
    if (!item || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100 || (line.instructions?.length ?? 0) > 1000) return null;
    const basePrice = money(item.price);
    if (basePrice === null) return null;
    const selections = line.modifierSelections ?? [];
    if (selections.length > 30 || new Set(selections.map((s) => `${s.groupId}:${s.optionId}`)).size !== selections.length) return null;
    const selectedByGroup = new Map<string, PosSelection[]>();
    for (const selection of selections) {
      if (!selection || typeof selection.groupId !== "string" || typeof selection.optionId !== "string") return null;
      selectedByGroup.set(selection.groupId, [...(selectedByGroup.get(selection.groupId) ?? []), selection]);
    }
    const modifiers: OrderModifier[] = [];
    for (const group of item.modifierGroups ?? []) {
      const selected = selectedByGroup.get(group.id) ?? [];
      if ((group.required && selected.length === 0) || (group.type === "single" && selected.length > 1)) return null;
      for (const selection of selected) {
        const option = group.options.find((candidate) => candidate.id === selection.optionId);
        if (!option || !Number.isFinite(option.price)) return null;
        modifiers.push({ groupId: group.id, group: group.name, id: option.id, name: option.name, price: option.price });
      }
      selectedByGroup.delete(group.id);
    }
    // A selection for a group that does not belong to this item is invalid.
    if (selectedByGroup.size) return null;
    const unitPrice = Math.round((basePrice + modifiers.reduce((total, modifier) => total + modifier.price, 0)) * 100) / 100;
    items.push({ menuItemId: item.id, name: item.name, basePrice, unitPrice, quantity: line.quantity, lineId: randomUUID(), ...(modifiers.length ? { modifiers } : {}), ...(line.instructions?.trim() ? { instructions: line.instructions.trim() } : {}) });
  }
  const subtotal = Math.round(items.reduce((total, line) => total + line.unitPrice * line.quantity, 0) * 100) / 100;
  const now = new Date().toISOString();
  return { id: input.clientRequestId, createdAt: now, tableLabel: input.tableLabel.trim(), server, items, subtotal, tax: 0, tip: 0, total: subtotal, processingFee: 0, netAmount: 0, status: "open", paymentMethod: "cash", notes: input.notes?.trim() ?? "", serviceType: input.serviceType, source: "pos", statusHistory: [{ status: "open", at: now }], ...(input.customerName?.trim() ? { customerName: input.customerName.trim() } : {}) };
}
