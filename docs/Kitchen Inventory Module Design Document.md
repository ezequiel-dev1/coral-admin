# Kitchen Inventory Module: Design Document

*Custom POS · Version 0.1 · Draft for implementation planning*

## 1. Overview

This document describes the design of a kitchen inventory module for a custom restaurant POS. The module tracks ingredients (not just menu items), automatically depletes stock when orders are sold, supports receiving, waste logging and physical counts, and reports on food cost and variance.

### Goals

- Know, at any moment, the *theoretical* quantity on hand of every tracked ingredient.
- Automatically deplete ingredients when menu items and modifiers are sold.
- Record deliveries, waste and adjustments with a full audit trail.
- Reconcile theoretical stock against physical counts and surface variance.
- Alert staff when items fall below par or reorder levels and suggest purchase orders.
- Report food cost %, cost per plate, and actual vs. theoretical usage.

### Non-goals (for v1)

- Multi-location transfers and central commissary logic (designed for, not built).
- Supplier EDI or invoice OCR integration.
- Lot/batch and expiry-date tracking (FIFO costing is also deferred).
- Forecasting and demand prediction.

## 2. Core Concepts

| Term | Meaning |
| --- | --- |
| Ingredient | A stockable item (e.g. chicken thigh, olive oil, burger bun). |
| Base unit | The smallest unit the system stores quantities in (g, ml, or each). All math happens in base units. |
| Recipe | The list of ingredients and quantities needed to make one menu item. |
| Sub-recipe | A recipe that produces an ingredient itself (e.g. house sauce, pizza dough) used inside other recipes. |
| Modifier | An order option that adds, removes or substitutes ingredients ("extra cheese", "no onion"). |
| Stock movement | An immutable ledger entry that changes an ingredient's quantity. |
| Theoretical stock | Quantity derived from the sum of all movements. |
| Variance | Counted quantity minus theoretical quantity. |
| Par level | The target quantity to have on hand after a delivery. |
| Reorder point | The quantity at which a reorder is triggered. |

## 3. Design Principles

1. **Ledger, not a counter.** Never overwrite a quantity. Every change is an append-only `stock_movement`. Current stock is derived (and cached).
2. **One base unit per ingredient.** Convert at the edges (purchasing, counting, recipes) and store everything in base units.
3. **Progressive setup.** Menu items without recipes still sell. Only linked items deplete stock. The system reports how many items are unlinked.
4. **Reversibility.** Voids, refunds and edits generate compensating movements, never deletions.
5. **Idempotency.** Depletion for a given order line must happen exactly once, even if events are replayed.
6. **Offline tolerance.** Terminals may queue orders offline; depletion is processed server-side when they sync.

## 4. Scope and Phasing Summary

| Phase | Deliverable |
| --- | --- |
| 1 | Ingredients, units, stock ledger, manual adjustments |
| 2 | Recipes, modifiers, automatic depletion on sale |
| 3 | Suppliers, purchase orders, receiving, cost tracking |
| 4 | Waste logging, physical counts, variance |
| 5 | Par levels, alerts, suggested orders, reports and dashboards |

Details are in section 11.

## 5. Architecture

### Components

- **Inventory service (module):** owns ingredients, recipes, movements, POs, counts.
- **Order service (existing POS):** emits events when order lines are sent, voided or refunded.
- **Depletion worker:** consumes order events and writes `stock_movement` rows.
- **Reporting layer:** read-optimized queries or materialized views over movements.
- **Clients:** POS terminal (read-only stock hints), back-office web app (management), mobile counting UI.

### Order-to-depletion flow

1. Server sends an order line (menu item + modifiers + quantity).
2. Order service emits `order_line.sent`.
3. Depletion worker loads the recipe for the item, expands sub-recipes recursively to raw ingredients, and applies modifier deltas.
4. It writes one `stock_movement` per ingredient (type `sale`, `reference_id` = order line id) in a single transaction, and updates the cached `ingredient_stock.quantity`.
5. If a void or refund event arrives, the worker writes reversing movements (type `sale_reversal`) referencing the same order line.
6. If an ingredient crosses its reorder point, an alert record is created.

