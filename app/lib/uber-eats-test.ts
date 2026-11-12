import { randomUUID } from "node:crypto";
import type { UberOrder } from "./uber-eats";

/**
 * Synthetic Uber Eats orders for UAT testing. Amounts are in centavos (MXN),
 * exactly as Uber sends them, so they exercise the same conversion as real orders.
 */
export type TestScenario = "simple" | "modifiers" | "large";
export type TestMenuItem = { id: string; title: string; quantity: number; unitPrice: number };

const mxn = (amount: number) => ({ amount, currency_code: "MXN" });

export function buildTestUberOrder(scenario: TestScenario = "simple"): UberOrder {
  const id = randomUUID();
  const base = {
    id,
    display_id: id.slice(0, 5).toUpperCase(),
    current_state: "CREATED",
    type: "PICK_UP",
    store: { id: "uat-test-store" },
    eater: { first_name: "Test", last_name: "Customer" },
    placed_at: new Date().toISOString(),
    estimated_ready_for_pickup_at: new Date(Date.now() + 20 * 60_000).toISOString(),
  };

  if (scenario === "modifiers") {
    return {
      ...base,
      cart: {
        special_instructions: "Test order: no cilantro please",
        items: [
          {
            id: "test-item-1",
            instance_id: "1",
            title: "Taco Plate",
            quantity: 2,
            special_instructions: "Extra salsa",
            price: { unit_price: mxn(19500), base_unit_price: mxn(18000) },
            selected_modifier_groups: [
              { title: "Protein", selected_items: [{ id: "mod-1", title: "Shrimp", price: mxn(1500) }] },
            ],
          },
        ],
      },
      payment: { charges: { sub_total: mxn(39000), tax: mxn(6240), total_fee: mxn(0), total: mxn(45240) } },
    };
  }

  if (scenario === "large") {
    return {
      ...base,
      cart: {
        items: [
          { id: "test-item-2", instance_id: "1", title: "Ceviche", quantity: 3, price: { unit_price: mxn(22000), base_unit_price: mxn(22000) } },
          { id: "test-item-3", instance_id: "2", title: "Grilled Fish", quantity: 4, price: { unit_price: mxn(38000), base_unit_price: mxn(38000) } },
          { id: "test-item-4", instance_id: "3", title: "Horchata", quantity: 6, price: { unit_price: mxn(4500), base_unit_price: mxn(4500) } },
        ],
      },
      payment: { charges: { sub_total: mxn(245000), tax: mxn(39200), total_fee: mxn(0), total: mxn(284200) } },
    };
  }

  return {
    ...base,
    cart: {
      items: [
        { id: "test-item-1", instance_id: "1", title: "Fish Taco", quantity: 1, price: { unit_price: mxn(12000), base_unit_price: mxn(12000) } },
      ],
    },
    payment: { charges: { sub_total: mxn(12000), tax: mxn(1920), total_fee: mxn(0), total: mxn(13920) } },
  };
}

/** Build a UAT-only order from the current synced-menu selection. Prices are centavos. */
export function buildTestUberOrderFromMenu(items: TestMenuItem[]): UberOrder {
  const id = randomUUID();
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  // The platform menu price already represents the customer-facing total for each item.
  return {
    id,
    display_id: id.slice(0, 5).toUpperCase(),
    current_state: "CREATED",
    type: "PICK_UP",
    store: { id: "uat-test-store" },
    eater: { first_name: "Test", last_name: "Customer" },
    placed_at: new Date().toISOString(),
    estimated_ready_for_pickup_at: new Date(Date.now() + 20 * 60_000).toISOString(),
    cart: {
      special_instructions: "Menu-builder order created in UAT",
      items: items.map((item, index) => ({
        id: item.id,
        instance_id: String(index + 1),
        title: item.title,
        quantity: item.quantity,
        price: { unit_price: mxn(item.unitPrice), base_unit_price: mxn(item.unitPrice) },
      })),
    },
    payment: { charges: { sub_total: mxn(subtotal), tax: mxn(0), total_fee: mxn(0), total: mxn(subtotal) } },
  };
}