**When to deplete:** at `sent to kitchen` (recommended), since that is when food is actually committed. Make this a configurable setting, with `on payment` as the alternative.

## 6. Data Model

Schema is PostgreSQL-flavored; adapt types for your database. All quantity columns are stored in the ingredient's base unit.

```sql
-- Reference data
CREATE TABLE supplier (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  lead_time_days INT DEFAULT 1,
  active        BOOLEAN DEFAULT TRUE
);

CREATE TABLE storage_location (
  id    BIGSERIAL PRIMARY KEY,
  name  TEXT NOT NULL,          -- 'Walk-in', 'Dry storage', 'Bar'
  sort_order INT DEFAULT 0       -- matches physical walking order for counts
);

CREATE TABLE ingredient (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT,                         -- 'Protein', 'Dairy', 'Produce'...
  base_unit       TEXT NOT NULL CHECK (base_unit IN ('g','ml','each')),
  current_cost    NUMERIC(12,6) NOT NULL DEFAULT 0,  -- cost per base unit
  par_level       NUMERIC(14,3),
  reorder_point   NUMERIC(14,3),
  default_supplier_id BIGINT REFERENCES supplier(id),
  default_location_id BIGINT REFERENCES storage_location(id),
  is_tracked      BOOLEAN DEFAULT TRUE,
  is_subrecipe    BOOLEAN DEFAULT FALSE,
  active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE ingredient_unit (
  id            BIGSERIAL PRIMARY KEY,
  ingredient_id BIGINT NOT NULL REFERENCES ingredient(id),
  unit_name     TEXT NOT NULL,          -- 'case', 'kg', 'bag', 'portion'
  factor_to_base NUMERIC(14,6) NOT NULL, -- 1 case = 12000 g
  use_for_purchasing BOOLEAN DEFAULT FALSE,
  use_for_counting   BOOLEAN DEFAULT FALSE,
  use_for_recipes    BOOLEAN DEFAULT FALSE,
  UNIQUE (ingredient_id, unit_name)
);

-- Recipes
CREATE TABLE recipe (
  id            BIGSERIAL PRIMARY KEY,
  menu_item_id  BIGINT,                 -- null for sub-recipes
  produces_ingredient_id BIGINT REFERENCES ingredient(id), -- for sub-recipes
  yield_qty     NUMERIC(14,3) NOT NULL DEFAULT 1, -- menu items: 1; sub-recipes: batch yield in base units
  version       INT NOT NULL DEFAULT 1,
  active        BOOLEAN DEFAULT TRUE,
  CHECK (menu_item_id IS NOT NULL OR produces_ingredient_id IS NOT NULL)
);

CREATE TABLE recipe_line (
  id            BIGSERIAL PRIMARY KEY,
  recipe_id     BIGINT NOT NULL REFERENCES recipe(id),
  ingredient_id BIGINT NOT NULL REFERENCES ingredient(id),
  quantity      NUMERIC(14,4) NOT NULL,  -- in base units
  waste_factor  NUMERIC(5,4) DEFAULT 0   -- trim/yield loss, e.g. 0.10
);

CREATE TABLE modifier_recipe_line (
  id            BIGSERIAL PRIMARY KEY,
  modifier_id   BIGINT NOT NULL,
  menu_item_id  BIGINT,                  -- optional: item-specific override
  ingredient_id BIGINT NOT NULL REFERENCES ingredient(id),
  quantity_delta NUMERIC(14,4) NOT NULL  -- positive = add, negative = remove
);

-- Ledger
CREATE TABLE stock_movement (
  id            BIGSERIAL PRIMARY KEY,
  ingredient_id BIGINT NOT NULL REFERENCES ingredient(id),
  location_id   BIGINT REFERENCES storage_location(id),
  quantity_delta NUMERIC(14,4) NOT NULL, -- base units, +/-
  unit_cost     NUMERIC(12,6),           -- cost per base unit at time of movement
  type          TEXT NOT NULL CHECK (type IN (
                  'sale','sale_reversal','receiving','waste',
                  'adjustment','count_correction','production','transfer')),
  reference_type TEXT,                   -- 'order_line','purchase_order','count','waste_log'
  reference_id  BIGINT,
  reason_code   TEXT,
  note          TEXT,
  created_by    BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_movement_idempotent
  ON stock_movement (ingredient_id, type, reference_type, reference_id)
  WHERE type IN ('sale','sale_reversal');
CREATE INDEX ix_movement_ing_time ON stock_movement (ingredient_id, created_at);

-- Cached current stock (derived from ledger)
CREATE TABLE ingredient_stock (
  ingredient_id BIGINT PRIMARY KEY REFERENCES ingredient(id),
  quantity      NUMERIC(14,4) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purchasing
CREATE TABLE purchase_order (
  id            BIGSERIAL PRIMARY KEY,
  supplier_id   BIGINT NOT NULL REFERENCES supplier(id),
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','sent','partial','received','cancelled')),
  expected_date DATE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  received_at   TIMESTAMPTZ
);

CREATE TABLE purchase_order_line (
  id               BIGSERIAL PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL REFERENCES purchase_order(id),
  ingredient_id    BIGINT NOT NULL REFERENCES ingredient(id),
  unit_name        TEXT NOT NULL,           -- purchasing unit
  qty_ordered      NUMERIC(14,3) NOT NULL,
  qty_received     NUMERIC(14,3) DEFAULT 0,
  unit_price       NUMERIC(12,4)            -- per purchasing unit
);

-- Counts and waste
CREATE TABLE stock_count (
  id          BIGSERIAL PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','submitted','approved')),
  location_id BIGINT REFERENCES storage_location(id),
  started_by  BIGINT,
  started_at  TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ
);

CREATE TABLE stock_count_line (
  id              BIGSERIAL PRIMARY KEY,
  stock_count_id  BIGINT NOT NULL REFERENCES stock_count(id),
  ingredient_id   BIGINT NOT NULL REFERENCES ingredient(id),
  counted_qty     NUMERIC(14,4) NOT NULL,   -- base units
  theoretical_qty NUMERIC(14,4) NOT NULL,   -- snapshot at count time
  variance_qty    NUMERIC(14,4) GENERATED ALWAYS AS (counted_qty - theoretical_qty) STORED
);

CREATE TABLE inventory_alert (
  id            BIGSERIAL PRIMARY KEY,
  ingredient_id BIGINT NOT NULL REFERENCES ingredient(id),
  kind          TEXT NOT NULL CHECK (kind IN ('below_reorder','below_zero','below_par')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);
```

## 7. Business Rules

### 7.1 Units and conversion

- Every ingredient has exactly one base unit. Users enter quantities in any configured unit; the API converts to base units before writing.
- Example: *Cheddar, base unit g.* Units: `kg` (1000), `block` (2270, purchasing), `slice` (21, recipe).
- Reject quantities for units not configured on the ingredient.

### 7.2 Recipe expansion

1. Start with the recipe for the sold menu item.
2. For each line, if the ingredient `is_subrecipe`, expand it: scale the sub-recipe lines by `line.quantity / sub_recipe.yield_qty`. Repeat recursively.
3. Apply `waste_factor`: effective quantity = `quantity / (1 - waste_factor)`.
4. Apply modifier deltas (add, remove, substitute). Clamp results at zero per ingredient.
5. Multiply by the order line quantity.
6. Detect cycles at save time and reject recipes that reference themselves, directly or indirectly. Cap recursion depth at 5.

### 7.3 Costing

- v1 uses **weighted average cost**. On receiving: `new_cost = (old_qty * old_cost + recv_qty * recv_cost) / (old_qty + recv_qty)`. If on-hand is zero or negative, use the received cost.
- Every movement stores `unit_cost` at the time, so historical reports stay accurate when costs change.
- Menu item cost = sum of expanded ingredient quantities × current cost. Recomputed on demand or nightly and cached.

### 7.4 Negative stock

- Selling must **never be blocked** by inventory. The kitchen is the source of truth, not the database.
- Stock may go negative; this raises a `below_zero` alert, which typically means a missed receiving, a wrong recipe, or an unlogged transfer.

### 7.5 Voids, refunds, and comps

- **Void before send:** no depletion occurred, nothing to do.
- **Void after send, food not made:** reversal movements restore stock.
- **Void after send, food made (wasted):** do not restore. Optionally auto-create a `waste` movement with reason `order_error` or `comp`.
- The server/manager choosing between those two is a UI decision on the void screen.

### 7.6 Counts and variance

1. User starts a count (optionally per storage location). The system snapshots theoretical quantities.
2. User enters counted quantities in counting units.
3. On approval, the system writes a `count_correction` movement for each line equal to `counted - theoretical_at_approval` (adjusted for any sales that occurred between snapshot and approval), so stock matches reality.
4. Variance is stored on the count line and feeds variance reports.

### 7.7 Reorder logic

- Alert when `quantity <= reorder_point`.
- Suggested order quantity = `par_level - quantity`, rounded up to whole purchasing units.
- Group suggestions by default supplier into draft purchase orders.

## 8. API Surface (REST sketch)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET/POST | `/ingredients` | List, create ingredients |
| PATCH | `/ingredients/{id}` | Update details, par, reorder point |
| GET/PUT | `/ingredients/{id}/units` | Manage unit conversions |
| GET/POST | `/recipes` | Recipes for menu items and sub-recipes |
| PUT | `/recipes/{id}/lines` | Replace recipe lines (creates a new version) |
| GET | `/menu-items/{id}/cost` | Computed plate cost |
| GET | `/stock` | Current stock, filterable by category, location, low-stock |
| GET | `/ingredients/{id}/movements` | Ledger history |
| POST | `/stock/adjustments` | Manual adjustment with reason |
| POST | `/waste` | Log waste |
| POST | `/purchase-orders` | Create PO (or from suggestions) |
| POST | `/purchase-orders/{id}/receive` | Receive lines, update cost and stock |
| POST | `/counts` | Start count |
| PUT | `/counts/{id}/lines` | Save counted quantities |
| POST | `/counts/{id}/approve` | Approve and apply corrections |
| GET | `/reports/variance`, `/reports/food-cost`, `/reports/usage` | Reporting |

**Internal event contract (from the order service):**

```json
{
  "event": "order_line.sent",
  "order_line_id": 88231,
  "menu_item_id": 412,
  "quantity": 2,
  "modifier_ids": [17, 22],
  "occurred_at": "2026-11-27T19:42:10Z"
}
```

Corresponding `order_line.voided` events must carry a `food_made` flag.

## 9. User Interface

### 9.1 Back-office screens

1. **Ingredient list and detail:** search, category filter, columns for on-hand, par, cost, and status badge (OK, low, negative). Detail tab shows units and movement history.
2. **Recipe editor:** pick menu item, add ingredient lines with quantity and unit, live cost per plate and margin against menu price, flag for unlinked items.
3. **Purchase orders:** draft from suggestions, send/export, receive screen with expected vs. received quantity and invoice price entry.
4. **Count sheet (mobile-first):** grouped by storage location in walking order, large numeric inputs, counting-unit labels, running progress, and a "zero everything not entered" safeguard.
5. **Waste log:** quick entry with ingredient picker, quantity, reason code.
6. **Dashboard:** low-stock list, negative-stock alerts, food cost % trend, top variance items, unlinked menu item count.

### 9.2 POS terminal

- Optional low-stock badge or "86 this item" suggestion on the menu grid. Informational only in v1; never blocks ordering.
- Manager-only void flow with a "food made / not made" prompt.

### 9.3 UX guidance

- Counting and receiving are used in a busy, physical environment: big touch targets, minimal typing, numeric keypad by default.
- Show quantities in the unit people actually think in (cases for receiving, portions or kg for counting), but store base units.

## 10. Reports

| Report | Definition |
| --- | --- |
| Current stock valuation | Σ(on-hand × current cost) by category |
| Actual vs. theoretical usage | Usage = opening + received − closing (from counts); theoretical = sum of `sale` movements |
| Variance | Counted − theoretical, in units and currency, sorted by value |
| Food cost % | COGS / net food sales for a period |
| Plate cost and margin | Per menu item, from recipe and current costs |
| Waste summary | By reason, ingredient and period |
| Supplier price history | Cost per purchasing unit over time |

## 11. Implementation Plan

### Phase 1: Foundations

- Tables: `ingredient`, `ingredient_unit`, `storage_location`, `stock_movement`, `ingredient_stock`.
- Movement-writing service with transactional cache update.
- CRUD UI for ingredients; manual adjustment screen.
- **Done when:** adjustments update stock correctly, and the cache can be fully rebuilt from the ledger.

### Phase 2: Recipes and depletion

- Recipes, recipe lines, sub-recipes, modifier lines, cycle detection.
- Order event contract and depletion worker with idempotency.
- Recipe editor with live plate cost.
- **Done when:** a sample order produces the expected movements; replaying the event produces none; a void reverses them.

### Phase 3: Purchasing and costing

- Suppliers, purchase orders, receiving flow, weighted average cost.
- **Done when:** receiving a delivery raises stock, updates average cost, and recalculates plate costs.

### Phase 4: Waste and counts

- Waste log, count sheet UI, snapshot/approve logic, variance storage.
- **Done when:** an approved count brings stock to the counted values and records variance.

### Phase 5: Alerts, suggestions, reporting

- Reorder alerts, suggested POs, dashboard, reports in section 10.
- **Done when:** a manager can go from low-stock alert to sent purchase order in under a minute.

## 12. Testing Strategy

- **Unit tests:** unit conversion, recipe expansion (nested sub-recipes, waste factor, modifiers, clamping), weighted average cost.
- **Property tests:** the sum of ledger movements always equals cached stock; replaying any event stream yields identical results.
- **Integration tests:** order → send → void flows; receiving; count approval with concurrent sales.
- **Concurrency tests:** many simultaneous order lines touching the same ingredient (row locking or atomic increments).
- **Seed data:** build a small realistic menu (burger, pizza with dough sub-recipe, a drink with modifiers) as a fixture for demos and tests.

## 13. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Staff never set up recipes | Progressive setup, unlinked-items dashboard, import from CSV, start with top-cost ingredients only |
| Inaccurate recipe quantities cause constant variance | Waste factors, per-item variance drilldown, versioned recipes |
| Double depletion from retries | Idempotency key and unique index on sale movements |
| Counting is tedious, so it gets skipped | Mobile-first sheet, location ordering, partial counts of high-value items weekly |
| Slow reports on large ledgers | Indexes, daily summary tables or materialized views |
| Menu changes break recipe links | Recipes keyed by menu item id, with warnings on archive |

## 14. Open Questions

1. Single location or multi-location from day one?
2. Deplete on send (recommended) or on payment?
3. Is a bar or beverage inventory (by pour or bottle) in scope?
4. What POS or database stack is this being built on (affects event mechanism and locking approach)?
5. Who are the user roles (server, cook, manager, owner), and who may adjust stock, approve counts and change recipes?
6. Is there an existing menu and modifier schema that recipes must link to?
7. Do you need to import ingredient or supplier data from spreadsheets at launch?
